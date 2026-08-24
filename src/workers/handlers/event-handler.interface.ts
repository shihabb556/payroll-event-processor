import { FailureType, ProcessingResult } from './processing-result.type';

export interface EventHandler {
  readonly eventType: string;
  readonly simulateFailure?: FailureType;

  process(event: {
    id: string;
    employeeId: string;
    eventType: string;
    payload: Record<string, unknown>;
  }): Promise<ProcessingResult>;
}
