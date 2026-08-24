import { Module } from '@nestjs/common';

import { RedisModule } from '../redis/redis.module';
import { PayrollEventQueue } from './payroll-event.queue';

@Module({
  imports: [RedisModule],
  providers: [PayrollEventQueue],
  exports: [PayrollEventQueue],
})
export class QueueModule {}
