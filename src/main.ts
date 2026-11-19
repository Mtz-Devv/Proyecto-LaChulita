import { HttpStatus, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { DatabaseErrorFilter } from './common.js';
import { SeedService } from './seed.service.js';

//Aqui arranca todo el sistema chiavito
async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  //npm run seed → borra todo, crea las tablas, mete los datos de prueba y se apaga
  if (process.env.DB_FRESH === 'true' || process.env.DBFRESH === 'true') {
    await app.get(SeedService).run();
    await app.close();
    return;
  }

  //Todas las rutas empiezan con /api, asi @Get('categories') queda en /api/categories
  app.setGlobalPrefix('api');

  //Deja entrar al front aunque corra en otro puerto u otra laptop en la red local (configurable via CORS_ORIGIN en .env)
  const corsOrigin = process.env.CORS_ORIGIN?.trim();
  app.enableCors({
    origin: !corsOrigin || corsOrigin === '*'
      ? true
      : corsOrigin.split(',').map((item) => item.trim()),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  //Revisa cada @Body() contra su DTO antes de llegar al controlador, si algo esta mal responde 422
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, //Borra los campos que no estan en el DTO, para que no te metan cosas raras
      transform: true, //Convierte el JSON en una instancia del DTO
      errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY, //Datos mal → 422
    }),
  );

  //El traductor de errores de MySQL que esta en common.ts
  app.useGlobalFilters(new DatabaseErrorFilter());

  //0.0.0.0 permite recibir peticiones desde otras laptops en la misma red local (no solo localhost)
  await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
}
void bootstrap();
