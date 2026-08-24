import { Module } from '@nestjs/common';

import { QueueModule } from '../../infrastructure/queue/queue.module';
import { EventsController } from './events.controller';
import { EmployeeSequencesRepository } from './repositories/employee-sequences.repository';
import { EventAttemptsRepository } from './repositories/event-attempts.repository';
import { EventsRepository } from './repositories/events.repository';
import { EventsService } from './events.service';
import { StuckEventRecoveryService } from './stuck-event-recovery.service';

@Module({
  imports: [QueueModule],
  controllers: [EventsController],
  providers: [
    EventsService,
    EventsRepository,
    EventAttemptsRepository,
    EmployeeSequencesRepository,
    StuckEventRecoveryService,
  ],
  exports: [
    EventsRepository,
    EventAttemptsRepository,
    EmployeeSequencesRepository,
  ],
})
export class EventsModule {}
