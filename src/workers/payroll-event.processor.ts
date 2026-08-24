import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker, Job } from 'bullmq';

import { PermanentProcessingError } from '../common/errors';
import { RedisService } from '../infrastructure/redis/redis.service';
import { PAYROLL_EVENT_QUEUE } from '../infrastructure/queue/queue.constants';
import { EventAttemptsRepository } from '../modules/events/repositories/event-attempts.repository';
import { EventsRepository } from '../modules/events/repositories/events.repository';
import { EventHandlerResolver } from './handlers/event-handler.resolver';

interface PayrollJobData {
  eventId: string;
}

@Injectable()
export class PayrollEventProcessor implements OnModuleDestroy {
  private readonly logger = new Logger(PayrollEventProcessor.name);
  private readonly worker: Worker;

  constructor(
    private readonly eventsRepository: EventsRepository,
    private readonly eventAttemptsRepository: EventAttemptsRepository,
    private readonly eventHandlerResolver: EventHandlerResolver,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {
    const queueName =
      this.config.get<string>('QUEUE_NAME') ?? PAYROLL_EVENT_QUEUE;
    const concurrency = this.config.get<number>('WORKER_CONCURRENCY') ?? 5;

    this.worker = new Worker(
      queueName,
      async (job: Job<PayrollJobData>) => {
        return this.processJob(job);
      },
      {
        connection: this.redis.getClient(),
        concurrency,
      },
    );

    this.worker.on('completed', (job) => {
      const data = job.data as PayrollJobData;
      this.logger.log(`Job ${job.id} completed for event ${data.eventId}`);
    });

    this.worker.on('failed', (job, err) => {
      const data = job?.data as PayrollJobData | undefined;

      if (!job || !data) {
        this.logger.error(`Job failed with no data: ${err.message}`);
        return;
      }

      const retriesExhausted = job.attemptsMade >= (job.opts.attempts ?? 1);

      if (retriesExhausted) {
        this.logger.error(
          `Job ${job.id} exhausted all retries for event ${data.eventId}: ${err.message}`,
        );
        this.eventsRepository
          .markFailed(data.eventId, err.message)
          .catch((markErr) => {
            this.logger.error(
              `Failed to mark event ${data.eventId} as FAILED after retry exhaustion: ${markErr instanceof Error ? markErr.message : String(markErr)}`,
            );
          });
      } else {
        this.logger.warn(
          `Job ${job.id} failed for event ${data.eventId} (attempt ${job.attemptsMade}/${job.opts.attempts ?? 'unknown'}): ${err.message}`,
        );
      }
    });

    this.logger.log(
      `Worker started with concurrency ${concurrency} on queue "${queueName}"`,
    );
  }

  private async processJob(job: Job<PayrollJobData>): Promise<void> {
    const eventId: string = job.data.eventId;
    const attemptNumber = job.attemptsMade + 1;

    this.logger.log(
      `Processing job ${job.id} for event ${eventId} (attempt ${attemptNumber})`,
    );

    const event = await this.eventsRepository.findById(eventId);

    if (!event) {
      this.logger.error(`Event ${eventId} not found for job ${job.id}`);
      throw new Error(`Event ${eventId} not found`);
    }

    // Idempotency: if already SUCCESS, skip processing entirely
    if (event.status === 'SUCCESS') {
      this.logger.log(
        `Event ${eventId} already processed successfully, skipping`,
      );
      return;
    }

    // Idempotency: if already FAILED, do not re-process
    if (event.status === 'FAILED') {
      this.logger.log(`Event ${eventId} already permanently failed, skipping`);
      return;
    }

    // Per-employee ordering: check if earlier events for this employee are still pending/processing
    if (event.sequence > 1) {
      const hasPrior = await this.eventsRepository.hasUnprocessedPriorEvents(
        event.employeeId,
        event.sequence,
      );

      if (hasPrior) {
        this.logger.log(
          `Event ${eventId} (employee ${event.employeeId}, seq ${event.sequence}) deferred: earlier events still processing`,
        );
        // Throw so BullMQ retries later with backoff.
        // Do NOT mark as FAILED — this is a temporary ordering block.
        throw new Error(
          `Ordering constraint: earlier events for employee ${event.employeeId} still processing`,
        );
      }
    }

    // Processing claim: atomically transition PENDING → PROCESSING
    const claimed = await this.eventsRepository.claimEvent(eventId);

    if (!claimed) {
      // Event was not PENDING — check if already PROCESSING (retry scenario)
      if (event.status === 'PROCESSING') {
        this.logger.log(
          `Event ${eventId} already PROCESSING, proceeding with retry`,
        );
        const reClaimed = await this.eventsRepository.reClaimEvent(eventId);
        if (!reClaimed) {
          this.logger.error(`Event ${eventId} failed to re-claim, skipping`);
          return;
        }
      } else {
        // Unexpected state — should not happen
        this.logger.error(
          `Event ${eventId} in unexpected state: ${event.status}`,
        );
        return;
      }
    }

    // Increment attempt count
    await this.eventsRepository.incrementAttemptCount(eventId);

    // Record attempt start
    await this.eventAttemptsRepository.recordAttempt({
      eventId,
      attemptNumber,
      status: 'FAILED', // Will be updated on completion
    });

    const handler = this.eventHandlerResolver.resolve(event.eventType);

    if (!handler) {
      const errorMsg = `No handler found for event type: ${event.eventType}`;
      this.logger.error(errorMsg);
      await this.eventsRepository.markFailed(eventId, errorMsg);
      await this.eventAttemptsRepository.recordAttempt({
        eventId,
        attemptNumber,
        status: 'FAILED',
        failureReason: errorMsg,
        completedAt: new Date(),
      });
      return;
    }

    try {
      const result = await handler.process({
        id: event.id,
        employeeId: event.employeeId,
        eventType: event.eventType,
        payload: event.payload as Record<string, unknown>,
      });

      if (result.success) {
        await this.eventsRepository.markSuccess(
          eventId,
          result as unknown as Record<string, unknown>,
        );
        await this.eventAttemptsRepository.recordAttempt({
          eventId,
          attemptNumber,
          status: 'SUCCESS',
        });
        this.logger.log(
          `Event ${eventId} processed successfully: ${result.message}`,
        );
      } else {
        // Permanent failure
        await this.eventsRepository.markFailed(eventId, result.message);
        await this.eventAttemptsRepository.recordAttempt({
          eventId,
          attemptNumber,
          status: 'FAILED',
          failureReason: result.message,
        });
        this.logger.warn(
          `Event ${eventId} permanently failed: ${result.message}`,
        );
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown processing error';

      // Determine if temporary or permanent
      if (error instanceof PermanentProcessingError) {
        await this.eventsRepository.markFailed(eventId, message);
        await this.eventAttemptsRepository.recordAttempt({
          eventId,
          attemptNumber,
          status: 'FAILED',
          failureReason: message,
        });
        this.logger.warn(
          `Event ${eventId} permanently failed (attempt ${attemptNumber}): ${message}`,
        );
        // Don't throw — permanent failure, no BullMQ retry
        return;
      }

      // Temporary failure — record attempt and re-throw for BullMQ retry
      await this.eventAttemptsRepository.recordAttempt({
        eventId,
        attemptNumber,
        status: 'FAILED',
        failureReason: message,
      });
      this.logger.warn(
        `Event ${eventId} processing failed (attempt ${attemptNumber}): ${message}`,
      );
      throw error;
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.logger.log('Shutting down worker...');
    await this.worker.close();
  }
}
