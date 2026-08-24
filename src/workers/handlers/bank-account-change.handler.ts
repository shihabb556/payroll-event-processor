import { Injectable } from '@nestjs/common';

import { FailureType, ProcessingResult } from './processing-result.type';
import { EventHandler } from './event-handler.interface';

@Injectable()
export class BankAccountChangeHandler implements EventHandler {
  readonly eventType = 'BANK_ACCOUNT_CHANGE';
  simulateFailure?: FailureType;

  process(event: {
    id: string;
    employeeId: string;
    eventType: string;
    payload: Record<string, unknown>;
  }): Promise<ProcessingResult> {
    if (this.simulateFailure === FailureType.TEMPORARY) {
      throw new Error(
        `Temporary failure processing bank account change for employee ${event.employeeId}`,
      );
    }

    if (this.simulateFailure === FailureType.PERMANENT) {
      return Promise.resolve({
        success: false,
        message: `Permanent failure: invalid bank account data for employee ${event.employeeId}`,
        processedAt: new Date().toISOString(),
      });
    }

    const iban = event.payload.iban as string;
    const effectiveDate = event.payload.effectiveDate as string;

    // Mask IBAN for safety — show only last 4 characters
    const maskedIban = iban.length > 4 ? `****${iban.slice(-4)}` : iban;

    return Promise.resolve({
      success: true,
      message: `Bank account updated to ${maskedIban} for employee ${event.employeeId} (effective ${effectiveDate})`,
      processedAt: new Date().toISOString(),
      data: {
        iban: maskedIban,
        effectiveDate,
      },
    });
  }
}
