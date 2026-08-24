import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsObject, IsString } from 'class-validator';
import { EventType } from '../types/event-payload.types';

export class CreateEventDto {
  @ApiProperty({ description: 'Employee identifier', example: 'EMP-001' })
  @IsString()
  @IsNotEmpty()
  employeeId!: string;

  @ApiProperty({
    enum: EventType,
    description: 'Type of payroll event',
    example: EventType.SALARY_CHANGE,
  })
  @IsEnum(EventType)
  eventType!: EventType;

  @ApiProperty({
    description:
      'Client-provided idempotency key to prevent duplicate processing',
    example: 'salary-change-emp001-20260101',
  })
  @IsString()
  @IsNotEmpty()
  idempotencyKey!: string;

  @ApiProperty({
    description:
      'Event-type-specific payload. Required fields vary by eventType.',
    example: { effectiveDate: '2026-01-15', newSalary: 75000, currency: 'USD' },
  })
  @IsObject()
  @IsNotEmpty()
  payload!: Record<string, unknown>;
}
