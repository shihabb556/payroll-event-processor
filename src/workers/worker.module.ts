import { Module } from '@nestjs/common';

import { RedisModule } from '../infrastructure/redis/redis.module';
import { EventsModule } from '../modules/events/events.module';
import { AddressChangeHandler } from './handlers/address-change.handler';
import { BankAccountChangeHandler } from './handlers/bank-account-change.handler';
import { EventHandlerResolver } from './handlers/event-handler.resolver';
import { SalaryChangeHandler } from './handlers/salary-change.handler';
import { PayrollEventProcessor } from './payroll-event.processor';

@Module({
  imports: [RedisModule, EventsModule],
  providers: [
    PayrollEventProcessor,
    EventHandlerResolver,
    BankAccountChangeHandler,
    AddressChangeHandler,
    SalaryChangeHandler,
  ],
})
export class WorkerModule {}
