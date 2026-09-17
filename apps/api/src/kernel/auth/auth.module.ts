import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { loadEnv } from '../../config/env';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtGuard } from './jwt.guard';
import { PermissionCacheService } from './permission-cache.service';
import { PermissionGuard } from './permission.guard';
import { SodService } from './sod.service';

@Global()
@Module({
  imports: [JwtModule.register({ secret: loadEnv().JWT_SECRET })],
  controllers: [AuthController],
  providers: [
    AuthService,
    PermissionCacheService,
    SodService,
    // Reihenfolge: erst Token → Kontext, dann Permission-Prüfung
    { provide: APP_GUARD, useClass: JwtGuard },
    { provide: APP_GUARD, useClass: PermissionGuard },
  ],
  exports: [AuthService, PermissionCacheService, SodService],
})
export class AuthModule {}
