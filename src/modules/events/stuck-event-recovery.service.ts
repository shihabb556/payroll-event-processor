import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { EventsRepository } from './repositories/events.repository';

const DEFAULT_PROCESSING_TIMEOUT_MS = 60_000; // 1 minute
const DEFAULT_RECOVERY_INTERVAL_MS = 30_000; // 30 seconds
const DEFAULT_RECOVERY_BATCH_SIZE = 10;

@Injectable()
export class StuckEventRecoveryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(StuckEventRecoveryService.name);
  private intervalHandle: ReturnType<typeof setInterval> | undefined;

  private readonly processingTimeoutMs: number;
  private readonly recoveryIntervalMs: number;
  private readonly batchSize: number;

  constructor(
    private readonly eventsRepository: EventsRepository,
    private readonly config: ConfigService,
  ) {
    this.processingTimeoutMs =
      this.config.get<number>('EVENT_PROCESSING_TIMEOUT_MS') ??
      DEFAULT_PROCESSING_TIMEOUT_MS;
    this.recoveryIntervalMs =
      this.config.get<number>('RECOVERY_INTERVAL_MS') ??
      DEFAULT_RECOVERY_INTERVAL_MS;
    this.batchSize =
      this.config.get<number>('RECOVERY_BATCH_SIZE') ??
      DEFAULT_RECOVERY_BATCH_SIZE;
  }

  onModuleInit(): void {
    this.logger.log(
      `Stuck event recovery started: timeout=${this.processingTimeoutMs}ms, interval=${this.recoveryIntervalMs}ms, batchSize=${this.batchSize}`,
    );

    // Run an immediate check on startup, then on interval
    this.runRecovery().catch((err) => {
      this.logger.error(
        `Initial recovery check failed: ${extractErrorMessage(err)}`,
      );
    });

    this.intervalHandle = setInterval(() => {
      this.runRecovery().catch((err) => {
        this.logger.error(
          `Recovery check failed: ${extractErrorMessage(err)}`,
        );
      });
    }, this.recoveryIntervalMs);
  }

  private async runRecovery(): Promise<void> {
    const staleBefore = new Date(Date.now() - this.processingTimeoutMs);

    const staleEvents = await this.eventsRepository.findStaleProcessingEvents(
      staleBefore,
      this.batchSize,
    );

    if (staleEvents.length === 0) {
      return;
    }

    this.logger.warn(
      `Found ${staleEvents.length} stale PROCESSING event(s), attempting recovery`,
    );

    for (const event of staleEvents) {
      try {
        const recovered = await this.eventsRepository.recoverStaleEvent(
          event.id,
          staleBefore,
        );

        if (recovered) {
          this.logger.warn(
            `Recovered stale event ${event.id} (employee ${event.employeeId}, ` +
              `seq ${event.sequence}, attemptCount ${event.attemptCount}, ` +
              `processingStartedAt ${event.processingStartedAt?.toISOString() ?? 'unknown'}) → PENDING`,
          );
        } else {
          // Event was already recovered by another instance or progressed
          this.logger.log(
            `Event ${event.id} no longer eligible for recovery (already progressed)`,
          );
        }
      } catch (err) {
        this.logger.error(
          `Failed to recover event ${event.id}: ${extractErrorMessage(err)}`,
        );
      }
    }
  }

  onModuleDestroy(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
    }
    this.logger.log('Stuck event recovery stopped');
  }
}

/**
 * Extract a useful error message from the error chain.
 * Drizzle wraps the real DB error as `cause`, so a top-level
 * `.message` is often just "Failed query: <SQL>".
 */
function extractErrorMessage(err: unknown): string {
  if (err && typeof err === 'object') {
    const obj = err as Record<string, unknown>;

    // Drizzle stores the original Postgres error in .cause
    const cause = obj.cause;
    if (cause && typeof cause === 'object' && 'message' in cause) {
      const causeMsg = (cause as { message: string }).message;
      return `${obj.message ?? 'Unknown error'} (cause: ${causeMsg})`;
    }

    if (typeof obj.message === 'string') {
      return obj.message;
    }
  }

  return String(err);
}
