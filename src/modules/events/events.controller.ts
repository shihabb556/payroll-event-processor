import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';

import { CreateEventDto } from './dto/create-event.dto';
import { EventAttemptsRepository } from './repositories/event-attempts.repository';
import { EventsService } from './events.service';

@ApiTags('Events')
@Controller('api/v1/events')
export class EventsController {
  constructor(
    private readonly eventsService: EventsService,
    private readonly eventAttemptsRepository: EventAttemptsRepository,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Submit a payroll event for processing' })
  @ApiResponse({
    status: 201,
    description: 'Event created or already exists (idempotent)',
  })
  @ApiResponse({ status: 400, description: 'Invalid request payload' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
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
          sequence: result.event.sequence,
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
        sequence: result.event.sequence,
        idempotencyKey: result.event.idempotencyKey,
        createdAt: result.event.createdAt,
      },
    };
  }

  @Get()
  @ApiOperation({ summary: 'List recent events' })
  @ApiResponse({ status: 200, description: 'List of events' })
  async listEvents() {
    const events = await this.eventsService.listEvents();
    return {
      events: events.map((e) => ({
        id: e.id,
        employeeId: e.employeeId,
        eventType: e.eventType,
        status: e.status,
        sequence: e.sequence,
        idempotencyKey: e.idempotencyKey,
        createdAt: e.createdAt,
        completedAt: e.completedAt,
      })),
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get event details with attempt history' })
  @ApiParam({ name: 'id', description: 'Event UUID' })
  @ApiResponse({ status: 200, description: 'Event details' })
  @ApiResponse({ status: 404, description: 'Event not found' })
  async getEvent(@Param('id') id: string) {
    const event = await this.eventsService.getEvent(id);
    const attempts = await this.eventAttemptsRepository.findByEventId(id);

    return {
      event: {
        id: event.id,
        employeeId: event.employeeId,
        eventType: event.eventType,
        status: event.status,
        sequence: event.sequence,
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
