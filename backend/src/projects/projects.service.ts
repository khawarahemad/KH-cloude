import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectStatus, DeploymentStatus } from '@prisma/client';

@Injectable()
export class ProjectsService {
  private readonly logger = new Logger(ProjectsService.name);

  // Simulated live logs in-memory mapping deploymentId -> log lines
  private deploymentLogs = new Map<string, string[]>();

  constructor(private prisma: PrismaService) {}

  async createProject(data: {
    name: string;
    description?: string;
    teamId: string;
    githubRepo?: string;
    githubBranch?: string;
    buildCommand?: string;
    installCommand?: string;
    startCommand?: string;
    port?: number;
  }) {
    const slug = data.name.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    
    // Check slug uniqueness within team
    const existing = await this.prisma.project.findFirst({
      where: { teamId: data.teamId, slug },
    });
    if (existing) {
      throw new BadRequestException('A project with this name already exists in your team.');
    }

    const project = await this.prisma.project.create({
      data: {
        name: data.name,
        slug,
        description: data.description,
        teamId: data.teamId,
        githubRepo: data.githubRepo,
        githubBranch: data.githubBranch || 'main',
        buildCommand: data.buildCommand || 'npm run build',
        installCommand: data.installCommand || 'npm install',
        startCommand: data.startCommand || 'npm run start',
        port: data.port || 3000,
        status: 'INACTIVE',
      },
    });

    // Automatically create a default khawarahemad.com domain for the project
    await this.prisma.domain.create({
      data: {
        projectId: project.id,
        hostname: `${slug}.khawarahemad.com`,
        isCustom: false,
        status: 'ACTIVE',
        sslStatus: 'ACTIVE',
        verifiedAt: new Date(),
      },
    });

    await this.prisma.auditLog.create({
      data: {
        teamId: data.teamId,
        action: 'PROJECT.CREATE',
        targetType: 'PROJECT',
        targetId: project.id,
        details: JSON.stringify({ name: project.name, slug }),
      },
    });

    return project;
  }

  async getProjects(teamId: string) {
    return this.prisma.project.findMany({
      where: { teamId },
      include: {
        domains: true,
        deployments: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
  }

  async getProjectDetails(projectId: string, teamId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, teamId },
      include: {
        domains: true,
        envVars: true,
        deployments: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!project) {
      throw new NotFoundException('Project not found.');
    }
    return project;
  }

  async setEnvVars(projectId: string, vars: { key: string; value: string; isSecret: boolean }[]) {
    // Delete existing
    await this.prisma.envVar.deleteMany({ where: { projectId } });

    // Create new
    const created = await Promise.all(
      vars.map(v =>
        this.prisma.envVar.create({
          data: {
            projectId,
            key: v.key,
            value: v.value,
            isSecret: v.isSecret,
          },
        })
      )
    );

    return created;
  }

  async triggerDeployment(projectId: string, teamId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, teamId },
    });
    if (!project) throw new NotFoundException('Project not found.');

    // Create Deployment record
    const deployment = await this.prisma.deployment.create({
      data: {
        projectId,
        branch: project.githubBranch || 'main',
        status: 'QUEUED',
        buildLogs: 'Queued in building queue...\n',
      },
    });

    // Start background simulation
    this.runDeploymentSimulation(project.id, deployment.id);

