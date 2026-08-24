import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';

import { PayrollEventQueue } from '../../infrastructure/queue/payroll-event.queue';
import { CreateEventDto } from './dto/create-event.dto';
import { EmployeeSequencesRepository } from './repositories/employee-sequences.repository';
import { EventsRepository } from './repositories/events.repository';

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(
    private readonly eventsRepository: EventsRepository,
    private readonly employeeSequencesRepository: EmployeeSequencesRepository,
    private readonly payrollEventQueue: PayrollEventQueue,
  ) {}

  async createEvent(dto: CreateEventDto) {
    // Fast path: check if event already exists (idempotency)
    const existingEvent = await this.eventsRepository.findByIdempotencyKey(
      dto.idempotencyKey,
    );

    if (existingEvent) {
      return {
        event: existingEvent,
        alreadyExists: true,
      };
    }

    // Try to create the event.
    // The unique constraint on idempotencyKey handles concurrent duplicates.
    try {
      // Allocate a deterministic per-employee sequence number
      const sequence = await this.employeeSequencesRepository.allocateSequence(
        dto.employeeId,
      );

      const event = await this.eventsRepository.create({
        employeeId: dto.employeeId,
        eventType: dto.eventType,
        idempotencyKey: dto.idempotencyKey,
        payload: dto.payload,
        sequence,
      });

      // Enqueue the job. If this fails, clean up the event.
      try {
        await this.payrollEventQueue.addEventJob(event.id);
      } catch (queueError) {
        this.logger.error(
          `Failed to enqueue event ${event.id}: ${queueError instanceof Error ? queueError.message : String(queueError)}`,
        );
        await this.eventsRepository.delete(event.id);
        throw new HttpException(
          'Failed to enqueue event for processing',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      return {
        event,
        alreadyExists: false,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      // Handle unique constraint violation (concurrent duplicate request)
      // The database enforces uniqueness, so we fall back to finding the existing event.
      const duplicateEvent = await this.eventsRepository.findByIdempotencyKey(
        dto.idempotencyKey,
      );

      if (duplicateEvent) {
        return {
          event: duplicateEvent,
          alreadyExists: true,
        };
      }

      this.logger.error(
        `Failed to create event: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new HttpException(
        'Failed to create event',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async getEvent(id: string) {
    const event = await this.eventsRepository.findById(id);

    if (!event) {
      throw new HttpException('Event not found', HttpStatus.NOT_FOUND);
    }

    return event;
  }
}
