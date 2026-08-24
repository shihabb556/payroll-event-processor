import { IsEnum, IsNotEmpty, IsObject, IsString } from 'class-validator';
import { EventType } from '../types/event-payload.types';

export class CreateEventDto {
  @IsString()
  @IsNotEmpty()
  employeeId!: string;

  @IsEnum(EventType)
  eventType!: EventType;

  @IsString()
  @IsNotEmpty()
  idempotencyKey!: string;

  @IsObject()
  @IsNotEmpty()
  payload!: Record<string, unknown>;
}
