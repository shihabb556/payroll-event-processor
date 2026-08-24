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
import { EventsService } from './events.service';

@Controller('api/v1/events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

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

    return {
      event: {
        id: event.id,
        employeeId: event.employeeId,
        eventType: event.eventType,
        status: event.status,
        idempotencyKey: event.idempotencyKey,
        payload: event.payload,
        createdAt: event.createdAt,
        updatedAt: event.updatedAt,
      },
    };
  }
}
