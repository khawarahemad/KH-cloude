import { Injectable, Logger } from '@nestjs/common';
import { NetworkResource, ProjectNetwork, Project } from '@prisma/client';
import { ProxyDriver, ProxyConnectionInfo, ProxyReconciliationContext } from './proxy.driver';
import { runDockerCmd } from '../../utils/docker-run';
import * as crypto from 'crypto';

@Injectable()
export class XrayDriver implements ProxyDriver {
  private readonly logger = new Logger(XrayDriver.name);
  private readonly XRAY_IMAGE = 'ghcr.io/xtls/xray-core:1.8.24';

  private getContainerName(resource: NetworkResource): string {
    return `kh-cloud-proxy-${resource.id}`;
  }

  private getVolumeName(resource: NetworkResource): string {
    return `proxy_data_${resource.id}`;
  }

  private generateXrayConfig(credential: string, path: string): any {
    return {
      log: {
        loglevel: "warning"
      },
      inbounds: [
        {
          port: 10000,
          protocol: "vless",
          settings: {
            clients: [
              {
                id: credential,
                flow: ""
              }
            ],
            decryption: "none"
          },
          streamSettings: {
            network: "ws",
            security: "none",
            wsSettings: {
              path: path
            }
          }
        }
      ],
      outbounds: [
        {
          protocol: "freedom",
          settings: {}
        }
      ]
    };
  }

  private getTraefikLabels(containerName: string, domain: string, path: string): string[] {
    return [
      `traefik.enable=true`,
      `traefik.docker.network=kh-cloud-network`,
      `traefik.http.routers.${containerName}.rule=Host("${domain}") && PathPrefix("${path}")`,
      `traefik.http.routers.${containerName}.entrypoints=websecure`,
      `traefik.http.routers.${containerName}.tls.certresolver=letsencrypt`,
      `traefik.http.services.${containerName}.loadbalancer.server.port=10000`
    ];
  }

  async reconcile(context: ProxyReconciliationContext): Promise<void> {
    const { resource, canonicalDomain } = context;
    if (!resource.credential) {
      throw new Error(`Cannot reconcile Xray without credential for resource ${resource.id}`);
    }

    const containerName = this.getContainerName(resource);
    const volumeName = this.getVolumeName(resource);
    const configPath = '/v2ray-ws';

    const config = this.generateXrayConfig(resource.credential, configPath);
    const configString = JSON.stringify(config);
    const configHash = crypto.createHash('sha256').update(configString).digest('hex');
    const labelHash = crypto.createHash('sha256').update(canonicalDomain).digest('hex');
    const desiredStateHash = `${configHash}-${labelHash}`;

    // Check if exactly this container is already running
    const inspectRes = await runDockerCmd(['inspect', '--format', '{{ index .Config.Labels "kh.cloud.xray.hash" }}', containerName]);
    if (inspectRes.code === 0 && inspectRes.stdout.trim() === desiredStateHash) {
      this.logger.debug(`[XrayDriver] Container ${containerName} is already up to date.`);
      return;
    }

    this.logger.log(`[XrayDriver] Reconciling container ${containerName}`);

    // Atomic write of config via transient alpine container.
    // Stdin guarantees no shell interpolation of the JSON.
    await runDockerCmd(['volume', 'create', volumeName]);
    const writeRes = await runDockerCmd([
      'run', '--rm', '-i',
      '--name', `${containerName}-config-writer`,
      '--network', 'none', // Strict isolation for writer
      '-v', `${volumeName}:/data`,
      'alpine', 'sh', '-c', 'cat > /data/config.json'
    ], configString);

    if (writeRes.code !== 0) {
      throw new Error(`Failed to write Xray config to volume: ${writeRes.stderr}`);
    }

    // Stop existing container if it exists
    await runDockerCmd(['rm', '-f', containerName]);

    const traefikLabels = this.getTraefikLabels(containerName, canonicalDomain, configPath);
    
    // Add the state hash label to avoid unnecessary recreations
    traefikLabels.push(`kh.cloud.xray.hash=${desiredStateHash}`);

    const runArgs = [
      'run', '-d',
      '--name', containerName,
      '--network', 'kh-cloud-network',
      '--restart', 'unless-stopped',
      '-v', `${volumeName}:/etc/xray:ro`,
      ...traefikLabels.map(l => `-l=${l}`),
      this.XRAY_IMAGE,
      'run', '-config', '/etc/xray/config.json'
    ];

    const runRes = await runDockerCmd(runArgs);
    if (runRes.code !== 0) {
      throw new Error(`Failed to start Xray container: ${runRes.stderr}`);
    }
    
    // Quick runtime check to verify it didn't immediately crash
    const health = await this.healthCheck(resource);
    if (!health) {
      throw new Error(`Xray container started but failed health check.`);
    }
  }

  async remove(resource: NetworkResource): Promise<void> {
    const containerName = this.getContainerName(resource);
    const volumeName = this.getVolumeName(resource);
    
    await runDockerCmd(['rm', '-f', containerName]);
    await runDockerCmd(['volume', 'rm', '-f', volumeName]);
    this.logger.log(`[XrayDriver] Removed container and volume for resource ${resource.id}`);
  }

  getConnectionInfo(context: ProxyReconciliationContext): ProxyConnectionInfo | null {
    const { resource, canonicalDomain } = context;
    if (!resource.credential || resource.status !== 'READY') return null;

    const path = '/v2ray-ws';
    // Match exact deployed router and standard XTLS VLESS URI
    const uri = `vless://${resource.credential}@${canonicalDomain}:443?encryption=none&security=tls&type=ws&path=${encodeURIComponent(path)}`;

    return {
      protocol: 'vless',
      address: canonicalDomain,
      port: 443,
      transport: 'ws',
      path: path,
      security: 'tls',
      uri
    };
  }

  async healthCheck(resource: NetworkResource): Promise<boolean> {
    const containerName = this.getContainerName(resource);
    const inspectRes = await runDockerCmd(['inspect', '-f', '{{.State.Running}}', containerName]);
    return inspectRes.stdout.trim() === 'true';
  }
}
