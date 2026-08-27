import { Module, Global } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { TokenService } from './token.service';
import { JwtAuthGuard } from './jwt-auth.guard';

@Global()
@Module({
  providers: [
    TokenService,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
  exports: [TokenService],
})
export class AuthModule {}
