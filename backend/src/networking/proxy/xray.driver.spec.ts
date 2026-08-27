import { Test, TestingModule } from '@nestjs/testing';
import { XrayDriver } from './xray.driver';
import { TraefikDriver } from '../drivers/traefik.driver';
import { NetworkResource, NetworkResourceType, NetworkProvider, NetworkResourceStatus } from '@prisma/client';

describe('XrayDriver', () => {
  let driver: XrayDriver;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        XrayDriver,
        {
          provide: TraefikDriver,
          useValue: {
            getApplicationLabels: jest.fn().mockReturnValue([])
          }
        }
      ],
    }).compile();

    driver = module.get<XrayDriver>(XrayDriver);
  });

  it('should generate a valid VLESS URI without secret in generic calls', () => {
    const resource: NetworkResource = {
      id: 'test-res-123',
      networkId: 'net-1',
      type: NetworkResourceType.WEBSOCKET_PROXY,
      provider: NetworkProvider.XRAY,
      status: NetworkResourceStatus.READY,
      config: null,
      credential: 'secret-uuid',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const info = driver.getConnectionInfo({ resource, canonicalDomain: 'example.com' });
    
    expect(info).toBeDefined();
    expect(info!.protocol).toBe('vless');
    expect(info!.port).toBe(443);
    expect(info!.transport).toBe('ws');
    expect(info!.uri).toBe('vless://secret-uuid@example.com:443?encryption=none&security=tls&type=ws&path=%2Fv2ray-ws');
  });

  it('should generate correct Xray configuration object', () => {
    // Accessing private method for testing configuration correctness
    const config = (driver as any).generateXrayConfig('test-uuid-cred', '/v2ray-ws');
    
    expect(config.inbounds[0].protocol).toBe('vless');
    expect(config.inbounds[0].port).toBe(10000);
    expect(config.inbounds[0].settings.clients[0].id).toBe('test-uuid-cred');
    expect(config.inbounds[0].streamSettings.network).toBe('ws');
    expect(config.inbounds[0].streamSettings.wsSettings.path).toBe('/v2ray-ws');
    
    expect(config.outbounds[0].protocol).toBe('freedom');
  });
});
