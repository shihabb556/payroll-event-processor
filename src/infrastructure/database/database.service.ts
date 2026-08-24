import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly client: Sql;
  readonly db: PostgresJsDatabase<Record<string, never>>;

  constructor(private readonly config: ConfigService) {
    const databaseUrl = this.config.getOrThrow<string>('DATABASE_URL');

    this.client = postgres(databaseUrl);
    this.db = drizzle(this.client);
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.end();
  }
}
