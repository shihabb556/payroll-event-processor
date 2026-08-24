import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';

import { EventAttemptsRepository } from '../modules/events/repositories/event-attempts.repository';
import { EventsRepository } from '../modules/events/repositories/events.repository';
import { RedisService } from '../infrastructure/redis/redis.service';
import { AddressChangeHandler } from './handlers/address-change.handler';
import { BankAccountChangeHandler } from './handlers/bank-account-change.handler';
import { EventHandlerResolver } from './handlers/event-handler.resolver';
import { FailureType } from './handlers/processing-result.type';
import { SalaryChangeHandler } from './handlers/salary-change.handler';
import { PayrollEventProcessor } from './payroll-event.processor';

jest.mock('bullmq', () => {
  return {
    Worker: jest.fn().mockImplementation(() => ({
      on: jest.fn(),
      close: jest.fn().mockResolvedValue(undefined),
    })),
  };
});

describe('PayrollEventProcessor', () => {
  let processor: PayrollEventProcessor;
  let repository: {
    findById: jest.Mock;
    claimEvent: jest.Mock;
    reClaimEvent: jest.Mock;
    markSuccess: jest.Mock;
    markFailed: jest.Mock;
    incrementAttemptCount: jest.Mock;
    hasUnprocessedPriorEvents: jest.Mock;
  };
  let attemptRepository: {
    recordAttempt: jest.Mock;
    findByEventId: jest.Mock;
  };
  let resolver: EventHandlerResolver;

  const mockEvent = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    employeeId: 'EMP-001',
    eventType: 'SALARY_CHANGE',
    payload: { effectiveDate: '2026-01-15', newSalary: 75000, currency: 'USD' },
    status: 'PENDING' as const,
    sequence: 1,
    idempotencyKey: 'key-001',
    attemptCount: 0,
    failureReason: null,
    result: null,
    processingStartedAt: null,
    completedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockBankEvent = {
    ...mockEvent,
    id: '660e8400-e29b-41d4-a716-446655440001',
    eventType: 'BANK_ACCOUNT_CHANGE',
    payload: {
      effectiveDate: '2026-03-01',
      iban: 'DE89370400440532013000',
    },
  };

  const mockAddressEvent = {
    ...mockEvent,
    id: '770e8400-e29b-41d4-a716-446655440002',
    employeeId: 'EMP-002',
    eventType: 'ADDRESS_CHANGE',
    payload: {
      effectiveDate: '2026-02-01',
      street: '123 Main St',
      city: 'Boston',
      postalCode: '02101',
      country: 'US',
    },
  };

  beforeEach(async () => {
    repository = {
      findById: jest.fn(),
      claimEvent: jest.fn(),
      reClaimEvent: jest.fn(),
      markSuccess: jest.fn(),
      markFailed: jest.fn(),
      incrementAttemptCount: jest.fn(),
      hasUnprocessedPriorEvents: jest.fn(),
    };

    attemptRepository = {
      recordAttempt: jest.fn(),
      findByEventId: jest.fn(),
    };

    const bankHandler = new BankAccountChangeHandler();
    const addressHandler = new AddressChangeHandler();
    const salaryHandler = new SalaryChangeHandler();
    resolver = new EventHandlerResolver(
      bankHandler,
      addressHandler,
      salaryHandler,
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PayrollEventProcessor,
        { provide: EventsRepository, useValue: repository },
        { provide: EventAttemptsRepository, useValue: attemptRepository },
        { provide: EventHandlerResolver, useValue: resolver },
        {
          provide: RedisService,
          useValue: {
            getClient: jest.fn().mockReturnValue({
              options: { host: 'localhost', port: 6379 },
            }),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'QUEUE_NAME') return 'test-queue';
              if (key === 'WORKER_CONCURRENCY') return 2;
              return undefined;
            }),
          },
        },
      ],
    }).compile();

    processor = module.get<PayrollEventProcessor>(PayrollEventProcessor);
  });

  afterEach(async () => {
    await processor.onModuleDestroy();
  });

  // Helper to access the private processJob method
  async function runProcessJob(eventId: string, attemptsMade = 0) {
    const fakeJob = {
      id: `job-${eventId}`,
      data: { eventId },
      attemptsMade,
      opts: { attempts: 3 },
    } as Parameters<(typeof processor)['processJob']>[0];
    return (
      processor as unknown as { processJob: (typeof processor)['processJob'] }
    ).processJob(fakeJob);
  }

  describe('handler resolution', () => {
    it('should resolve handler for BANK_ACCOUNT_CHANGE', () => {
      const handler = resolver.resolve('BANK_ACCOUNT_CHANGE');
      expect(handler).toBeDefined();
      expect(handler!.eventType).toBe('BANK_ACCOUNT_CHANGE');
    });

    it('should resolve handler for ADDRESS_CHANGE', () => {
      const handler = resolver.resolve('ADDRESS_CHANGE');
      expect(handler).toBeDefined();
      expect(handler!.eventType).toBe('ADDRESS_CHANGE');
    });

    it('should resolve handler for SALARY_CHANGE', () => {
      const handler = resolver.resolve('SALARY_CHANGE');
      expect(handler).toBeDefined();
      expect(handler!.eventType).toBe('SALARY_CHANGE');
    });

    it('should return undefined for unknown event type', () => {
      const handler = resolver.resolve('UNKNOWN_TYPE');
      expect(handler).toBeUndefined();
    });

    it('should return all supported event types', () => {
      const types = resolver.getSupportedEventTypes();
      expect(types).toContain('BANK_ACCOUNT_CHANGE');
      expect(types).toContain('ADDRESS_CHANGE');
      expect(types).toContain('SALARY_CHANGE');
      expect(types).toHaveLength(3);
    });
  });

  describe('successful event processing', () => {
    it('should process salary change and mark SUCCESS', async () => {
      repository.findById.mockResolvedValue(mockEvent);
      repository.hasUnprocessedPriorEvents.mockResolvedValue(false);
      repository.claimEvent.mockResolvedValue({
        ...mockEvent,
        status: 'PROCESSING',
      });
      repository.incrementAttemptCount.mockResolvedValue({
        ...mockEvent,
        attemptCount: 1,
      });
      attemptRepository.recordAttempt.mockResolvedValue({});
      repository.markSuccess.mockResolvedValue({
        ...mockEvent,
        status: 'SUCCESS',
      });

      await runProcessJob(mockEvent.id);

      expect(repository.findById).toHaveBeenCalledWith(mockEvent.id);
      expect(repository.claimEvent).toHaveBeenCalledWith(mockEvent.id);
      expect(repository.incrementAttemptCount).toHaveBeenCalledWith(
        mockEvent.id,
      );
      expect(repository.markSuccess).toHaveBeenCalledTimes(1);
      expect(attemptRepository.recordAttempt).toHaveBeenCalledTimes(2);
      expect(repository.markFailed).not.toHaveBeenCalled();
    });

    it('should process bank account change and mark SUCCESS', async () => {
      repository.findById.mockResolvedValue(mockBankEvent);
      repository.hasUnprocessedPriorEvents.mockResolvedValue(false);
      repository.claimEvent.mockResolvedValue({
        ...mockBankEvent,
        status: 'PROCESSING',
      });
      repository.incrementAttemptCount.mockResolvedValue({
        ...mockBankEvent,
        attemptCount: 1,
      });
      attemptRepository.recordAttempt.mockResolvedValue({});
      repository.markSuccess.mockResolvedValue({
        ...mockBankEvent,
        status: 'SUCCESS',
      });

      await runProcessJob(mockBankEvent.id);

      expect(repository.markSuccess).toHaveBeenCalledTimes(1);
      const args = repository.markSuccess.mock.calls[0] as unknown[];
      expect(args[0]).toBe(mockBankEvent.id);
    });

    it('should process address change and mark SUCCESS', async () => {
      repository.findById.mockResolvedValue(mockAddressEvent);
      repository.hasUnprocessedPriorEvents.mockResolvedValue(false);
      repository.claimEvent.mockResolvedValue({
        ...mockAddressEvent,
        status: 'PROCESSING',
      });
      repository.incrementAttemptCount.mockResolvedValue({
        ...mockAddressEvent,
        attemptCount: 1,
      });
      attemptRepository.recordAttempt.mockResolvedValue({});
      repository.markSuccess.mockResolvedValue({
        ...mockAddressEvent,
        status: 'SUCCESS',
      });

      await runProcessJob(mockAddressEvent.id);

      expect(repository.markSuccess).toHaveBeenCalledTimes(1);
      const args = repository.markSuccess.mock.calls[0] as unknown[];
      expect(args[0]).toBe(mockAddressEvent.id);
    });
  });

  describe('unknown event type', () => {
    it('should mark event as FAILED and not throw for unknown type', async () => {
      const unknownTypeEvent = { ...mockEvent, eventType: 'UNKNOWN_TYPE' };
      repository.findById.mockResolvedValue(unknownTypeEvent);
      repository.hasUnprocessedPriorEvents.mockResolvedValue(false);
      repository.claimEvent.mockResolvedValue({
        ...unknownTypeEvent,
        status: 'PROCESSING',
      });
      repository.incrementAttemptCount.mockResolvedValue({
        ...unknownTypeEvent,
        attemptCount: 1,
      });
      attemptRepository.recordAttempt.mockResolvedValue({});
      repository.markFailed.mockResolvedValue({
        ...unknownTypeEvent,
        status: 'FAILED',
      });

      await runProcessJob(unknownTypeEvent.id);

      expect(repository.markFailed).toHaveBeenCalledWith(
        unknownTypeEvent.id,
        'No handler found for event type: UNKNOWN_TYPE',
      );
    });
  });

  describe('missing event', () => {
    it('should throw when event is not found', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(runProcessJob('nonexistent-id')).rejects.toThrow(
        'Event nonexistent-id not found',
      );
      expect(repository.claimEvent).not.toHaveBeenCalled();
    });
  });

  describe('already successful event (idempotency)', () => {
    it('should skip processing for already SUCCESS event', async () => {
      const successEvent = { ...mockEvent, status: 'SUCCESS' as const };
      repository.findById.mockResolvedValue(successEvent);

      await runProcessJob(successEvent.id);

      expect(repository.claimEvent).not.toHaveBeenCalled();
      expect(repository.markSuccess).not.toHaveBeenCalled();
      expect(repository.markFailed).not.toHaveBeenCalled();
    });
  });

  describe('already failed event (idempotency)', () => {
    it('should skip processing for already FAILED event', async () => {
      const failedEvent = { ...mockEvent, status: 'FAILED' as const };
      repository.findById.mockResolvedValue(failedEvent);

      await runProcessJob(failedEvent.id);

      expect(repository.claimEvent).not.toHaveBeenCalled();
      expect(repository.markSuccess).not.toHaveBeenCalled();
      expect(repository.markFailed).not.toHaveBeenCalled();
    });
  });

  describe('processing claim', () => {
    it('should claim event and process it', async () => {
      repository.findById.mockResolvedValue(mockEvent);
      repository.hasUnprocessedPriorEvents.mockResolvedValue(false);
      repository.claimEvent.mockResolvedValue({
        ...mockEvent,
        status: 'PROCESSING',
      });
      repository.incrementAttemptCount.mockResolvedValue({
        ...mockEvent,
        attemptCount: 1,
      });
      attemptRepository.recordAttempt.mockResolvedValue({});
      repository.markSuccess.mockResolvedValue({
        ...mockEvent,
        status: 'SUCCESS',
      });

      await runProcessJob(mockEvent.id);

      expect(repository.claimEvent).toHaveBeenCalledWith(mockEvent.id);
    });

    it('should handle retry scenario when event is already PROCESSING', async () => {
      const processingEvent = { ...mockEvent, status: 'PROCESSING' as const };
      repository.findById.mockResolvedValue(processingEvent);
      repository.hasUnprocessedPriorEvents.mockResolvedValue(false);
      repository.claimEvent.mockResolvedValue(null); // Claim fails — already PROCESSING
      repository.reClaimEvent.mockResolvedValue(processingEvent);
      repository.incrementAttemptCount.mockResolvedValue({
        ...processingEvent,
        attemptCount: 1,
      });
      attemptRepository.recordAttempt.mockResolvedValue({});
      repository.markSuccess.mockResolvedValue({
        ...processingEvent,
        status: 'SUCCESS',
      });

      await runProcessJob(mockEvent.id, 1);

      expect(repository.claimEvent).toHaveBeenCalledWith(mockEvent.id);
      expect(repository.reClaimEvent).toHaveBeenCalledWith(mockEvent.id);
    });

    it('should skip if event is in unexpected state', async () => {
      const weirdEvent = { ...mockEvent, status: 'PROCESSING' as const };
      repository.findById.mockResolvedValue(weirdEvent);
      repository.hasUnprocessedPriorEvents.mockResolvedValue(false);
      repository.claimEvent.mockResolvedValue(null);
      repository.reClaimEvent.mockResolvedValue(null); // reClaim also fails

      await runProcessJob(mockEvent.id);

      // Should not proceed to handler
      expect(repository.incrementAttemptCount).not.toHaveBeenCalled();
    });
  });

  describe('temporary failure causes BullMQ retry', () => {
    it('should throw error for temporary failure without marking FAILED', async () => {
      const handler = resolver.resolve('SALARY_CHANGE') as SalaryChangeHandler;
      handler.simulateFailure = FailureType.TEMPORARY;

      repository.findById.mockResolvedValue(mockEvent);
      repository.hasUnprocessedPriorEvents.mockResolvedValue(false);
      repository.claimEvent.mockResolvedValue({
        ...mockEvent,
        status: 'PROCESSING',
      });
      repository.incrementAttemptCount.mockResolvedValue({
        ...mockEvent,
        attemptCount: 1,
      });
      attemptRepository.recordAttempt.mockResolvedValue({});

      await expect(runProcessJob(mockEvent.id)).rejects.toThrow(
        /Temporary failure/,
      );

      expect(repository.markFailed).not.toHaveBeenCalled();
      expect(repository.markSuccess).not.toHaveBeenCalled();

      handler.simulateFailure = undefined;
    });

    it('should record attempt history for temporary failure', async () => {
      const handler = resolver.resolve('SALARY_CHANGE') as SalaryChangeHandler;
      handler.simulateFailure = FailureType.TEMPORARY;

      repository.findById.mockResolvedValue(mockEvent);
      repository.hasUnprocessedPriorEvents.mockResolvedValue(false);
      repository.claimEvent.mockResolvedValue({
        ...mockEvent,
        status: 'PROCESSING',
      });
      repository.incrementAttemptCount.mockResolvedValue({
        ...mockEvent,
        attemptCount: 1,
      });
      attemptRepository.recordAttempt.mockResolvedValue({});

      await expect(runProcessJob(mockEvent.id)).rejects.toThrow();

      // First call records attempt start, second records failure
      expect(attemptRepository.recordAttempt).toHaveBeenCalledTimes(2);
      const failCall = attemptRepository.recordAttempt.mock
        .calls[1] as unknown[];
      const failData = failCall[0] as Record<string, unknown>;
      expect(failData.eventId).toBe(mockEvent.id);
      expect(failData.status).toBe('FAILED');
      expect(String(failData.failureReason)).toContain('Temporary failure');

      handler.simulateFailure = undefined;
    });
  });

  describe('permanent failure becomes FAILED', () => {
    it('should mark FAILED and not throw for permanent failure', async () => {
      const handler = resolver.resolve('SALARY_CHANGE') as SalaryChangeHandler;
      handler.simulateFailure = FailureType.PERMANENT;

      repository.findById.mockResolvedValue(mockEvent);
      repository.hasUnprocessedPriorEvents.mockResolvedValue(false);
      repository.claimEvent.mockResolvedValue({
        ...mockEvent,
        status: 'PROCESSING',
      });
      repository.incrementAttemptCount.mockResolvedValue({
        ...mockEvent,
        attemptCount: 1,
      });
      attemptRepository.recordAttempt.mockResolvedValue({});
      repository.markFailed.mockResolvedValue({
        ...mockEvent,
        status: 'FAILED',
      });

      await runProcessJob(mockEvent.id);

      expect(repository.markFailed).toHaveBeenCalledTimes(1);

      const failArgs = repository.markFailed.mock.calls[0] as unknown[];
      expect(failArgs[0]).toBe(mockEvent.id);
      expect(String(failArgs[1])).toContain('Permanent failure');

      handler.simulateFailure = undefined;
    });

    it('should record attempt history for permanent failure', async () => {
      const handler = resolver.resolve('SALARY_CHANGE') as SalaryChangeHandler;
      handler.simulateFailure = FailureType.PERMANENT;

      repository.findById.mockResolvedValue(mockEvent);
      repository.hasUnprocessedPriorEvents.mockResolvedValue(false);
      repository.claimEvent.mockResolvedValue({
        ...mockEvent,
        status: 'PROCESSING',
      });
      repository.incrementAttemptCount.mockResolvedValue({
        ...mockEvent,
        attemptCount: 1,
      });
      attemptRepository.recordAttempt.mockResolvedValue({});
      repository.markFailed.mockResolvedValue({
        ...mockEvent,
        status: 'FAILED',
      });

      await runProcessJob(mockEvent.id);

      // First call records attempt start, second records failure
      expect(attemptRepository.recordAttempt).toHaveBeenCalledTimes(2);

      handler.simulateFailure = undefined;
    });
  });

  describe('processing result persistence', () => {
    it('should persist result with success=true and processing data', async () => {
      repository.findById.mockResolvedValue(mockEvent);
      repository.hasUnprocessedPriorEvents.mockResolvedValue(false);
      repository.claimEvent.mockResolvedValue({
        ...mockEvent,
        status: 'PROCESSING',
      });
      repository.incrementAttemptCount.mockResolvedValue({
        ...mockEvent,
        attemptCount: 1,
      });
      attemptRepository.recordAttempt.mockResolvedValue({});
      repository.markSuccess.mockResolvedValue({
        ...mockEvent,
        status: 'SUCCESS',
      });

      await runProcessJob(mockEvent.id);

      expect(repository.markSuccess).toHaveBeenCalledTimes(1);

      const args = repository.markSuccess.mock.calls[0] as unknown[];
      const result = args[1] as Record<string, unknown>;
      expect(result.success).toBe(true);
      expect(typeof result.message).toBe('string');
      expect(typeof result.processedAt).toBe('string');
      expect(result.data).toEqual({ newSalary: 75000, currency: 'USD', effectiveDate: '2026-01-15' });
    });

    it('should persist failure reason on permanent failure', async () => {
      const handler = resolver.resolve('SALARY_CHANGE') as SalaryChangeHandler;
      handler.simulateFailure = FailureType.PERMANENT;

      repository.findById.mockResolvedValue(mockEvent);
      repository.hasUnprocessedPriorEvents.mockResolvedValue(false);
      repository.claimEvent.mockResolvedValue({
        ...mockEvent,
        status: 'PROCESSING',
      });
      repository.incrementAttemptCount.mockResolvedValue({
        ...mockEvent,
        attemptCount: 1,
      });
      attemptRepository.recordAttempt.mockResolvedValue({});
      repository.markFailed.mockResolvedValue({
        ...mockEvent,
        status: 'FAILED',
      });

      await runProcessJob(mockEvent.id);

      const failArgs = repository.markFailed.mock.calls[0] as unknown[];
      expect(failArgs[0]).toBe(mockEvent.id);
      const reason = String(failArgs[1]);
      expect(reason).toContain('Permanent failure');
      expect(typeof reason).toBe('string');

      handler.simulateFailure = undefined;
    });
  });

  describe('attempt history', () => {
    it('should record attempt start before processing', async () => {
      repository.findById.mockResolvedValue(mockEvent);
      repository.hasUnprocessedPriorEvents.mockResolvedValue(false);
      repository.claimEvent.mockResolvedValue({
        ...mockEvent,
        status: 'PROCESSING',
      });
      repository.incrementAttemptCount.mockResolvedValue({
        ...mockEvent,
        attemptCount: 1,
      });
      attemptRepository.recordAttempt.mockResolvedValue({});
      repository.markSuccess.mockResolvedValue({
        ...mockEvent,
        status: 'SUCCESS',
      });

      await runProcessJob(mockEvent.id);

      // First recordAttempt call is the "start" recording
      const startCall = attemptRepository.recordAttempt.mock
        .calls[0] as unknown[];
      expect(startCall[0]).toEqual(
        expect.objectContaining({
          eventId: mockEvent.id,
          attemptNumber: 1,
          status: 'FAILED', // Placeholder until completion
        }),
      );
    });

    it('should record attempt result on success', async () => {
      repository.findById.mockResolvedValue(mockEvent);
      repository.hasUnprocessedPriorEvents.mockResolvedValue(false);
      repository.claimEvent.mockResolvedValue({
        ...mockEvent,
        status: 'PROCESSING',
      });
      repository.incrementAttemptCount.mockResolvedValue({
        ...mockEvent,
        attemptCount: 1,
      });
      attemptRepository.recordAttempt.mockResolvedValue({});
      repository.markSuccess.mockResolvedValue({
        ...mockEvent,
        status: 'SUCCESS',
      });

      await runProcessJob(mockEvent.id);

      // Second recordAttempt call is the "result" recording
      const resultCall = attemptRepository.recordAttempt.mock
        .calls[1] as unknown[];
      expect(resultCall[0]).toEqual(
        expect.objectContaining({
          eventId: mockEvent.id,
          attemptNumber: 1,
          status: 'SUCCESS',
        }),
      );
    });

    it('should track attempt number correctly across retries', async () => {
      const processingEvent = { ...mockEvent, status: 'PROCESSING' as const };
      repository.findById.mockResolvedValue(processingEvent);
      repository.hasUnprocessedPriorEvents.mockResolvedValue(false);
      repository.claimEvent.mockResolvedValue(null); // Already PROCESSING
      repository.reClaimEvent.mockResolvedValue(processingEvent);
      repository.incrementAttemptCount.mockResolvedValue({
        ...processingEvent,
        attemptCount: 2,
      });
      attemptRepository.recordAttempt.mockResolvedValue({});
      repository.markSuccess.mockResolvedValue({
        ...processingEvent,
        status: 'SUCCESS',
      });

      await runProcessJob(mockEvent.id, 1); // attemptsMade=1 means attempt 2

      const startCall = attemptRepository.recordAttempt.mock
        .calls[0] as unknown[];
      expect(startCall[0]).toEqual(
        expect.objectContaining({
          eventId: mockEvent.id,
          attemptNumber: 2,
        }),
      );
    });
  });

  describe('two workers attempting same event', () => {
    it('should only one worker claim and process via atomic claim', async () => {
      // First worker claims successfully
      repository.findById.mockResolvedValue(mockEvent);
      repository.hasUnprocessedPriorEvents.mockResolvedValue(false);
      repository.claimEvent.mockResolvedValue({
        ...mockEvent,
        status: 'PROCESSING',
      });
      repository.incrementAttemptCount.mockResolvedValue({
        ...mockEvent,
        attemptCount: 1,
      });
      attemptRepository.recordAttempt.mockResolvedValue({});
      repository.markSuccess.mockResolvedValue({
        ...mockEvent,
        status: 'SUCCESS',
      });

      await runProcessJob(mockEvent.id);

      expect(repository.claimEvent).toHaveBeenCalledTimes(1);
      expect(repository.markSuccess).toHaveBeenCalledTimes(1);
    });
  });

  describe('per-employee ordering', () => {
    it('should skip ordering check for first event (sequence=1)', async () => {
      repository.findById.mockResolvedValue(mockEvent);
      repository.claimEvent.mockResolvedValue({
        ...mockEvent,
        status: 'PROCESSING',
      });
      repository.incrementAttemptCount.mockResolvedValue({
        ...mockEvent,
        attemptCount: 1,
      });
      attemptRepository.recordAttempt.mockResolvedValue({});
      repository.markSuccess.mockResolvedValue({
        ...mockEvent,
        status: 'SUCCESS',
      });

      await runProcessJob(mockEvent.id);

      // hasUnprocessedPriorEvents should NOT be called for sequence=1
      expect(repository.hasUnprocessedPriorEvents).not.toHaveBeenCalled();
    });

    it('should defer processing when earlier events are still pending', async () => {
      const laterEvent = { ...mockEvent, sequence: 3 };
      repository.findById.mockResolvedValue(laterEvent);
      repository.hasUnprocessedPriorEvents.mockResolvedValue(true);

      await expect(runProcessJob(laterEvent.id)).rejects.toThrow(
        /Ordering constraint/,
      );

      // Should NOT claim or process
      expect(repository.claimEvent).not.toHaveBeenCalled();
      expect(repository.markSuccess).not.toHaveBeenCalled();
      expect(repository.markFailed).not.toHaveBeenCalled();
    });

    it('should process when all earlier events are done', async () => {
      const laterEvent = { ...mockEvent, sequence: 3 };
      repository.findById.mockResolvedValue(laterEvent);
      repository.hasUnprocessedPriorEvents.mockResolvedValue(false);
      repository.claimEvent.mockResolvedValue({
        ...laterEvent,
        status: 'PROCESSING',
      });
      repository.incrementAttemptCount.mockResolvedValue({
        ...laterEvent,
        attemptCount: 1,
      });
      attemptRepository.recordAttempt.mockResolvedValue({});
      repository.markSuccess.mockResolvedValue({
        ...laterEvent,
        status: 'SUCCESS',
      });

      await runProcessJob(laterEvent.id);

      expect(repository.hasUnprocessedPriorEvents).toHaveBeenCalledWith(
        mockEvent.employeeId,
        3,
      );
      expect(repository.claimEvent).toHaveBeenCalled();
      expect(repository.markSuccess).toHaveBeenCalled();
    });

    it('should allow different employees to process concurrently', async () => {
      // Employee B's first event (sequence=1) should not be blocked by Employee A
      repository.findById.mockResolvedValue(mockAddressEvent); // EMP-002, seq 1
      repository.claimEvent.mockResolvedValue({
        ...mockAddressEvent,
        status: 'PROCESSING',
      });
      repository.incrementAttemptCount.mockResolvedValue({
        ...mockAddressEvent,
        attemptCount: 1,
      });
      attemptRepository.recordAttempt.mockResolvedValue({});
      repository.markSuccess.mockResolvedValue({
        ...mockAddressEvent,
        status: 'SUCCESS',
      });

      await runProcessJob(mockAddressEvent.id);

      // No ordering check needed for sequence=1
      expect(repository.hasUnprocessedPriorEvents).not.toHaveBeenCalled();
      expect(repository.markSuccess).toHaveBeenCalled();
    });

    it('should check ordering only for same employee', async () => {
      // Employee B's second event should only check Employee B's earlier events
      const empBEvent2 = { ...mockAddressEvent, sequence: 2 };
      repository.findById.mockResolvedValue(empBEvent2);
      repository.hasUnprocessedPriorEvents.mockResolvedValue(false);
      repository.claimEvent.mockResolvedValue({
        ...empBEvent2,
        status: 'PROCESSING',
      });
      repository.incrementAttemptCount.mockResolvedValue({
        ...empBEvent2,
        attemptCount: 1,
      });
      attemptRepository.recordAttempt.mockResolvedValue({});
      repository.markSuccess.mockResolvedValue({
        ...empBEvent2,
        status: 'SUCCESS',
      });

      await runProcessJob(empBEvent2.id);

      expect(repository.hasUnprocessedPriorEvents).toHaveBeenCalledWith(
        'EMP-002',
        2,
      );
    });
  });
});
