import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { WorkerAppModule } from './worker-app.module';

async function bootstrap(): Promise<void> {
  const logger = new Logger('WorkerBootstrap');

  const app = await NestFactory.create(WorkerAppModule);
  await app.init();

  logger.log('Worker started — processing events from queue');

  // Keep the process alive
  process.on('SIGTERM', () => {
    logger.log('Worker shutting down...');
    void app.close().then(() => process.exit(0));
  });
}

bootstrap().catch((error) => {
  const logger = new Logger('WorkerBootstrap');
  logger.error('Failed to start worker:', error);
  process.exit(1);
});
