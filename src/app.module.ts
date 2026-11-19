import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthController } from './auth/auth.controller.js';
import { JwtAuthGuard, RolesGuard } from './auth/guards.js';
import { JwtStrategy } from './auth/jwt.strategy.js';
import { CatalogsController } from './controllers/catalogs.controller.js';
import { MenuInventoryController } from './controllers/menu-inventory.controller.js';
import { OperationsController } from './controllers/operations.controller.js';
import { entities } from './entities/index.js';
import { SeedService } from './seed.service.js';

//Las variables que el sistema necesita si o si, si falta alguna mejor que truene al arrancar y no a media venta chiavito
const REQUIRED_ENV = ['DB_HOST', 'DB_USER', 'DB_NAME', 'JWT_SECRET'];

function validateEnv(env: Record<string, unknown>) {
  const missing = REQUIRED_ENV.filter((key) => !env[key]);
  if (missing.length) {
    throw new Error(`Faltan variables en el .env: ${missing.join(', ')}`);
  }
  return env;
}

//El modulo principal, aqui se junta todo: base de datos, tokens, guardias y controladores
@Module({
  imports: [
    //1. Lee el archivo .env y lo pone en process.env para que todos lo puedan usar
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),

    //Aqui mi estimado chiavieto es donde se configura la conexion a la base de datos para la persistencia de datos y que no se pierdan cuando se reinicie el servidor
    //2. Se usa forRootAsync para que lea el .env hasta que ConfigModule ya lo cargo
    TypeOrmModule.forRootAsync({
      useFactory: () => ({
        type: (process.env.DB_TYPE ?? 'mysql') as 'mysql',
        host: process.env.DB_HOST ?? '127.0.0.1',
        port: Number(process.env.DB_PORT ?? 3306),
        username: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        entities,
        synchronize: true, //Solo para desarrollo, en produccion se usan migraciones porque esto puede borrar datos
      }),
    }),

    //3. Los repositorios de las 15 tablas, para poder inyectarlos en los controladores con @InjectRepository
    TypeOrmModule.forFeature(entities),

    //4. Tokens: se firman con el JWT_SECRET y duran 8 horas, despues hay que volver a hacer login
    PassportModule,
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: process.env.JWT_SECRET,
        signOptions: { expiresIn: '8h' },
      }),
    }),
  ],
  controllers: [
    AuthController,
    CatalogsController,
    MenuInventoryController,
    OperationsController,
  ],
  providers: [
    JwtStrategy,
    SeedService,
    //Los dos perros guardianes corren en TODAS las rutas: primero el token (401) y luego el rol (403), ponte vrgas
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule { }
