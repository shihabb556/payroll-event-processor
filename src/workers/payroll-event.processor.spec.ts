import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';

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
    markProcessing: jest.Mock;
    markSuccess: jest.Mock;
    markFailed: jest.Mock;
    incrementAttemptCount: jest.Mock;
  };
  let resolver: EventHandlerResolver;

  const mockEvent = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    employeeId: 'EMP-001',
    eventType: 'SALARY_CHANGE',
    payload: { salary: 50000 },
    status: 'PENDING' as const,
    idempotencyKey: 'key-001',
    attemptCount: 0,
    failureReason: null,
    result: null,
    processingStartedAt: null,
    completedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    repository = {
      findById: jest.fn(),
      markProcessing: jest.fn(),
      markSuccess: jest.fn(),
      markFailed: jest.fn(),
      incrementAttemptCount: jest.fn(),
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

  describe('handler resolution', () => {
    it('should resolve handler for known event type', () => {
      const handler = resolver.resolve('SALARY_CHANGE');
      expect(handler).toBeDefined();
      expect(handler!.eventType).toBe('SALARY_CHANGE');
    });

    it('should return undefined for unknown event type', () => {
      const handler = resolver.resolve('UNKNOWN_TYPE');
      expect(handler).toBeUndefined();
    });
  });

  describe('event processing via handlers', () => {
    it('should process salary change successfully', async () => {
      const handler = resolver.resolve('SALARY_CHANGE')!;
      const result = await handler.process({
        id: mockEvent.id,
        employeeId: mockEvent.employeeId,
        eventType: mockEvent.eventType,
        payload: mockEvent.payload,
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('EMP-001');
    });

    it('should handle temporary failure by throwing', () => {
      const handler = resolver.resolve('SALARY_CHANGE') as SalaryChangeHandler;
      handler.simulateFailure = FailureType.TEMPORARY;

      expect(() =>
        handler.process({
          id: mockEvent.id,
          employeeId: mockEvent.employeeId,
          eventType: mockEvent.eventType,
          payload: mockEvent.payload,
        }),
      ).toThrow(/Temporary failure/);
    });

    it('should handle permanent failure by returning failure result', async () => {
      const handler = resolver.resolve('SALARY_CHANGE') as SalaryChangeHandler;
      handler.simulateFailure = FailureType.PERMANENT;

      const result = await handler.process({
        id: mockEvent.id,
        employeeId: mockEvent.employeeId,
        eventType: mockEvent.eventType,
        payload: mockEvent.payload,
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('Permanent failure');
    });
  });
});