    return deployment;
  }

  async getDeployments(projectId: string) {
    return this.prisma.deployment.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getDeploymentLogs(deploymentId: string) {
    const deployment = await this.prisma.deployment.findUnique({
      where: { id: deploymentId },
    });
    if (!deployment) throw new NotFoundException('Deployment not found.');

    const activeLogs = this.deploymentLogs.get(deploymentId) || [];
    return {
      status: deployment.status,
      logs: deployment.buildLogs + activeLogs.join('\n'),
    };
  }

  async restartProject(projectId: string, teamId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, teamId },
    });
    if (!project) throw new NotFoundException('Project not found.');

    await this.prisma.project.update({
      where: { id: projectId },
      data: { status: 'READY' },
    });

    await this.prisma.auditLog.create({
      data: {
        teamId,
        action: 'PROJECT.RESTART',
        targetType: 'PROJECT',
        targetId: projectId,
      },
    });

    return { success: true };
  }

  async rollbackDeployment(projectId: string, deploymentId: string, teamId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, teamId },
    });
    if (!project) throw new NotFoundException('Project not found.');

    const deployment = await this.prisma.deployment.findFirst({
      where: { id: deploymentId, projectId },
    });
    if (!deployment) throw new NotFoundException('Deployment not found.');

    // Create rollback deployment record
    const rollback = await this.prisma.deployment.create({
      data: {
        projectId,
        branch: deployment.branch,
        commitHash: deployment.commitHash,
        commitMessage: `Rollback to deployment ${deploymentId.substring(0, 8)}`,
        status: 'QUEUED',
        buildLogs: `Initiating rollback to deployment ${deploymentId}...\n`,
      },
    });

    this.runDeploymentSimulation(projectId, rollback.id);

    return rollback;
  }

  async addCustomDomain(projectId: string, hostname: string, teamId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, teamId },
    });
    if (!project) throw new NotFoundException('Project not found.');

    const domain = await this.prisma.domain.create({
      data: {
        projectId,
        hostname,
        isCustom: true,
        status: 'PENDING',
        sslStatus: 'PENDING',
      },
    });

    // Simulate Cloudflare DNS & SSL verification in 5 seconds
    setTimeout(async () => {
      await this.prisma.domain.update({
        where: { id: domain.id },
        data: {
          status: 'ACTIVE',
          sslStatus: 'ACTIVE',
          verifiedAt: new Date(),
        },
      });
    }, 5000);

    return domain;
  }

  async getProjectMetrics(projectId: string) {
    // Generate high-fidelity metric timeseries for dashboard graphs
    const now = new Date();
    const dataPoints = 20;
    const cpu: any[] = [];
    const ram: any[] = [];
    const network: any[] = [];

    for (let i = dataPoints - 1; i >= 0; i--) {
      const time = new Date(now.getTime() - i * 60 * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      cpu.push({ time, value: Math.floor(Math.sin(i / 2) * 15 + 30 + Math.random() * 8) });
      ram.push({ time, value: Math.floor(512 + Math.cos(i / 3) * 50 + Math.random() * 20) }); // MBs
      network.push({ time, rx: Math.floor(Math.random() * 200 + 50), tx: Math.floor(Math.random() * 150 + 20) }); // KB/s
    }

    return { cpu, ram, network };
  }

  private runDeploymentSimulation(projectId: string, deploymentId: string) {
    const logs: string[] = [];
    this.deploymentLogs.set(deploymentId, logs);

    const appendLog = (line: string) => {
      logs.push(`[${new Date().toISOString()}] ${line}`);
    };

    const steps = [
      {
        status: 'BUILDING' as DeploymentStatus,
        delay: 2000,
        action: () => {
          appendLog('GitHub repository connection initialized successfully.');
          appendLog('Cloning source code repository...');
          appendLog('Checking out to branch "main"...');
          appendLog('Commit SHA: f39d48128 (latest push)');
        },
      },
      {
        status: 'BUILDING' as DeploymentStatus,
        delay: 5000,
        action: () => {
          appendLog('Running install command: npm install...');
          appendLog('added 241 packages, audited 242 packages in 4s');
          appendLog('Running build command: npm run build...');
          appendLog('> next build');
          appendLog('   ▲ Next.js 15.1.0');
          appendLog('   - Creating an optimized production build ...');
          appendLog('   - Compiled successfully');
          appendLog('   - Collecting page data ...');
          appendLog('   - Generating static pages (5/5) ...');
          appendLog('   - Finalizing page optimization ...');
          appendLog('Route (app)                              Size     First Load JS');
          appendLog('┌ λ /                                    142 B          84.2 kB');
          appendLog('└ ○ /_not-found                          128 B          84.2 kB');
        },
      },
      {
        status: 'DEPLOYING' as DeploymentStatus,
        delay: 4000,
        action: () => {
          appendLog('Build succeeded. Preparing Docker container context...');
          appendLog('Successfully built image: kh-cloud/app-' + projectId.substring(0, 8));
          appendLog('Orchestrating container routing on Traefik edge proxies...');
          appendLog('Checking Let\'s Encrypt certificate status for custom domains...');
          appendLog('Let\'s Encrypt SSL status verified: OK');
        },
      },
      {
        status: 'READY' as DeploymentStatus,
        delay: 3000,
        action: () => {
          appendLog('Starting container checks...');
          appendLog('Container health probe: PASS (200 OK)');
          appendLog('Routing traffic to new container instances...');
          appendLog('Rolling deployment completed successfully. App is online!');
        },
      },
    ];

    let currentStep = 0;

    const executeNextStep = async () => {
      if (currentStep >= steps.length) {
        // Simulation finished
        const finalLogs = logs.join('\n');
        await this.prisma.deployment.update({
          where: { id: deploymentId },
          data: {
            status: 'READY',
            buildLogs: finalLogs,
            endedAt: new Date(),
            buildDuration: 14,
          },
        });
        await this.prisma.project.update({
          where: { id: projectId },
          data: { status: 'READY' },
        });
        this.deploymentLogs.delete(deploymentId);
        return;
      }

      const step = steps[currentStep];
      await this.prisma.deployment.update({
        where: { id: deploymentId },
        data: {
          status: step.status,
          startedAt: currentStep === 0 ? new Date() : undefined,
        },
      });

      step.action();
      currentStep++;
      setTimeout(executeNextStep, step.delay);
    };

    setTimeout(executeNextStep, 1000);
  }
}
