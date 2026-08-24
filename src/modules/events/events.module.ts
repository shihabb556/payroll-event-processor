import { Module } from '@nestjs/common';

import { QueueModule } from '../../infrastructure/queue/queue.module';
import { EventsController } from './events.controller';
import { EventsRepository } from './repositories/events.repository';
import { EventsService } from './events.service';

@Module({
  imports: [QueueModule],
  controllers: [EventsController],
  providers: [EventsService, EventsRepository],
  exports: [EventsRepository],
})
export class EventsModule {}
