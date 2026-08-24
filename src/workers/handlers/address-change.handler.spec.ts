import { AddressChangeHandler } from './address-change.handler';
import { FailureType } from './processing-result.type';

describe('AddressChangeHandler', () => {
  let handler: AddressChangeHandler;

  const mockEvent = {
    id: 'evt-002',
    employeeId: 'EMP-002',
    eventType: 'ADDRESS_CHANGE',
    payload: {
      effectiveDate: '2026-02-01',
      street: '123 Main St',
      city: 'Boston',
      postalCode: '02101',
      country: 'US',
    },
  };

  beforeEach(() => {
    handler = new AddressChangeHandler();
  });

  it('should process address change successfully', async () => {
    const result = await handler.process(mockEvent);

    expect(result.success).toBe(true);
    expect(result.message).toContain('EMP-002');
    expect(result.message).toContain('123 Main St');
    expect(result.message).toContain('Boston');
    expect(result.processedAt).toBeDefined();
    expect(result.data).toEqual({
      street: '123 Main St',
      city: 'Boston',
      postalCode: '02101',
      country: 'US',
      effectiveDate: '2026-02-01',
    });
  });

  it('should throw on temporary failure', () => {
    handler.simulateFailure = FailureType.TEMPORARY;

    expect(() => handler.process(mockEvent)).toThrow(
      /Temporary failure processing address change/,
    );
  });

  it('should return failure result on permanent failure', async () => {
    handler.simulateFailure = FailureType.PERMANENT;

    const result = await handler.process(mockEvent);

    expect(result.success).toBe(false);
    expect(result.message).toContain('Permanent failure');
  });

  it('should have correct eventType', () => {
    expect(handler.eventType).toBe('ADDRESS_CHANGE');
  });
});
