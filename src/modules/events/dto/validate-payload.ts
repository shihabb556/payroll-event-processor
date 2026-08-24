import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { HttpException, HttpStatus } from '@nestjs/common';

import { EventType } from '../types/event-payload.types';
import { SalaryChangePayloadDto } from './salary-change-payload.dto';
import { AddressChangePayloadDto } from './address-change-payload.dto';
import { BankAccountChangePayloadDto } from './bank-account-change-payload.dto';

const PAYLOAD_DTOS: Record<EventType, new () => object> = {
  [EventType.SALARY_CHANGE]: SalaryChangePayloadDto,
  [EventType.ADDRESS_CHANGE]: AddressChangePayloadDto,
  [EventType.BANK_ACCOUNT_CHANGE]: BankAccountChangePayloadDto,
};

/**
 * Validates the payload object against the expected DTO for the given event type.
 * Throws HttpException (400) if validation fails.
 */
export async function validateEventPayload(
  eventType: EventType,
  payload: Record<string, unknown>,
): Promise<void> {
  const DtoClass = PAYLOAD_DTOS[eventType];
  if (!DtoClass) {
    throw new HttpException(
      `No payload validation defined for event type: ${eventType}`,
      HttpStatus.BAD_REQUEST,
    );
  }

  const dtoInstance = plainToInstance(DtoClass, payload);
  const errors = await validate(dtoInstance, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });

  if (errors.length > 0) {
    const messages = errors.flatMap((error) =>
      Object.values(error.constraints ?? {}),
    );
    throw new HttpException(
      {
        message: 'Invalid payload for event type',
        errors: messages,
        eventType,
      },
      HttpStatus.BAD_REQUEST,
    );
  }
}
