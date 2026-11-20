import { HttpStatus, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { DatabaseErrorFilter, corsOrigin } from './common.js';
import { SeedService } from './seed.service.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  if (process.env.DB_FRESH === 'true' || process.env.DBFRESH === 'true') {
    await app.get(SeedService).run();
    await app.close();
    return;
  }

  app.setGlobalPrefix('api');

  app.enableCors({
    origin: corsOrigin(),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
    }),
  );

  app.useGlobalFilters(new DatabaseErrorFilter());

  await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
}
void bootstrap();
