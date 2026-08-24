import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { join } from 'path';

import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const logger = new Logger('Bootstrap');

  app.useGlobalFilters(new AllExceptionsFilter());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Serve static frontend files
  app.useStaticAssets(join(__dirname, '..', 'public'));

  // Swagger / OpenAPI documentation
  const config = new DocumentBuilder()
    .setTitle('Payroll Event Processing API')
    .setDescription('API for submitting and tracking employee payroll events')
    .setVersion('1.0')
    .addTag('Events', 'Payroll event submission and retrieval')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api-docs', app, document);

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  logger.log(`Application started on port ${port}`);
  logger.log(`API docs available at http://localhost:${port}/api-docs`);
  logger.log(`Frontend available at http://localhost:${port}/`);
}

bootstrap().catch((error) => {
  const logger = new Logger('Bootstrap');
  logger.error('Failed to start application:', error);
  process.exit(1);
});
