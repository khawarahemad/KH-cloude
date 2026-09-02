import { Controller, Get, Post, Delete, Param, UseGuards, Req, Body, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { NetworkingService } from './networking.service';
import { RbacService } from '../guards/rbac.service';
import { ProxyFactory } from './proxy/proxy.factory';
import { PrismaService } from '../prisma/prisma.service';
import { NetworkResourceType, NetworkProvider } from '@prisma/client';

@Controller('api/projects/:projectId/networking/resources')
export class NetworkingController {
  private readonly logger = new Logger(NetworkingController.name);

  constructor(
    private readonly networkingService: NetworkingService,
    private readonly rbacService: RbacService,
    private readonly prisma: PrismaService,
    private readonly proxyFactory: ProxyFactory,
  ) {}

  private getUserId(req: any): string {
    return req.user?.id || (typeof req.user === 'string' ? req.user : '');
  }

  @Get()
  async getResources(@Param('projectId') projectId: string, @Req() req: any) {
    const userId = this.getUserId(req);
    await this.rbacService.verifyProjectAccess(userId, projectId, 'VIEWER');
    
    const network = await this.networkingService.ensureProjectNetwork(projectId);
    const resources = await this.prisma.networkResource.findMany({
      where: { networkId: network.id }
    });

    return resources.map(res => ({
      id: res.id,
      type: res.type,
      provider: res.provider,
      status: res.status,
      createdAt: res.createdAt,
      updatedAt: res.updatedAt
    }));
  }

  @Post()
  async enableResource(@Param('projectId') projectId: string, @Req() req: any, @Body() body: any) {
    const userId = this.getUserId(req);
    await this.rbacService.verifyProjectAccess(userId, projectId, 'DEVELOPER');
    
    // Explicitly validate supported configurations
    if (body.type && body.type !== NetworkResourceType.WEBSOCKET_PROXY) {
      throw new BadRequestException(`Unsupported resource type: ${body.type}`);
    }
    if (body.provider && body.provider !== NetworkProvider.XRAY) {
      throw new BadRequestException(`Unsupported provider: ${body.provider}`);
    }

    const resource = await this.networkingService.enableProxy(projectId);
    
    return {
      message: 'Proxy provisioning started',
      resourceId: resource.id
    };
  }

  @Get(':resourceId')
  async getResource(@Param('projectId') projectId: string, @Param('resourceId') resourceId: string, @Req() req: any) {
    const userId = this.getUserId(req);
    await this.rbacService.verifyProjectAccess(userId, projectId, 'VIEWER');
    
    const network = await this.networkingService.ensureProjectNetwork(projectId);
    const resource = await this.prisma.networkResource.findFirst({
      where: { id: resourceId, networkId: network.id }
    });

    if (!resource) {
      throw new NotFoundException('Resource not found');
    }

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { domains: true }
    });
    
    if (!project) throw new NotFoundException('Project not found');
    
    const canonicalDomain = project.domains.length > 0 ? project.domains[0].hostname : `${project.slug}.${process.env.BASE_DOMAIN || 'khawarahemad.com'}`;

    let connectionInfo = null;
    if (resource.type === NetworkResourceType.WEBSOCKET_PROXY) {
      const driver = this.proxyFactory.getDriver(resource.provider);
      connectionInfo = driver.getConnectionInfo({ resource, canonicalDomain });
    }

    return {
      id: resource.id,
      type: resource.type,
      provider: resource.provider,
      status: resource.status,
      createdAt: resource.createdAt,
      updatedAt: resource.updatedAt,
      connectionInfo
    };
  }

  @Delete(':resourceId')
  async removeResource(@Param('projectId') projectId: string, @Param('resourceId') resourceId: string, @Req() req: any) {
    const userId = this.getUserId(req);
    await this.rbacService.verifyProjectAccess(userId, projectId, 'DEVELOPER');
    
    const network = await this.networkingService.ensureProjectNetwork(projectId);
    const resource = await this.prisma.networkResource.findFirst({
      where: { id: resourceId, networkId: network.id }
    });

    if (!resource) {
      throw new NotFoundException('Resource not found');
    }

    await this.networkingService.disableProxy(projectId, resource.id);
    return { message: 'Resource removed' };
  }

  @Post(':resourceId/regenerate')
  async regenerateCredential(@Param('projectId') projectId: string, @Param('resourceId') resourceId: string, @Req() req: any) {
    const userId = this.getUserId(req);
    await this.rbacService.verifyProjectAccess(userId, projectId, 'DEVELOPER');
    
    const network = await this.networkingService.ensureProjectNetwork(projectId);
    const resource = await this.prisma.networkResource.findFirst({
      where: { id: resourceId, networkId: network.id }
    });

    if (!resource) {
      throw new NotFoundException('Resource not found');
    }

    await this.networkingService.regenerateProxyCredential(projectId, resource.id);
    
    return { message: 'Credential regeneration started' };
  }
}
