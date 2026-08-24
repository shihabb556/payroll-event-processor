import { SalaryChangeHandler } from './salary-change.handler';
import { FailureType } from './processing-result.type';

describe('SalaryChangeHandler', () => {
  let handler: SalaryChangeHandler;

  const mockEvent = {
    id: 'evt-003',
    employeeId: 'EMP-003',
    eventType: 'SALARY_CHANGE',
    payload: {
      salary: 75000,
    },
  };

  beforeEach(() => {
    handler = new SalaryChangeHandler();
  });

  it('should process salary change successfully', async () => {
    const result = await handler.process(mockEvent);

    expect(result.success).toBe(true);
    expect(result.message).toContain('EMP-003');
    expect(result.processedAt).toBeDefined();
    expect(result.data).toEqual({ salary: 75000 });
  });

  it('should throw on temporary failure', () => {
    handler.simulateFailure = FailureType.TEMPORARY;

    expect(() => handler.process(mockEvent)).toThrow(
      /Temporary failure processing salary change/,
    );
  });

  it('should return failure result on permanent failure', async () => {
    handler.simulateFailure = FailureType.PERMANENT;

    const result = await handler.process(mockEvent);

    expect(result.success).toBe(false);
    expect(result.message).toContain('Permanent failure');
  });

  it('should have correct eventType', () => {
    expect(handler.eventType).toBe('SALARY_CHANGE');
  });
});
