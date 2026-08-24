import { Injectable } from '@nestjs/common';

import { AddressChangeHandler } from './address-change.handler';
import { BankAccountChangeHandler } from './bank-account-change.handler';
import { EventHandler } from './event-handler.interface';
import { SalaryChangeHandler } from './salary-change.handler';

@Injectable()
export class EventHandlerResolver {
  private readonly handlers = new Map<string, EventHandler>();

  constructor(
    private readonly bankAccountChangeHandler: BankAccountChangeHandler,
    private readonly addressChangeHandler: AddressChangeHandler,
    private readonly salaryChangeHandler: SalaryChangeHandler,
  ) {
    this.handlers.set(
      this.bankAccountChangeHandler.eventType,
      this.bankAccountChangeHandler,
    );
    this.handlers.set(
      this.addressChangeHandler.eventType,
      this.addressChangeHandler,
    );
    this.handlers.set(
      this.salaryChangeHandler.eventType,
      this.salaryChangeHandler,
    );
  }

  resolve(eventType: string): EventHandler | undefined {
    return this.handlers.get(eventType);
  }

  getSupportedEventTypes(): string[] {
    return Array.from(this.handlers.keys());
  }
}
