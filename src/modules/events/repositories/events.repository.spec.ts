import { Test, TestingModule } from '@nestjs/testing';

import { DatabaseService } from '../../../infrastructure/database/database.service';
import { EventsRepository } from './events.repository';

describe('EventsRepository — stale event recovery', () => {
  let repository: EventsRepository;
  let mockLimit: jest.Mock;
  let mockReturning: jest.Mock;

  const mockEvent = {
    id: 'evt-001',
    employeeId: 'EMP-001',
    eventType: 'SALARY_CHANGE',
    payload: { effectiveDate: '2026-01-15', newSalary: 75000, currency: 'USD' },
    status: 'PROCESSING',
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

  beforeEach(async () => {
    mockLimit = jest.fn().mockResolvedValue([]);
    mockReturning = jest.fn().mockResolvedValue([]);

    const database = {
      db: {
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              limit: mockLimit,
            }),
          }),
        }),
        update: jest.fn().mockReturnValue({
          set: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              returning: mockReturning,
            }),
          }),
        }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventsRepository,
        { provide: DatabaseService, useValue: database },
      ],
    }).compile();

    repository = module.get<EventsRepository>(EventsRepository);
  });

  describe('findStaleProcessingEvents', () => {
    it('should query for PROCESSING events older than the stale threshold', async () => {
      const staleBefore = new Date(Date.now() - 60_000);
      mockLimit.mockResolvedValue([mockEvent]);

      const result = await repository.findStaleProcessingEvents(
        staleBefore,
        10,
      );

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(mockEvent.id);
    });

    it('should return empty array when no stale events exist', async () => {
      const staleBefore = new Date(Date.now() - 60_000);
      mockLimit.mockResolvedValue([]);

      const result = await repository.findStaleProcessingEvents(
        staleBefore,
        10,
      );

      expect(result).toHaveLength(0);
    });
  });

  describe('recoverStaleEvent', () => {
    it('should atomically recover a stale event back to PENDING', async () => {
      const staleBefore = new Date(Date.now() - 60_000);
      mockReturning.mockResolvedValue([
        { ...mockEvent, status: 'PENDING', processingStartedAt: null },
      ]);

      const result = await repository.recoverStaleEvent(
        mockEvent.id,
        staleBefore,
      );

      expect(result).not.toBeNull();
      expect(result.status).toBe('PENDING');
      expect(result.processingStartedAt).toBeNull();
    });

    it('should return null if event is no longer eligible', async () => {
      const staleBefore = new Date(Date.now() - 60_000);
      mockReturning.mockResolvedValue([]);

      const result = await repository.recoverStaleEvent(
        mockEvent.id,
        staleBefore,
      );

      expect(result).toBeNull();
    });
  });
});
