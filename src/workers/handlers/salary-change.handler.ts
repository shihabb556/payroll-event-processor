import { Injectable } from '@nestjs/common';

import { FailureType, ProcessingResult } from './processing-result.type';
import { EventHandler } from './event-handler.interface';

@Injectable()
export class SalaryChangeHandler implements EventHandler {
  readonly eventType = 'SALARY_CHANGE';
  simulateFailure?: FailureType;

  process(event: {
    id: string;
    employeeId: string;
    eventType: string;
    payload: Record<string, unknown>;
  }): Promise<ProcessingResult> {
    if (this.simulateFailure === FailureType.TEMPORARY) {
      throw new Error(
        `Temporary failure processing salary change for employee ${event.employeeId}`,
      );
    }

    if (this.simulateFailure === FailureType.PERMANENT) {
      return Promise.resolve({
        success: false,
        message: `Permanent failure: invalid salary data for employee ${event.employeeId}`,
        processedAt: new Date().toISOString(),
      });
    }

    const newSalary = event.payload.newSalary as number;
    const currency = event.payload.currency as string;
    const effectiveDate = event.payload.effectiveDate as string;

    return Promise.resolve({
      success: true,
      message: `Salary updated to ${newSalary} ${currency} for employee ${event.employeeId} (effective ${effectiveDate})`,
      processedAt: new Date().toISOString(),
      data: {
        newSalary,
        currency,
        effectiveDate,
      },
    });
  }
}
