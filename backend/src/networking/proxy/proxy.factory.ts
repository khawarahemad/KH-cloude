import { Injectable, Logger } from '@nestjs/common';
import { NetworkProvider } from '@prisma/client';
import { ProxyDriver } from './proxy.driver';
import { XrayDriver } from './xray.driver';

@Injectable()
export class ProxyFactory {
  private readonly logger = new Logger(ProxyFactory.name);

  constructor(
    private readonly xrayDriver: XrayDriver,
  ) {}

  getDriver(provider: NetworkProvider): ProxyDriver {
    switch (provider) {
      case NetworkProvider.XRAY:
        return this.xrayDriver;
      default:
        this.logger.error(`Unsupported network provider: ${provider}`);
        throw new Error(`Unsupported network provider: ${provider}`);
    }
  }
}
