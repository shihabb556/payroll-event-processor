import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  await app.listen(process.env.PORT ?? 3000);
}

bootstrap()
  .then(() => {
    console.log(`Application started on port ${process.env.PORT ?? 3000}`);
  })
  .catch((error) => {
    console.error('Failed to start application:', error);
    process.exit(1);
  });
