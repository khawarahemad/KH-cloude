import { Injectable } from '@nestjs/common';

@Injectable()
export class TraefikDriver {
  /**
   * Generates Traefik routing labels exactly matching the legacy projects.service.ts behavior.
   * This ensures zero routing downtime for existing applications.
   * 
   * @param containerName - The deterministic name of the app container (e.g. kh-cloud-app-slug-uuid)
   * @param hostnames - Array of full hostnames (e.g. ['test.khcloud.app', 'custom.com'])
   * @param port - Internal exposed container port
   * @param asArray - If true, returns an array of string labels suitable for child_process.spawn args. If false, returns a single space-separated string for exec.
   */
  public getApplicationLabels(
    containerName: string,
    hostnames: string[],
    port: number,
    asArray: boolean = true,
  ): string[] | string {
    const middlewareName = `${containerName}-spoof`;
    const hostRules = hostnames.map(h => asArray ? `Host("${h}")` : `Host(\\"${h}\\")`).join(' || ');

    const labels = [
      `traefik.enable=true`,
      `traefik.docker.network=kh-cloud-network`,
      `traefik.http.middlewares.${middlewareName}.headers.customrequestheaders.Host=localhost`,
      `traefik.http.routers.${containerName}.rule=${hostRules}`,
      `traefik.http.routers.${containerName}.entrypoints=websecure`,
      `traefik.http.routers.${containerName}.tls.certresolver=letsencrypt`,
      `traefik.http.routers.${containerName}.middlewares=${middlewareName}`,
      `traefik.http.services.${containerName}.loadbalancer.server.port=${port}`
    ];

    if (asArray) {
      // Return as flat args for spawn: ['-l', 'traefik.enable=true', ...]
      return labels.flatMap(label => ['-l', label]);
    } else {
      // Return as string for shell exec: -l "traefik.enable=true" -l "..."
      return labels.map(label => `-l "${label}"`).join(' ');
    }
  }
}
