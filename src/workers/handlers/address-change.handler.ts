import { Injectable } from '@nestjs/common';

import { FailureType, ProcessingResult } from './processing-result.type';
import { EventHandler } from './event-handler.interface';

@Injectable()
export class AddressChangeHandler implements EventHandler {
  readonly eventType = 'ADDRESS_CHANGE';
  simulateFailure?: FailureType;

  process(event: {
    id: string;
    employeeId: string;
    eventType: string;
    payload: Record<string, unknown>;
  }): Promise<ProcessingResult> {
    if (this.simulateFailure === FailureType.TEMPORARY) {
      throw new Error(
        `Temporary failure processing address change for employee ${event.employeeId}`,
      );
    }

    if (this.simulateFailure === FailureType.PERMANENT) {
      return Promise.resolve({
        success: false,
        message: `Permanent failure: invalid address data for employee ${event.employeeId}`,
        processedAt: new Date().toISOString(),
      });
    }

    const street = event.payload.street as string;
    const city = event.payload.city as string;
    const state = event.payload.state as string;
    const zip = event.payload.zip as string;

    return Promise.resolve({
      success: true,
      message: `Address updated successfully for employee ${event.employeeId}`,
      processedAt: new Date().toISOString(),
      data: {
        street,
        city,
        state,
        zip,
      },
    });
  }
}
