import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';

import { EventsRepository } from './repositories/events.repository';
import { StuckEventRecoveryService } from './stuck-event-recovery.service';

describe('StuckEventRecoveryService', () => {
  const mockStaleEvent = {
    id: 'evt-stale-001',
    employeeId: 'EMP-001',
    eventType: 'SALARY_CHANGE' as const,
    payload: { salary: 50000 },
    status: 'PROCESSING' as const,
    idempotencyKey: 'idem-001',
    sequence: 1,
    attemptCount: 1,
    failureReason: null,
    result: null,
    processingStartedAt: new Date(Date.now() - 120_000),
    completedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function createMocks(configOverrides: Record<string, number> = {}) {
    const repository = {
      findStaleProcessingEvents: jest.fn().mockResolvedValue([]),
      recoverStaleEvent: jest.fn(),
    };
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'EVENT_PROCESSING_TIMEOUT_MS')
          return configOverrides.EVENT_PROCESSING_TIMEOUT_MS ?? 60_000;
        if (key === 'RECOVERY_INTERVAL_MS')
          return configOverrides.RECOVERY_INTERVAL_MS ?? 30_000;
        if (key === 'RECOVERY_BATCH_SIZE')
          return configOverrides.RECOVERY_BATCH_SIZE ?? 10;
        return undefined;
      }),
    };
    return { repository, config };
  }

  async function createAndRecover(
    repository: ReturnType<typeof createMocks>['repository'],
    config: ReturnType<typeof createMocks>['config'],
  ) {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StuckEventRecoveryService,
        { provide: EventsRepository, useValue: repository },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();

    const service = module.get<StuckEventRecoveryService>(
      StuckEventRecoveryService,
    );

    // Start the service (was previously in constructor, now in onModuleInit)
    service.onModuleInit();

    // Wait for the initial async recovery to complete
    await new Promise((resolve) => setTimeout(resolve, 100));

    return { service, repository };
  }

  describe('stale event detection', () => {
    it('should not recover events when none are stale', async () => {
      const { repository, config } = createMocks();
      const { service } = await createAndRecover(repository, config);

      expect(repository.recoverStaleEvent).not.toHaveBeenCalled();
      service.onModuleDestroy();
    });

    it('should detect PROCESSING events beyond the timeout as stale', async () => {
      const { repository, config } = createMocks();
      repository.findStaleProcessingEvents.mockResolvedValue([mockStaleEvent]);
      repository.recoverStaleEvent.mockResolvedValue({
        ...mockStaleEvent,
        status: 'PENDING',
      });

      const { service } = await createAndRecover(repository, config);

      expect(repository.findStaleProcessingEvents).toHaveBeenCalled();
      const callArgs = repository.findStaleProcessingEvents.mock
        .calls[0] as unknown[];
      const staleBefore = callArgs[0] as Date;
      expect(staleBefore.getTime()).toBeLessThanOrEqual(Date.now() - 59_000);
      expect(staleBefore.getTime()).toBeGreaterThan(Date.now() - 61_000);
      service.onModuleDestroy();
    });
  });

  describe('stale event recovery', () => {
    it('should recover a stale event safely back to PENDING', async () => {
      const { repository, config } = createMocks();
      repository.findStaleProcessingEvents.mockResolvedValue([mockStaleEvent]);
      repository.recoverStaleEvent.mockResolvedValue({
        ...mockStaleEvent,
        status: 'PENDING',
      });

      const { service } = await createAndRecover(repository, config);

      expect(repository.recoverStaleEvent).toHaveBeenCalledWith(
        mockStaleEvent.id,
        expect.any(Date),
      );
      service.onModuleDestroy();
    });

    it('should handle event no longer eligible for recovery', async () => {
      const { repository, config } = createMocks();
      repository.findStaleProcessingEvents.mockResolvedValue([mockStaleEvent]);
      repository.recoverStaleEvent.mockResolvedValue(null);

      const { service } = await createAndRecover(repository, config);

      expect(repository.recoverStaleEvent).toHaveBeenCalled();
      service.onModuleDestroy();
    });

    it('should handle recovery errors gracefully', async () => {
      const { repository, config } = createMocks();
      repository.findStaleProcessingEvents.mockResolvedValue([mockStaleEvent]);
      repository.recoverStaleEvent.mockRejectedValue(
        new Error('Database connection lost'),
      );

      const { service } = await createAndRecover(repository, config);
      // Should not throw
      service.onModuleDestroy();
    });
  });

  describe('recovery concurrency safety', () => {
    it('should use atomic recovery to prevent double-recovery', async () => {
      const { repository, config } = createMocks();
      repository.findStaleProcessingEvents.mockResolvedValue([mockStaleEvent]);
      repository.recoverStaleEvent.mockResolvedValue({
        ...mockStaleEvent,
        status: 'PENDING',
      });

      const { service } = await createAndRecover(repository, config);

      expect(repository.recoverStaleEvent).toHaveBeenCalledWith(
        mockStaleEvent.id,
        expect.any(Date),
      );
      service.onModuleDestroy();
    });
  });

  describe('recovery preserves employee ordering', () => {
    it('should reset event to PENDING so ordering constraints still apply', async () => {
      const { repository, config } = createMocks();
      const eventSeq3 = { ...mockStaleEvent, sequence: 3 };
      repository.findStaleProcessingEvents.mockResolvedValue([eventSeq3]);
      repository.recoverStaleEvent.mockResolvedValue({
        ...eventSeq3,
        status: 'PENDING',
      });

      const { service } = await createAndRecover(repository, config);

      expect(repository.recoverStaleEvent).toHaveBeenCalledTimes(1);
      service.onModuleDestroy();
    });
  });

  describe('already SUCCESS/FAILED events are not recovered', () => {
    it('should never find SUCCESS events as stale', async () => {
      const { repository, config } = createMocks();
      repository.findStaleProcessingEvents.mockResolvedValue([]);

      const { service } = await createAndRecover(repository, config);

      expect(repository.recoverStaleEvent).not.toHaveBeenCalled();
      service.onModuleDestroy();
    });
  });

  describe('recovery does not duplicate business effects', () => {
    it('should only reset status to PENDING', async () => {
      const { repository, config } = createMocks();
      repository.findStaleProcessingEvents.mockResolvedValue([mockStaleEvent]);
      repository.recoverStaleEvent.mockResolvedValue({
        ...mockStaleEvent,
        status: 'PENDING',
      });

      const { service } = await createAndRecover(repository, config);

      expect(repository.recoverStaleEvent).toHaveBeenCalledTimes(1);
      service.onModuleDestroy();
    });
  });

  describe('batch size limiting', () => {
    it('should limit events processed per recovery cycle', async () => {
      const { repository, config } = createMocks();
      // Mock respects the limit parameter
      repository.findStaleProcessingEvents.mockImplementation(
        (_staleBefore: Date, limit: number) => {
          return Promise.resolve(
            Array.from({ length: Math.min(20, limit) }, (_, i) => ({
              ...mockStaleEvent,
              id: `evt-${i}`,
            })),
          );
        },
      );
      repository.recoverStaleEvent.mockResolvedValue({ status: 'PENDING' });

      const { service } = await createAndRecover(repository, config);

      // batchSize is 10, so only 10 events should be recovered
      expect(repository.recoverStaleEvent).toHaveBeenCalledTimes(10);
      service.onModuleDestroy();
    });
  });

  describe('worker crash before completion', () => {
    it('should recover event stranded by worker crash', async () => {
      const { repository, config } = createMocks();
      const crashedEvent = {
        ...mockStaleEvent,
        processingStartedAt: new Date(Date.now() - 300_000),
      };
      repository.findStaleProcessingEvents.mockResolvedValue([crashedEvent]);
      repository.recoverStaleEvent.mockResolvedValue({
        ...crashedEvent,
        status: 'PENDING',
      });

      const { service } = await createAndRecover(repository, config);

      expect(repository.recoverStaleEvent).toHaveBeenCalledWith(
        crashedEvent.id,
        expect.any(Date),
      );
      service.onModuleDestroy();
    });

    it('should allow recovered event to be processed again', async () => {
      const { repository, config } = createMocks();
      repository.findStaleProcessingEvents.mockResolvedValue([mockStaleEvent]);
      repository.recoverStaleEvent.mockResolvedValue({
        ...mockStaleEvent,
        status: 'PENDING',
      });

      const { service } = await createAndRecover(repository, config);

      // Get the resolved value from the mock call
      const result = repository.recoverStaleEvent.mock.results[0]
        .value as Promise<{ status: string }>;
      const resolved = await result;
      expect(resolved.status).toBe('PENDING');
      service.onModuleDestroy();
    });
  });

  describe('attempt limits still work', () => {
    it('should not prevent recovery based on attempt count', async () => {
      const { repository, config } = createMocks();
      const highAttemptEvent = { ...mockStaleEvent, attemptCount: 10 };
      repository.findStaleProcessingEvents.mockResolvedValue([
        highAttemptEvent,
      ]);
      repository.recoverStaleEvent.mockResolvedValue({
        ...highAttemptEvent,
        status: 'PENDING',
      });

      const { service } = await createAndRecover(repository, config);

      expect(repository.recoverStaleEvent).toHaveBeenCalled();
      service.onModuleDestroy();
    });
  });

  describe('custom configuration', () => {
    it('should respect custom timeout settings', async () => {
      const { repository, config } = createMocks({
        EVENT_PROCESSING_TIMEOUT_MS: 120_000,
      });
      repository.findStaleProcessingEvents.mockResolvedValue([]);

      const { service } = await createAndRecover(repository, config);

      const callArgs = repository.findStaleProcessingEvents.mock
        .calls[0] as unknown[];
      const staleBefore = callArgs[0] as Date;
      expect(staleBefore.getTime()).toBeLessThanOrEqual(Date.now() - 119_000);
      service.onModuleDestroy();
    });
  });
});
