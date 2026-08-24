export enum FailureType {
  TEMPORARY = 'TEMPORARY',
  PERMANENT = 'PERMANENT',
}

export interface ProcessingResult {
  success: boolean;
  message: string;
  processedAt: string;
  data?: Record<string, unknown>;
}
