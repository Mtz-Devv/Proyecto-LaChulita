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
import { RealtimeController } from './realtime/realtime.controller.js';
import { RealtimeService } from './realtime/realtime.service.js';
import { SeedService } from './seed.service.js';

const REQUIRED_ENV = ['DB_HOST', 'DB_USER', 'DB_NAME', 'JWT_SECRET'];

function validateEnv(env: Record<string, unknown>) {
  const missing = REQUIRED_ENV.filter((key) => !env[key]);
  if (missing.length) {
    throw new Error(`Faltan variables en el .env: ${missing.join(', ')}`);
  }
  return env;
}

@Module({
  imports: [

    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),

    TypeOrmModule.forRootAsync({
      useFactory: () => ({
        type: (process.env.DB_TYPE ?? 'mysql') as 'mysql',
        host: process.env.DB_HOST ?? '127.0.0.1',
        port: Number(process.env.DB_PORT ?? 3306),
        username: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        entities,
        synchronize: true,
      }),
    }),

    TypeOrmModule.forFeature(entities),

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
    RealtimeController,
  ],
  providers: [
    JwtStrategy,
    SeedService,
    RealtimeService,

    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule { }
