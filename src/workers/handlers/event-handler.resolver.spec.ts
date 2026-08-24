import { Test, TestingModule } from '@nestjs/testing';

import { AddressChangeHandler } from './address-change.handler';
import { BankAccountChangeHandler } from './bank-account-change.handler';
import { EventHandlerResolver } from './event-handler.resolver';
import { SalaryChangeHandler } from './salary-change.handler';

describe('EventHandlerResolver', () => {
  let resolver: EventHandlerResolver;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventHandlerResolver,
        BankAccountChangeHandler,
        AddressChangeHandler,
        SalaryChangeHandler,
      ],
    }).compile();

    resolver = module.get<EventHandlerResolver>(EventHandlerResolver);
  });

  it('should resolve BANK_ACCOUNT_CHANGE handler', () => {
    const handler = resolver.resolve('BANK_ACCOUNT_CHANGE');
    expect(handler).toBeInstanceOf(BankAccountChangeHandler);
  });

  it('should resolve ADDRESS_CHANGE handler', () => {
    const handler = resolver.resolve('ADDRESS_CHANGE');
    expect(handler).toBeInstanceOf(AddressChangeHandler);
  });

  it('should resolve SALARY_CHANGE handler', () => {
    const handler = resolver.resolve('SALARY_CHANGE');
    expect(handler).toBeInstanceOf(SalaryChangeHandler);
  });

  it('should return undefined for unknown event type', () => {
    const handler = resolver.resolve('UNKNOWN_TYPE');
    expect(handler).toBeUndefined();
  });

  it('should return all supported event types', () => {
    const types = resolver.getSupportedEventTypes();
    expect(types).toContain('BANK_ACCOUNT_CHANGE');
    expect(types).toContain('ADDRESS_CHANGE');
    expect(types).toContain('SALARY_CHANGE');
    expect(types).toHaveLength(3);
  });
});
