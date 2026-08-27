import { Module } from '@nestjs/common';
import { NetworkingService } from './networking.service';
import { TraefikDriver } from './drivers/traefik.driver';
import { ProxyFactory } from './proxy/proxy.factory';
import { XrayDriver } from './proxy/xray.driver';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { RbacService } from '../guards/rbac.service';
import { NetworkingController } from './networking.controller';
import { DDoSModule } from '../guards/ddos.module';

@Module({
  imports: [PrismaModule, AuthModule, DDoSModule],
  controllers: [NetworkingController],
  providers: [NetworkingService, TraefikDriver, ProxyFactory, XrayDriver, RbacService],
  exports: [NetworkingService, TraefikDriver],
})
export class NetworkingModule {}
