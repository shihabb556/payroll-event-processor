import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker, Job } from 'bullmq';

import { RedisService } from '../infrastructure/redis/redis.service';
import { PAYROLL_EVENT_QUEUE } from '../infrastructure/queue/queue.constants';
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
      this.logger.error(
        `Job ${job?.id} failed for event ${data?.eventId}: ${err.message}`,
      );
    });

    this.logger.log(
      `Worker started with concurrency ${concurrency} on queue "${queueName}"`,
    );
  }

  private async processJob(job: Job<PayrollJobData>): Promise<void> {
    const eventId: string = job.data.eventId;
    const attempt = job.attemptsMade + 1;

    this.logger.log(
      `Processing job ${job.id} for event ${eventId} (attempt ${attempt})`,
    );

    const event = await this.eventsRepository.findById(eventId);

    if (!event) {
      this.logger.error(`Event ${eventId} not found for job ${job.id}`);
      throw new Error(`Event ${eventId} not found`);
    }

    if (event.status === 'SUCCESS') {
      this.logger.log(
        `Event ${eventId} already processed successfully, skipping`,
      );
      return;
    }

    await this.eventsRepository.markProcessing(eventId);
    await this.eventsRepository.incrementAttemptCount(eventId);

    const handler = this.eventHandlerResolver.resolve(event.eventType);

    if (!handler) {
      const errorMsg = `No handler found for event type: ${event.eventType}`;
      this.logger.error(errorMsg);
      await this.eventsRepository.markFailed(eventId, errorMsg);
      throw new Error(errorMsg);
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
        this.logger.log(
          `Event ${eventId} processed successfully: ${result.message}`,
        );
      } else {
        await this.eventsRepository.markFailed(eventId, result.message);
        throw new Error(result.message);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown processing error';

      const existingEvent = await this.eventsRepository.findById(eventId);
      if (existingEvent?.status === 'PROCESSING') {
        await this.eventsRepository.markFailed(eventId, message);
      }

      throw error;
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.logger.log('Shutting down worker...');
    await this.worker.close();
  }
}
