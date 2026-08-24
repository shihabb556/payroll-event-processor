export enum EventType {
  BANK_ACCOUNT_CHANGE = 'BANK_ACCOUNT_CHANGE',
  ADDRESS_CHANGE = 'ADDRESS_CHANGE',
  SALARY_CHANGE = 'SALARY_CHANGE',
}

export interface SalaryChangePayload {
  salary: number;
}

export interface AddressChangePayload {
  street: string;
  city: string;
  state: string;
  zip: string;
}

export interface BankAccountChangePayload {
  accountNumber: string;
  routingNumber: string;
  bankName: string;
}

export type EventPayload =
  SalaryChangePayload | AddressChangePayload | BankAccountChangePayload;
