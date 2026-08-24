import { BankAccountChangeHandler } from './bank-account-change.handler';
import { FailureType } from './processing-result.type';

describe('BankAccountChangeHandler', () => {
  let handler: BankAccountChangeHandler;

  const mockEvent = {
    id: 'evt-001',
    employeeId: 'EMP-001',
    eventType: 'BANK_ACCOUNT_CHANGE',
    payload: {
      accountNumber: '1234567890',
      routingNumber: '021000021',
      bankName: 'Chase',
    },
  };

  beforeEach(() => {
    handler = new BankAccountChangeHandler();
  });

  it('should process bank account change successfully', async () => {
    const result = await handler.process(mockEvent);

    expect(result.success).toBe(true);
    expect(result.message).toContain('EMP-001');
    expect(result.processedAt).toBeDefined();
    expect(result.data).toEqual({
      accountNumber: '****7890',
      routingNumber: '021000021',
      bankName: 'Chase',
    });
  });

  it('should throw on temporary failure', () => {
    handler.simulateFailure = FailureType.TEMPORARY;

    expect(() => handler.process(mockEvent)).toThrow(
      /Temporary failure processing bank account change/,
    );
  });

  it('should return failure result on permanent failure', async () => {
    handler.simulateFailure = FailureType.PERMANENT;

    const result = await handler.process(mockEvent);

    expect(result.success).toBe(false);
    expect(result.message).toContain('Permanent failure');
  });

  it('should have correct eventType', () => {
    expect(handler.eventType).toBe('BANK_ACCOUNT_CHANGE');
  });
});
