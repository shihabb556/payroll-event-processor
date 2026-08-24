import { Module } from '@nestjs/common';

import { QueueModule } from '../../infrastructure/queue/queue.module';
import { EventsController } from './events.controller';
import { EventAttemptsRepository } from './repositories/event-attempts.repository';
import { EventsRepository } from './repositories/events.repository';
import { EventsService } from './events.service';

@Module({
  imports: [QueueModule],
  controllers: [EventsController],
  providers: [EventsService, EventsRepository, EventAttemptsRepository],
  exports: [EventsRepository, EventAttemptsRepository],
})
export class EventsModule {}
