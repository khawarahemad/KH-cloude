import { Test, TestingModule } from '@nestjs/testing';
import { TraefikDriver } from './traefik.driver';

describe('TraefikDriver', () => {
  let driver: TraefikDriver;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TraefikDriver],
    }).compile();

    driver = module.get<TraefikDriver>(TraefikDriver);
  });

  it('should generate identical Traefik labels as legacy ProjectsService', () => {
    const containerName = 'kh-cloud-app-test-uuid';
    const hostnames = ['test.khcloud.app', 'custom.com'];
    const port = 3000;

    const labels = driver.getApplicationLabels(containerName, hostnames, port, true) as string[];

    // Exact assertions mapped to previous manual logic
    expect(labels).toContain('traefik.enable=true');
    expect(labels).toContain('traefik.docker.network=kh-cloud-network');
    
    // Middlewares spoof logic
    const middlewareName = `${containerName}-spoof`;
    expect(labels).toContain(`traefik.http.middlewares.${middlewareName}.headers.customrequestheaders.Host=localhost`);
    expect(labels).toContain(`traefik.http.routers.${containerName}.middlewares=${middlewareName}`);

    // Router rules
    const expectedRule = 'Host("test.khcloud.app") || Host("custom.com")';
    expect(labels).toContain(`traefik.http.routers.${containerName}.rule=${expectedRule}`);
    
    // TLS & Entrypoints
    expect(labels).toContain(`traefik.http.routers.${containerName}.entrypoints=websecure`);
    expect(labels).toContain(`traefik.http.routers.${containerName}.tls.certresolver=letsencrypt`);

    // Port mapping
    expect(labels).toContain(`traefik.http.services.${containerName}.loadbalancer.server.port=${port}`);
  });
});
