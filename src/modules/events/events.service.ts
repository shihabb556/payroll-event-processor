import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

import { PayrollEventQueue } from '../../infrastructure/queue/payroll-event.queue';
import { CreateEventDto } from './dto/create-event.dto';
import { EventsRepository } from './repositories/events.repository';

@Injectable()
export class EventsService {
  constructor(
    private readonly eventsRepository: EventsRepository,
    private readonly payrollEventQueue: PayrollEventQueue,
  ) {}

  async createEvent(dto: CreateEventDto) {
    const existingEvent = await this.eventsRepository.findByIdempotencyKey(
      dto.idempotencyKey,
    );

    if (existingEvent) {
      return {
        event: existingEvent,
        alreadyExists: true,
      };
    }

    try {
      const event = await this.eventsRepository.create({
        employeeId: dto.employeeId,
        eventType: dto.eventType,
        idempotencyKey: dto.idempotencyKey,
        payload: dto.payload,
      });

      try {
        await this.payrollEventQueue.addEventJob(event.id);
      } catch {
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

      const duplicateEvent = await this.eventsRepository.findByIdempotencyKey(
        dto.idempotencyKey,
      );

      if (duplicateEvent) {
        return {
          event: duplicateEvent,
          alreadyExists: true,
        };
      }

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
