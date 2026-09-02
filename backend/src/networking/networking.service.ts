import { Injectable, Inject, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TraefikDriver } from './drivers/traefik.driver';
import { ProxyFactory } from './proxy/proxy.factory';
import { Redis } from 'ioredis';
import { ProjectNetwork, NetworkResource, NetworkResourceType, NetworkProvider, NetworkResourceStatus } from '@prisma/client';
import * as crypto from 'crypto';

@Injectable()
export class NetworkingService {
  private readonly logger = new Logger(NetworkingService.name);
  private readonly LOCK_TTL_MS = 30000;

  constructor(
    private readonly prisma: PrismaService,
    public readonly traefik: TraefikDriver,
    private readonly proxyFactory: ProxyFactory,
    @Inject('DDOS_REDIS') private readonly redis: Redis,
  ) {}

  /**
   * Lazily ensures a ProjectNetwork exists for the given project.
   */
  async ensureProjectNetwork(projectId: string): Promise<ProjectNetwork> {
    let network = await this.prisma.projectNetwork.findUnique({
      where: { projectId },
    });

    if (!network) {
      try {
        network = await this.prisma.projectNetwork.create({
          data: { projectId },
        });
        this.logger.log(`[Networking] Created ProjectNetwork for project ${projectId}`);
      } catch (err: any) {
        if (err.code === 'P2002') {
          network = await this.prisma.projectNetwork.findUnique({
            where: { projectId },
          });
        } else {
          throw err;
        }
      }
    }
    return network!;
  }

  async acquireLock<T>(projectId: string, fn: () => Promise<T>): Promise<T> {
    const lockKey = `networking:project:${projectId}`;
    const lockToken = crypto.randomUUID();
    
    const acquired = await this.redis.set(lockKey, lockToken, 'PX', this.LOCK_TTL_MS, 'NX');
    if (!acquired) {
      this.logger.warn(`[Networking] Could not acquire lock for project ${projectId}.`);
      throw new Error('Another networking reconciliation is in progress. Please try again.');
    }

    try {
      return await fn();
    } finally {
      const releaseScript = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
            return redis.call("del", KEYS[1])
        else
            return 0
        end
      `;
      await this.redis.eval(releaseScript, 1, lockKey, lockToken).catch(() => null);
    }
  }

  async reconcileProjectNetwork(projectId: string): Promise<void> {
    await this.acquireLock(projectId, async () => {
      this.logger.log(`[Networking] Reconciling networking for project ${projectId}`);
      const network = await this.ensureProjectNetwork(projectId);
      
      const project = await this.prisma.project.findUnique({
        where: { id: projectId },
        include: { domains: true }
      });
      if (!project) return;
      
      const canonicalDomain = project.domains.length > 0 ? project.domains[0].hostname : `${project.slug}.${process.env.BASE_DOMAIN || 'khawarahemad.com'}`;

      const resources = await this.prisma.networkResource.findMany({
        where: { networkId: network.id }
      });

      for (const resource of resources) {
        try {
          if (resource.type === NetworkResourceType.WEBSOCKET_PROXY) {
            const driver = this.proxyFactory.getDriver(resource.provider);
            
            await this.prisma.networkResource.update({
              where: { id: resource.id },
              data: { status: NetworkResourceStatus.PROVISIONING }
            });

            await driver.reconcile({ resource, canonicalDomain });
            
            const isHealthy = await driver.healthCheck(resource);
            if (isHealthy) {
              await this.prisma.networkResource.update({
                where: { id: resource.id },
                data: { status: NetworkResourceStatus.READY }
              });
            } else {
              throw new Error('Health check failed post-reconciliation');
            }
          }
        } catch (err: any) {
          this.logger.error(`Failed to reconcile resource ${resource.id}: ${err.message}`);
          await this.prisma.networkResource.update({
            where: { id: resource.id },
            data: { status: NetworkResourceStatus.ERROR }
          });
        }
      }
      this.logger.log(`[Networking] Finished reconciliation for project ${projectId}`);
    });
  }

  async enableProxy(projectId: string): Promise<NetworkResource> {
    const network = await this.ensureProjectNetwork(projectId);
    
    const existing = await this.prisma.networkResource.findUnique({
      where: {
        networkId_type: {
          networkId: network.id,
          type: NetworkResourceType.WEBSOCKET_PROXY
        }
      }
    });

    const credential = existing?.credential || crypto.randomUUID();

    // Create or update resource
    const resource = await this.prisma.networkResource.upsert({
      where: {
        networkId_type: {
          networkId: network.id,
          type: NetworkResourceType.WEBSOCKET_PROXY
        }
      },
      create: {
        networkId: network.id,
        type: NetworkResourceType.WEBSOCKET_PROXY,
        provider: NetworkProvider.XRAY,
        status: NetworkResourceStatus.PROVISIONING,
        credential,
      },
      update: {
        status: NetworkResourceStatus.PROVISIONING,
        credential,
      }
    });

    // Trigger reconciliation in background, don't await so API returns quickly
    this.reconcileProjectNetwork(projectId).catch(e => this.logger.error(e));

    return resource;
  }

  async disableProxy(projectId: string, resourceId: string): Promise<void> {
    const resource = await this.prisma.networkResource.findUnique({
      where: { id: resourceId }
    });
    if (!resource || resource.type !== NetworkResourceType.WEBSOCKET_PROXY) return;

    await this.acquireLock(projectId, async () => {
      const driver = this.proxyFactory.getDriver(resource.provider);
      await driver.remove(resource);
      
      await this.prisma.networkResource.delete({
        where: { id: resourceId }
      });
    });
  }

  async regenerateProxyCredential(projectId: string, resourceId: string): Promise<void> {
    const resource = await this.prisma.networkResource.findUnique({
      where: { id: resourceId }
    });
    if (!resource || resource.type !== NetworkResourceType.WEBSOCKET_PROXY) return;

    await this.acquireLock(projectId, async () => {
      const newCredential = crypto.randomUUID();
      
      // Update DB
      await this.prisma.networkResource.update({
        where: { id: resourceId },
        data: { 
          credential: newCredential,
          status: NetworkResourceStatus.PROVISIONING 
        }
      });

      // Synchronous reconciliation
      try {
        const project = await this.prisma.project.findUnique({
          where: { id: projectId },
          include: { domains: true }
        });
        if (!project) throw new Error('Project not found');
        const canonicalDomain = project.domains.length > 0 ? project.domains[0].hostname : `${project.slug}.${process.env.BASE_DOMAIN || 'khawarahemad.com'}`;

        const driver = this.proxyFactory.getDriver(resource.provider);
        const updatedResource = { ...resource, credential: newCredential };
        
        await driver.reconcile({ resource: updatedResource, canonicalDomain });
        
        const isHealthy = await driver.healthCheck(updatedResource);
        if (isHealthy) {
          await this.prisma.networkResource.update({
            where: { id: resourceId },
            data: { status: NetworkResourceStatus.READY }
          });
        } else {
          throw new Error('Health check failed post-reconciliation');
        }
      } catch (err: any) {
        this.logger.error(`Failed to reconcile resource ${resourceId} during credential regeneration: ${err.message}`);
        await this.prisma.networkResource.update({
          where: { id: resourceId },
          data: { status: NetworkResourceStatus.ERROR }
        });
        throw new Error('Credential was rotated in DB but failed to apply to Xray runtime. Check logs.');
      }
    });
  }
}
