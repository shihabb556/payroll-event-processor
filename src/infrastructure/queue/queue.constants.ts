export const PAYROLL_EVENT_QUEUE = 'payroll-events';

export const PAYROLL_EVENT_JOB_NAME = 'process-payroll-event';

export const PAYROLL_EVENT_QUEUE_DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 1000,
  },
  removeOnComplete: {
    age: 3600,
    count: 1000,
  },
  removeOnFail: {
    age: 86400,
    count: 5000,
  },
} as const;
