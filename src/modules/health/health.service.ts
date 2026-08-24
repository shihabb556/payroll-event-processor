import { Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';

import { DatabaseService } from '../../infrastructure/database/database.service';
import { RedisService } from '../../infrastructure/redis/redis.service';

@Injectable()
export class HealthService {
  constructor(
    private readonly database: DatabaseService,
    private readonly redis: RedisService,
  ) {}

  async check() {
    const [databaseStatus, redisStatus] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
    ]);

    const healthy =
      databaseStatus === 'connected' &&
      redisStatus === 'connected';

    return {
      status: healthy ? 'ok' : 'degraded',
      services: {
        database: databaseStatus,
        redis: redisStatus,
      },
      timestamp: new Date().toISOString(),
    };
  }

  private async checkDatabase(): Promise<string> {
    try {
      await this.database.db.execute(sql`SELECT 1`);
      return 'connected';
    } catch {
      return 'disconnected';
    }
  }

  private async checkRedis(): Promise<string> {
    try {
      const response = await this.redis.ping();
      return response === 'PONG' ? 'connected' : 'disconnected';
    } catch {
      return 'disconnected';
    }
  }
}