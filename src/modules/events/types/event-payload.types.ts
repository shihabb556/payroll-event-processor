export enum EventType {
  BANK_ACCOUNT_CHANGE = 'BANK_ACCOUNT_CHANGE',
  ADDRESS_CHANGE = 'ADDRESS_CHANGE',
  SALARY_CHANGE = 'SALARY_CHANGE',
}

export interface SalaryChangePayload {
  effectiveDate: string;
  newSalary: number;
  currency: string;
}

export interface AddressChangePayload {
  effectiveDate: string;
  street: string;
  city: string;
  postalCode: string;
  country: string;
}

export interface BankAccountChangePayload {
  effectiveDate: string;
  iban: string;
}

export type EventPayload =
  SalaryChangePayload | AddressChangePayload | BankAccountChangePayload;
