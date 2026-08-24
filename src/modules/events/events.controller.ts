import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';

import { CreateEventDto } from './dto/create-event.dto';
import { EventAttemptsRepository } from './repositories/event-attempts.repository';
import { EventsService } from './events.service';

@Controller('api/v1/events')
export class EventsController {
  constructor(
    private readonly eventsService: EventsService,
    private readonly eventAttemptsRepository: EventAttemptsRepository,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createEvent(@Body() dto: CreateEventDto) {
    const result = await this.eventsService.createEvent(dto);

    if (result.alreadyExists) {
      return {
        message: 'Event already exists',
        event: {
          id: result.event.id,
          employeeId: result.event.employeeId,
          eventType: result.event.eventType,
          status: result.event.status,
          idempotencyKey: result.event.idempotencyKey,
          createdAt: result.event.createdAt,
        },
      };
    }

    return {
      message: 'Event created successfully',
      event: {
        id: result.event.id,
        employeeId: result.event.employeeId,
        eventType: result.event.eventType,
        status: result.event.status,
        idempotencyKey: result.event.idempotencyKey,
        createdAt: result.event.createdAt,
      },
    };
  }

  @Get(':id')
  async getEvent(@Param('id') id: string) {
    const event = await this.eventsService.getEvent(id);
    const attempts = await this.eventAttemptsRepository.findByEventId(id);

    return {
      event: {
        id: event.id,
        employeeId: event.employeeId,
        eventType: event.eventType,
        status: event.status,
        idempotencyKey: event.idempotencyKey,
        payload: event.payload,
        attemptCount: event.attemptCount,
        failureReason: event.failureReason,
        result: event.result,
        processingStartedAt: event.processingStartedAt,
        completedAt: event.completedAt,
        createdAt: event.createdAt,
        updatedAt: event.updatedAt,
        attempts: attempts.map((a) => ({
          attemptNumber: a.attemptNumber,
          status: a.status,
          failureReason: a.failureReason,
          startedAt: a.startedAt,
          completedAt: a.completedAt,
        })),
      },
    };
  }
}
