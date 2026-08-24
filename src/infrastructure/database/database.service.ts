import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly client;
  readonly db;

  constructor(private readonly config: ConfigService) {
    const databaseUrl = this.config.getOrThrow<string>('DATABASE_URL');

    this.client = postgres(databaseUrl);
    this.db = drizzle(this.client);
  }

  async onModuleDestroy() {
    await this.client.end();
  }
}
