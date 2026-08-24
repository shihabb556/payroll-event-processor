import { Test, TestingModule } from '@nestjs/testing';
import { HttpException } from '@nestjs/common';

import { EventsService } from './events.service';
import { EventsRepository } from './repositories/events.repository';
import { EmployeeSequencesRepository } from './repositories/employee-sequences.repository';
import { PayrollEventQueue } from '../../infrastructure/queue/payroll-event.queue';
import { EventType } from './types/event-payload.types';
import { CreateEventDto } from './dto/create-event.dto';

describe('EventsService', () => {
  let service: EventsService;
  let repository: {
    create: jest.Mock;
    findById: jest.Mock;
    findByIdempotencyKey: jest.Mock;
    delete: jest.Mock;
  };
  let sequenceRepo: {
    allocateSequence: jest.Mock;
  };
  let queue: {
    addEventJob: jest.Mock;
  };

  const mockEvent = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    employeeId: 'EMP-001',
    eventType: EventType.SALARY_CHANGE,
    payload: { effectiveDate: '2026-01-15', newSalary: 75000, currency: 'USD' },
    status: 'PENDING' as const,
    sequence: 1,
    idempotencyKey: 'salary-change-emp001-001',
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
      create: jest.fn(),
      findById: jest.fn(),
      findByIdempotencyKey: jest.fn(),
      delete: jest.fn(),
    };
    sequenceRepo = {
      allocateSequence: jest.fn(),
    };
    queue = {
      addEventJob: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventsService,
        { provide: EventsRepository, useValue: repository },
        { provide: EmployeeSequencesRepository, useValue: sequenceRepo },
        { provide: PayrollEventQueue, useValue: queue },
      ],
    }).compile();

    service = module.get<EventsService>(EventsService);
  });

  describe('createEvent', () => {
    const dto: CreateEventDto = {
      employeeId: 'EMP-001',
      eventType: EventType.SALARY_CHANGE,
      idempotencyKey: 'key-001',
      payload: {
        effectiveDate: '2026-01-15',
        newSalary: 75000,
        currency: 'USD',
      },
    };

    it('should create event with sequence and enqueue job', async () => {
      repository.findByIdempotencyKey.mockResolvedValueOnce(null);
      sequenceRepo.allocateSequence.mockResolvedValueOnce(1);
      repository.create.mockResolvedValueOnce(mockEvent);
      queue.addEventJob.mockResolvedValueOnce(undefined);

      const result = await service.createEvent(dto);

      expect(result.alreadyExists).toBe(false);
      expect(result.event.id).toBe(mockEvent.id);
      expect(sequenceRepo.allocateSequence).toHaveBeenCalledWith(
        dto.employeeId,
      );
      expect(repository.create).toHaveBeenCalledWith({
        employeeId: dto.employeeId,
        eventType: dto.eventType,
        idempotencyKey: dto.idempotencyKey,
        payload: dto.payload,
        sequence: 1,
      });
      expect(queue.addEventJob).toHaveBeenCalledWith(mockEvent.id);
    });

    it('should return existing event for duplicate idempotency key', async () => {
      repository.findByIdempotencyKey.mockResolvedValueOnce(mockEvent);

      const result = await service.createEvent(dto);

      expect(result.alreadyExists).toBe(true);
      expect(result.event.id).toBe(mockEvent.id);
      expect(sequenceRepo.allocateSequence).not.toHaveBeenCalled();
      expect(repository.create).not.toHaveBeenCalled();
      expect(queue.addEventJob).not.toHaveBeenCalled();
    });

    it('should delete event and throw if queue enqueue fails', async () => {
      repository.findByIdempotencyKey.mockResolvedValueOnce(null);
      sequenceRepo.allocateSequence.mockResolvedValueOnce(1);
      repository.create.mockResolvedValueOnce(mockEvent);
      queue.addEventJob.mockRejectedValueOnce(new Error('Redis down'));

      await expect(service.createEvent(dto)).rejects.toThrow(HttpException);
      expect(repository.delete).toHaveBeenCalledWith(mockEvent.id);
    });

    it('should return existing event on unique constraint violation', async () => {
      repository.findByIdempotencyKey.mockResolvedValueOnce(null);
      sequenceRepo.allocateSequence.mockResolvedValueOnce(1);
      repository.create.mockRejectedValueOnce(new Error('unique_violation'));
      repository.findByIdempotencyKey.mockResolvedValueOnce(mockEvent);

      const result = await service.createEvent(dto);

      expect(result.alreadyExists).toBe(true);
      expect(result.event.id).toBe(mockEvent.id);
    });

    it('should throw 500 if database fails and no duplicate exists', async () => {
      repository.findByIdempotencyKey.mockResolvedValue(null);

      await expect(service.createEvent(dto)).rejects.toThrow(HttpException);
    });
  });

  describe('getEvent', () => {
    it('should return event when found', async () => {
      repository.findById.mockResolvedValueOnce(mockEvent);

      const result = await service.getEvent(mockEvent.id);

      expect(result.id).toBe(mockEvent.id);
    });

    it('should throw 404 when event not found', async () => {
      repository.findById.mockResolvedValueOnce(undefined);

      await expect(service.getEvent('nonexistent')).rejects.toThrow(
        HttpException,
      );
    });
  });
});
