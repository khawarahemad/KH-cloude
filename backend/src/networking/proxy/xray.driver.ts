import { Injectable, Logger } from '@nestjs/common';
import { NetworkResource } from '@prisma/client';
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
      dns: {
        servers: [
          "1.1.1.1",
          "8.8.8.8",
          "localhost"
        ]
      },
      inbounds: [
        {
          listen: "0.0.0.0",
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
          settings: {
            domainStrategy: "UseIP"
          }
        }
      ]
    };
  }

  private getTraefikLabels(containerName: string, hostnames: string[], path: string): string[] {
    const hostRules = hostnames.map(h => `Host("${h}")`).join(' || ');
    return [
      `traefik.enable=true`,
      `traefik.docker.network=kh-cloud-network`,
      `traefik.http.routers.${containerName}.rule=(${hostRules}) && PathPrefix("${path}")`,
      `traefik.http.routers.${containerName}.entrypoints=websecure`,
      `traefik.http.routers.${containerName}.tls.certresolver=letsencrypt`,
      `traefik.http.routers.${containerName}.priority=10000`,
      `traefik.http.services.${containerName}.loadbalancer.server.port=10000`
    ];
  }

  async reconcile(context: ProxyReconciliationContext): Promise<void> {
    const { resource, canonicalDomain, hostnames } = context;
    if (!resource.credential) {
      throw new Error(`Cannot reconcile Xray without credential for resource ${resource.id}`);
    }

    const containerName = this.getContainerName(resource);
    const volumeName = this.getVolumeName(resource);
    const configPath = '/v2ray-ws';
    const targetHosts = hostnames && hostnames.length > 0 ? hostnames : [canonicalDomain];

    const config = this.generateXrayConfig(resource.credential, configPath);
    const configString = JSON.stringify(config, null, 2);
    const configHash = crypto.createHash('sha256').update(configString).digest('hex');
    const labelHash = crypto.createHash('sha256').update(targetHosts.slice().sort().join(',')).digest('hex');
    const desiredStateHash = `${configHash}-${labelHash}`;

    // Check if exactly this container is already running and healthy
    const inspectRunning = await runDockerCmd(['inspect', '-f', '{{.State.Running}}', containerName]);
    const isRunning = inspectRunning.stdout.trim() === 'true';
    const inspectHash = await runDockerCmd(['inspect', '--format', '{{ index .Config.Labels "kh.cloud.xray.hash" }}', containerName]);
    
    if (isRunning && inspectHash.code === 0 && inspectHash.stdout.trim() === desiredStateHash) {
      this.logger.debug(`[XrayDriver] Container ${containerName} is already up to date and running.`);
      return;
    }

    this.logger.log(`[XrayDriver] Reconciling container ${containerName} with hostnames: ${targetHosts.join(', ')}`);

    // Ensure volume exists and write configuration with non-root readable permissions
    await runDockerCmd(['volume', 'create', volumeName]);
    await runDockerCmd(['rm', '-f', `${containerName}-writer`]);
    const writeRes = await runDockerCmd([
      'run', '--rm', '-i',
      '--name', `${containerName}-writer`,
      '--network', 'none', // Strict isolation for writer
      '-v', `${volumeName}:/data`,
      'alpine', 'sh', '-c', 'cat > /data/config.json && chmod 644 /data/config.json'
    ], configString);

    if (writeRes.code !== 0) {
      throw new Error(`Failed to write Xray config to volume: ${writeRes.stderr}`);
    }

    // Stop and remove existing container if it exists
    await runDockerCmd(['rm', '-f', containerName]);

    const traefikLabels = this.getTraefikLabels(containerName, targetHosts, configPath);
    traefikLabels.push(`kh.cloud.xray.hash=${desiredStateHash}`);

    const runArgs = [
      'run', '-d',
      '--name', containerName,
      '--network', 'kh-cloud-network',
      '--restart', 'unless-stopped',
      '-v', `${volumeName}:/etc/xray:ro`,
      ...traefikLabels.flatMap(l => ['--label', l]),
      this.XRAY_IMAGE,
      'run', '-config', '/etc/xray/config.json'
    ];

    const runRes = await runDockerCmd(runArgs);
    if (runRes.code !== 0) {
      throw new Error(`Failed to start Xray container: ${runRes.stderr || runRes.stdout}`);
    }
    
    // Allow container a moment to initialize before verifying health
    await new Promise(r => setTimeout(r, 1000));
    const health = await this.healthCheck(resource);
    if (!health) {
      const logsRes = await runDockerCmd(['logs', '--tail', '30', containerName]);
      this.logger.error(`[XrayDriver] Container ${containerName} failed health check. Logs: ${logsRes.stdout} ${logsRes.stderr}`);
      throw new Error(`Xray container started but failed health check: ${logsRes.stderr || logsRes.stdout || 'Exited unexpectedly'}`);
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
    // Standard XTLS VLESS WebSocket URI with TLS, SNI, and human-readable node remark:
    const encodedPath = encodeURIComponent(path);
    const uri = `vless://${resource.credential}@${canonicalDomain}:443?encryption=none&security=tls&sni=${canonicalDomain}&type=ws&path=${encodedPath}#${encodeURIComponent(canonicalDomain)}`;

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
