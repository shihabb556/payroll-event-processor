import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';

import { RedisService } from '../redis/redis.service';
import {
  PAYROLL_EVENT_JOB_NAME,
  PAYROLL_EVENT_QUEUE,
  PAYROLL_EVENT_QUEUE_DEFAULT_JOB_OPTIONS,
} from './queue.constants';

@Injectable()
export class PayrollEventQueue implements OnModuleDestroy {
  private readonly queue: Queue;

  constructor(
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {
    const queueName =
      this.config.get<string>('QUEUE_NAME') ?? PAYROLL_EVENT_QUEUE;

    this.queue = new Queue(queueName, {
      connection: this.redis.getClient(),
      defaultJobOptions: PAYROLL_EVENT_QUEUE_DEFAULT_JOB_OPTIONS,
    });
  }

  async addEventJob(eventId: string): Promise<void> {
    await this.queue.add(PAYROLL_EVENT_JOB_NAME, { eventId });
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }
}
