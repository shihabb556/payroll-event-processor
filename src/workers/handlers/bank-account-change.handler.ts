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

    const accountNumber = event.payload.accountNumber as string;
    const routingNumber = event.payload.routingNumber as string;
    const bankName = event.payload.bankName as string;

    return Promise.resolve({
      success: true,
      message: `Bank account updated successfully for employee ${event.employeeId}`,
      processedAt: new Date().toISOString(),
      data: {
        accountNumber: accountNumber
          ? `****${accountNumber.slice(-4)}`
          : undefined,
        routingNumber,
        bankName,
      },
    });
  }
}
