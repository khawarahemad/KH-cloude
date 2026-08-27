import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectStatus, DeploymentStatus } from '@prisma/client';
import { exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { sendDiscordNotification } from '../utils/discord-webhook';
import { GithubAppService } from '../github-app/github-app.service';

@Injectable()
export class ProjectsService {
  private readonly logger = new Logger(ProjectsService.name);

  // Simulated live logs in-memory mapping deploymentId -> log lines
  private deploymentLogs = new Map<string, string[]>();

  constructor(
    private prisma: PrismaService,
    private githubApp: GithubAppService,
  ) {}

  private getBaseDomain(): string {
    return process.env.BASE_DOMAIN || 'khawarahemad.com';
  }

  private getEnvFilePaths(projectId: string) {
    const isProdContainer = fs.existsSync('/usr/src/app/storage-mock');
    const localDir = isProdContainer ? '/usr/src/app/storage-mock/envs' : path.join(process.cwd(), 'storage-mock', 'envs');
    const localPath = path.join(localDir, `${projectId}.env`);
    const hostPath = isProdContainer ? `/var/lib/kh-cloud/storage-mock/envs/${projectId}.env` : localPath;
    return { localDir, localPath, hostPath };
  }

  private serializeEnvVars(vars: { key: string; value: string }[]): string {
    return vars
      .map(({ key, value }) => {
        const cleanKey = key.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '');
        if (!cleanKey) return '';
        const rawVal = value ?? '';
        return `${cleanKey}=${rawVal}`;
      })
      .filter(Boolean)
      .join('\n') + '\n';
  }

  private formatDockerEnvArgs(envVars: { key: string; value: string }[]): string {
    return envVars
      .map(({ key, value }) => {
        const cleanKey = key.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '');
        if (!cleanKey) return '';
        const escapedVal = (value ?? '').replace(/(["\\$`])/g, '\\$1');
        return `-e ${cleanKey}="${escapedVal}"`;
      })
      .filter(Boolean)
      .join(' ');
  }

  async syncProjectEnvFile(projectId: string, effectiveBuildDir?: string): Promise<{ localPath: string; hostPath: string; envVars: any[]; dockerEnvFlags: string }> {
    const { localDir, localPath, hostPath } = this.getEnvFilePaths(projectId);
    try {
      fs.mkdirSync(localDir, { recursive: true });
    } catch { /* ignore */ }

    const envVars = await this.prisma.envVar.findMany({ where: { projectId } });
    const content = this.serializeEnvVars(envVars);
    const dockerEnvFlags = this.formatDockerEnvArgs(envVars);

    try {
      fs.writeFileSync(localPath, content, 'utf8');
    } catch (err) {
      this.logger.warn(`Failed to write local env file at ${localPath}: ${err}`);
    }

    if (effectiveBuildDir && fs.existsSync(effectiveBuildDir)) {
      try {
        fs.writeFileSync(path.join(effectiveBuildDir, '.env'), content, 'utf8');
        fs.writeFileSync(path.join(effectiveBuildDir, '.env.production'), content, 'utf8');
        fs.writeFileSync(path.join(effectiveBuildDir, '.env.local'), content, 'utf8');
      } catch (err) {
        this.logger.warn(`Failed to write build dir .env files: ${err}`);
      }
    }

    return { localPath, hostPath, envVars, dockerEnvFlags };
  }

  async createProject(data: {
    name: string;
    description?: string;
    teamId: string;
    userId?: string;
    githubRepo?: string;
    githubBranch?: string;
    rootDirectory?: string;
    buildCommand?: string;
    installCommand?: string;
    startCommand?: string;
    port?: number;
    envVars?: { key: string; value: string; isSecret: boolean }[];
  }) {
    const slug = data.name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    
    // Check slug uniqueness within team
    const existing = await this.prisma.project.findFirst({
      where: { teamId: data.teamId, slug },
    });
    if (existing) {
      throw new BadRequestException('A project with this name already exists in your team.');
    }

    if (data.githubBranch && !/^[a-zA-Z0-9._\/-]{1,255}$/.test(data.githubBranch)) {
      throw new BadRequestException('Invalid GitHub branch name.');
    }

    const project = await this.prisma.project.create({
      data: {
        name: data.name,
        slug,
        description: data.description,
        teamId: data.teamId,
        githubRepo: data.githubRepo,
        githubBranch: data.githubBranch || 'main',
        rootDirectory: data.rootDirectory || '',
        buildCommand: data.buildCommand || null,
        installCommand: data.installCommand || null,
        startCommand: data.startCommand || null,
        port: data.port || 3000,
        status: 'INACTIVE',
        envVars: data.envVars && data.envVars.length > 0 ? {
          create: data.envVars.map(ev => ({
            key: ev.key,
            value: ev.value,
            isSecret: ev.isSecret !== undefined ? ev.isSecret : true
          }))
        } : undefined
      },
    });

    // Automatically create a default base domain for the project
    await this.prisma.domain.create({
      data: {
        projectId: project.id,
        hostname: `${slug}.${this.getBaseDomain()}`,
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

    // NOTE: Webhooks are automatically managed by the GitHub App installation.
    // No manual webhook registration needed here.

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
            key: v.key.trim().toUpperCase().replace(/[^A-Z0-9_]/g, ''),
            value: v.value,
            isSecret: v.isSecret,
          },
        })
      )
    );

    // Sync environment file to disk immediately
    await this.syncProjectEnvFile(projectId);

    return created;
  }

  async triggerDeployment(
    projectId: string,
    teamId: string,
    context?: {
      triggeredBy?: 'MANUAL' | 'GITOPS';
      triggeredByName?: string;  // e.g. "John Doe" or "GitHub Push by khawara"
      commitHash?: string;       // short 7-char SHA
      commitMessage?: string;    // first line of commit message
      commitAuthor?: string;     // git committer name
    },
  ) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, teamId },
    });
    if (!project) throw new NotFoundException('Project not found.');

    const trigBy = context?.triggeredBy || 'MANUAL';
    const trigName = context?.triggeredByName || null;

    // Create Deployment record with full attribution metadata
    const deployment = await this.prisma.deployment.create({
      data: {
        projectId,
        branch: project.githubBranch || 'main',
        triggeredBy: trigBy,
        triggeredByName: trigName,
        commitHash: context?.commitHash || null,
        commitMessage: context?.commitMessage || null,
        commitAuthor: context?.commitAuthor || null,
        status: 'QUEUED',
        buildLogs: trigBy === 'GITOPS'
          ? `[GitOps] Auto-deploy triggered by push from ${trigName || 'GitHub'}\n`
          : `[Manual] Deploy triggered by ${trigName || 'Dashboard user'}\n`,
      },
    });

    // Start background live deployment engine
    this.runLiveDeploymentEngine(project.id, deployment.id);

    return deployment;
  }

  async triggerGitOpsDeployment(
    repoFullName: string,
    branch: string,
    commitHash?: string,
    commitMessage?: string,
    pusher?: string,
    commitAuthor?: string,
  ) {
    this.logger.log(`GitOps: Received GitHub push webhook for repository "${repoFullName}" on branch "${branch}" (commit: ${commitHash || 'unknown'})`);

    // Only fetch projects that have a GitHub repo configured (avoids full table scan)
    const projectsWithRepo = await this.prisma.project.findMany({
      where: { githubRepo: { not: null } },
    });
    const cleanRepo = (url: string) => url.toLowerCase().replace(/https?:\/\/github\.com\//, '').replace(/\.git$/, '').trim();
    const webhookRepoCleaned = cleanRepo(repoFullName);

    const matching = projectsWithRepo.filter(p => {
      if (!p.githubRepo) return false;
      return cleanRepo(p.githubRepo) === webhookRepoCleaned && p.githubBranch === branch;
    });

    if (matching.length === 0) {
      this.logger.log(`GitOps: No matching projects found for ${repoFullName}@${branch}.`);
    }

    const triggeredByName = pusher ? `GitHub Push by ${pusher}` : 'GitHub Push';

    for (const project of matching) {
      this.logger.log(`GitOps: Match found! Auto-deploying project "${project.name}" (${project.id}) — commit ${commitHash || 'unknown'}`);
      this.triggerDeployment(project.id, project.teamId, {
        triggeredBy: 'GITOPS',
        triggeredByName,
        commitHash,
        commitMessage,
        commitAuthor,
      }).catch((err) => {
        this.logger.error(`GitOps: Failed to redeploy project ${project.id}: ${err.message}`);
      });
    }
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

    // Ensure environment variables are synchronized to disk before restart
    await this.syncProjectEnvFile(projectId);

    const cleanSlug = project.slug.toLowerCase().replace(/[^a-z0-9]/g, '');
    const containerName = `kh-cloud-app-${cleanSlug}-${project.id.substring(0, 8)}`;

    // Trigger Docker restart asynchronously on the VPS
    exec(`docker restart ${containerName}`, (error, stdout, stderr) => {
      if (error) {
        this.logger.error(`Failed to restart container ${containerName}: ${stderr}`);
      } else {
        this.logger.log(`Successfully restarted container ${containerName}`);
      }
    });

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
        triggeredBy: 'MANUAL',
        triggeredByName: 'Rollback',
        status: 'QUEUED',
        buildLogs: `[Manual Rollback] Initiating rollback to deployment ${deploymentId}...\n`,
      },
    });

    this.runLiveDeploymentEngine(projectId, rollback.id);

    return rollback;
  }

  async addCustomDomain(projectId: string, hostname: string, teamId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, teamId },
      include: { domains: true },
    });
    if (!project) throw new NotFoundException('Project not found.');

    if (!/^[a-zA-Z0-9][a-zA-Z0-9.-]*\.[a-zA-Z]{2,}$/.test(hostname)) {
      throw new BadRequestException('Invalid hostname format.');
    }

    const baseDomain = process.env.BASE_DOMAIN || 'khawarahemad.com';
    if (hostname.toLowerCase() === baseDomain || hostname.toLowerCase().endsWith(`.${baseDomain}`)) {
      throw new BadRequestException(`Cannot use core platform domain (${baseDomain}) as a custom domain.`);
    }

    const existingDomain = await this.prisma.domain.findUnique({
      where: { hostname },
    });
    if (existingDomain) {
      const { ConflictException } = require('@nestjs/common');
      throw new ConflictException(`The domain ${hostname} is already in use by another project.`);
    }

    const domain = await this.prisma.domain.create({
      data: {
        projectId,
        hostname,
        isCustom: true,
        status: 'PENDING',
        sslStatus: 'PENDING',
      },
    });

    // Re-route the live Docker container with updated Traefik labels
    // so that the new hostname gets SSL certificate from Let's Encrypt
    setImmediate(async () => {
      try {
        const runCmd = (file: string, args: string[]): Promise<{ code: number; stdout: string; stderr: string }> => {
          return new Promise((resolve) => {
            const { execFile } = require('child_process');
            const proc = execFile(file, args, { maxBuffer: 1024 * 1024 * 10 });
            let stdout = '';
            let stderr = '';
            proc.stdout?.on('data', (d: any) => { stdout += d.toString(); });
            proc.stderr?.on('data', (d: any) => { stderr += d.toString(); });
            proc.on('close', (code: number) => resolve({ code: code ?? 0, stdout, stderr }));
          });
        };

        const cleanSlug = project.slug.toLowerCase().replace(/[^a-z0-9]/g, '');
        const containerName = `kh-cloud-app-${cleanSlug}-${project.id.substring(0, 8)}`;

        // Inspect running container to get its image tag
        const inspectRes = await runCmd('docker', ['inspect', '--format', '{{.Config.Image}}', containerName]);
        if (inspectRes.code !== 0 || !inspectRes.stdout.trim()) {
          this.logger.warn(`[Domain Route] Container ${containerName} not found, skipping re-route.`);
          await this.prisma.domain.update({ where: { id: domain.id }, data: { status: 'ACTIVE', sslStatus: 'ACTIVE', verifiedAt: new Date() } });
          return;
        }

        const imageTag = inspectRes.stdout.trim();
        const containerPort = project.port || 3000;

        // Get all domains including the new one
        const allDomains = await this.prisma.domain.findMany({ where: { projectId } });
        const targetDomain = `${project.slug}.${this.getBaseDomain()}`;
        const hostnames = Array.from(new Set([targetDomain, ...allDomains.map(d => d.hostname)]));
        const hostRules = hostnames.map(hn => `Host("${hn}")`).join(' || ');
        const middlewareName = `${containerName}-hosthdr`;

        // Sync and get env flags
        const { dockerEnvFlags } = await this.syncProjectEnvFile(projectId);
        
        let envArgs: string[] = ['-e', 'HOST=0.0.0.0', '-e', `__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS=${hostnames.join(',')}`];
        if (dockerEnvFlags) {
           envArgs = envArgs.concat(dockerEnvFlags.split(' '));
        }

        // Stop old container
        await runCmd('docker', ['stop', containerName]).catch(() => null);
        await runCmd('docker', ['rm', containerName]).catch(() => null);

        // Start new container with updated Traefik labels
        const runArgs = [
          'run', '-d',
          '--name', containerName,
          '--network', 'kh-cloud-network',
          '-e', `PORT=${containerPort}`,
          ...envArgs,
          '--restart', 'unless-stopped',
          '-l', `traefik.enable=true`,
          '-l', `traefik.docker.network=kh-cloud-network`,
          '-l', `traefik.http.middlewares.${middlewareName}.headers.customrequestheaders.Host=localhost`,
          '-l', `traefik.http.routers.${containerName}.rule=${hostRules}`,
          '-l', `traefik.http.routers.${containerName}.entrypoints=websecure`,
          '-l', `traefik.http.routers.${containerName}.tls.certresolver=letsencrypt`,
          '-l', `traefik.http.routers.${containerName}.middlewares=${middlewareName}`,
          '-l', `traefik.http.services.${containerName}.loadbalancer.server.port=${containerPort}`,
          imageTag
        ];

        const rerunRes = await runCmd('docker', runArgs);
        if (rerunRes.code === 0) {
          this.logger.log(`[Domain Route] Container ${containerName} re-launched with ${hostname} in Traefik routing.`);
          await this.prisma.domain.update({ where: { id: domain.id }, data: { status: 'ACTIVE', sslStatus: 'ACTIVE', verifiedAt: new Date() } });
        } else {
          this.logger.error(`[Domain Route] Failed to re-launch container: ${rerunRes.stderr}`);
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(`[Domain Route] Error during container re-route: ${message}`);
        await this.prisma.domain.update({ where: { id: domain.id }, data: { status: 'ACTIVE', sslStatus: 'ACTIVE', verifiedAt: new Date() } }).catch(() => null);
      }
    });

    return domain;
  }

  async removeCustomDomain(projectId: string, domainId: string, teamId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, teamId },
      include: { domains: true },
    });
    if (!project) throw new NotFoundException('Project not found.');

    const domain = await this.prisma.domain.findFirst({
      where: { id: domainId, projectId },
    });
    if (!domain) throw new NotFoundException('Domain not found.');
    if (!domain.isCustom) throw new BadRequestException('Cannot delete default system domain.');

    await this.prisma.domain.delete({
      where: { id: domainId },
    });

    // Re-route the live Docker container with updated Traefik labels (removing the deleted hostname)
    setImmediate(async () => {
      try {
        const runCmd = (file: string, args: string[]): Promise<{ code: number; stdout: string; stderr: string }> => {
          return new Promise((resolve) => {
            const { execFile } = require('child_process');
            const proc = execFile(file, args, { maxBuffer: 1024 * 1024 * 10 });
            let stdout = '';
            let stderr = '';
            proc.stdout?.on('data', (d: any) => { stdout += d.toString(); });
            proc.stderr?.on('data', (d: any) => { stderr += d.toString(); });
            proc.on('close', (code: number) => resolve({ code: code ?? 0, stdout, stderr }));
          });
        };

        const cleanSlug = project.slug.toLowerCase().replace(/[^a-z0-9]/g, '');
        const containerName = `kh-cloud-app-${cleanSlug}-${project.id.substring(0, 8)}`;

        // Inspect running container to get its image tag
        const inspectRes = await runCmd('docker', ['inspect', '--format', '{{.Config.Image}}', containerName]);
        if (inspectRes.code !== 0 || !inspectRes.stdout.trim()) {
          this.logger.warn(`[Domain Remove] Container ${containerName} not found, skipping re-route.`);
          return;
        }

        const imageTag = inspectRes.stdout.trim();
        const containerPort = project.port || 3000;

        // Get remaining domains
        const allDomains = await this.prisma.domain.findMany({ where: { projectId } });
        const targetDomain = `${project.slug}.${this.getBaseDomain()}`;
        const hostnames = Array.from(new Set([targetDomain, ...allDomains.map(d => d.hostname)]));
        const hostRules = hostnames.map(hn => `Host("${hn}")`).join(' || ');
        const middlewareName = `${containerName}-hosthdr`;

        // Sync and get env flags
        const { dockerEnvFlags } = await this.syncProjectEnvFile(projectId);
        
        let envArgs: string[] = ['-e', 'HOST=0.0.0.0', '-e', `__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS=${hostnames.join(',')}`];
        if (dockerEnvFlags) {
           envArgs = envArgs.concat(dockerEnvFlags.split(' '));
        }

        // Stop old container
        await runCmd('docker', ['stop', containerName]).catch(() => null);
        await runCmd('docker', ['rm', containerName]).catch(() => null);

        // Start new container with updated Traefik labels
        const runArgs = [
          'run', '-d',
          '--name', containerName,
          '--network', 'kh-cloud-network',
          '-e', `PORT=${containerPort}`,
          ...envArgs,
          '--restart', 'unless-stopped',
          '-l', `traefik.enable=true`,
          '-l', `traefik.docker.network=kh-cloud-network`,
          '-l', `traefik.http.middlewares.${middlewareName}.headers.customrequestheaders.Host=localhost`,
          '-l', `traefik.http.routers.${containerName}.rule=${hostRules}`,
          '-l', `traefik.http.routers.${containerName}.entrypoints=websecure`,
          '-l', `traefik.http.routers.${containerName}.tls.certresolver=letsencrypt`,
          '-l', `traefik.http.routers.${containerName}.middlewares=${middlewareName}`,
          '-l', `traefik.http.services.${containerName}.loadbalancer.server.port=${containerPort}`,
          imageTag
        ];

        const rerunRes = await runCmd('docker', runArgs);
        if (rerunRes.code === 0) {
          this.logger.log(`[Domain Remove] Container ${containerName} re-launched after removing domain in Traefik routing.`);
        } else {
          this.logger.error(`[Domain Remove] Failed to re-launch container: ${rerunRes.stderr}`);
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(`[Domain Remove] Error during container re-route: ${message}`);
      }
    });

    return { success: true };
  }

  async deleteProject(projectId: string, teamId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, teamId },
    });
    if (!project) throw new NotFoundException('Project not found.');

    // Stop and remove the project's Docker container and images on the host VPS
    const cleanSlug = project.slug.toLowerCase().replace(/[^a-z0-9]/g, '');
    const containerName = `kh-cloud-app-${cleanSlug}-${project.id.substring(0, 8)}`;
    const repoName = `kh-cloud-${cleanSlug}`;

    exec(`docker stop ${containerName} && docker rm ${containerName}`, (error, stdout, stderr) => {
      if (error) {
        this.logger.error(`Failed to stop/remove container ${containerName}: ${stderr}`);
      } else {
        this.logger.log(`Successfully removed container ${containerName}`);
      }

      // Remove all Docker images and dangling layers for this deleted project
      exec(`docker images --format "{{.Repository}}:{{.Tag}}" ${repoName}`, (err, stdout) => {
        if (!err && stdout?.trim()) {
          const tags = stdout.trim().split('\n').filter(Boolean);
          for (const t of tags) {
            exec(`docker rmi -f ${t.trim()}`, () => {});
          }
        }
        exec('docker image prune -f', () => {
          exec('docker builder prune -f --keep-storage 500MB', () => {});
        });
      });
    });

    // Delete project from database (cascades to deployments, envVars, domains)
    await this.prisma.project.delete({
      where: { id: projectId },
    });

    await this.prisma.auditLog.create({
      data: {
        teamId,
        action: 'PROJECT.DELETE',
        targetType: 'PROJECT',
        targetId: projectId,
      },
    });

    return { success: true };
  }

  async stopProject(projectId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });
    if (!project) return;
    const cleanSlug = project.slug.toLowerCase().replace(/[^a-z0-9]/g, '');
    const containerName = `kh-cloud-app-${cleanSlug}-${project.id.substring(0, 8)}`;
    return new Promise((resolve) => {
      exec(`docker stop ${containerName} && docker rm ${containerName}`, (error, stdout, stderr) => {
        resolve({ success: !error });
      });
    });
  }

  async updateProject(
    projectId: string,
    data: { name?: string; buildCommand?: string; installCommand?: string; startCommand?: string; port?: number; githubBranch?: string; rootDirectory?: string; teamId: string }
  ) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, teamId: data.teamId },
    });
    if (!project) throw new NotFoundException('Project not found.');

    if (data.githubBranch && !/^[a-zA-Z0-9._\/-]{1,255}$/.test(data.githubBranch)) {
      throw new BadRequestException('Invalid GitHub branch name.');
    }

    const updated = await this.prisma.project.update({
      where: { id: projectId },
      data: {
        name: data.name ?? project.name,
        buildCommand: data.buildCommand ?? project.buildCommand,
        installCommand: data.installCommand !== undefined ? data.installCommand : project.installCommand,
        startCommand: data.startCommand ?? project.startCommand,
        port: data.port !== undefined ? data.port : project.port,
        githubBranch: data.githubBranch ?? project.githubBranch,
        rootDirectory: data.rootDirectory !== undefined ? data.rootDirectory : project.rootDirectory,
      },
    });

    return updated;
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

  private runLiveDeploymentEngine(projectId: string, deploymentId: string) {
    const logs: string[] = [];
    this.deploymentLogs.set(deploymentId, logs);

    const appendLog = (line: string) => {
      const formatted = `[${new Date().toISOString()}] ${line}`;
      logs.push(formatted);
      this.prisma.deployment.update({
        where: { id: deploymentId },
        data: { buildLogs: logs.join('\n') },
      }).catch(() => null);
    };

    const runCmd = (cmd: string, cwd?: string, customEnv: Record<string, string> = {}): Promise<{ code: number; stdout: string; stderr: string }> => {
      return new Promise((resolve) => {
        const proc = exec(cmd, {
          cwd,
          maxBuffer: 1024 * 1024 * 50,
          env: {
            ...process.env,
            DOCKER_BUILDKIT: '1',
            COMPOSE_DOCKER_CLI_BUILD: '1',
            ...customEnv,
          },
        });
        let stdout = '';
        let stderr = '';
        proc.stdout?.on('data', (data) => {
          const str = data.toString();
          stdout += str;
          str.split('\n').forEach((line: string) => {
            if (line.trim()) appendLog(line);
          });
        });
        proc.stderr?.on('data', (data) => {
          const str = data.toString();
          stderr += str;
          str.split('\n').forEach((line: string) => {
            if (line.trim()) appendLog(`[stderr] ${line}`);
          });
        });
        proc.on('close', (code) => {
          resolve({ code: code ?? 0, stdout, stderr });
        });
      });
    };

    const patchViteConfig = (dir: string) => {
      const findConfigFiles = (currentDir: string): string[] => {
        let results: string[] = [];
        if (!fs.existsSync(currentDir)) return results;
        const list = fs.readdirSync(currentDir);
        for (const file of list) {
          const filePath = path.join(currentDir, file);
          const stat = fs.statSync(filePath);
          if (stat && stat.isDirectory()) {
            if (file !== 'node_modules' && file !== '.git') {
              results = results.concat(findConfigFiles(filePath));
            }
          } else {
            if (file === 'vite.config.ts' || file === 'vite.config.js' || file === 'vite.config.mjs' || file === 'vite.config.cjs') {
              results.push(filePath);
            }
          }
        }
        return results;
      };

      try {
        const configFiles = findConfigFiles(dir);
        if (configFiles.length === 0) {
          appendLog(`[Vite Patcher] No vite.config.* files found in the project.`);
          return;
        }

        for (const filePath of configFiles) {
          const fileBasename = path.basename(filePath);
          try {
            let content = fs.readFileSync(filePath, 'utf8');
            const originalContent = content;

            if (content.includes('allowedHosts')) {
              appendLog(`[Vite Patcher] ${fileBasename} already contains allowedHosts configuration. Skipping patch.`);
              continue;
            }

            const serverRegex = /(['"]?)server\1\s*:\s*\{/;
            if (serverRegex.test(content)) {
              content = content.replace(serverRegex, (match) => `${match}\n    host: true,\n    allowedHosts: true,`);
            } else {
              const returnRegex = /return\s*\{/;
              const arrowReturnRegex = /=>\s*\(\s*\{/;
              const defineConfigRegex = /defineConfig\s*\(\s*\{/;
              const exportDefaultRegex = /export\s+default\s*\{/;
              const moduleExportsRegex = /module\.exports\s*=\s*\{/;

              if (defineConfigRegex.test(content)) {
                content = content.replace(defineConfigRegex, 'defineConfig({\n  server: {\n    host: true,\n    allowedHosts: true\n  },');
              } else if (exportDefaultRegex.test(content)) {
                content = content.replace(exportDefaultRegex, 'export default {\n  server: {\n    host: true,\n    allowedHosts: true\n  },');
              } else if (moduleExportsRegex.test(content)) {
                content = content.replace(moduleExportsRegex, 'module.exports = {\n  server: {\n    host: true,\n    allowedHosts: true\n  },');
              } else if (arrowReturnRegex.test(content)) {
                content = content.replace(arrowReturnRegex, '=> ({\n      server: { host: true, allowedHosts: true },');
              } else if (returnRegex.test(content)) {
                content = content.replace(returnRegex, 'return {\n      server: { host: true, allowedHosts: true },');
              }
            }

            if (content !== originalContent) {
              fs.writeFileSync(filePath, content, 'utf8');
              appendLog(`[Vite Patcher] Successfully patched ${fileBasename} at ${path.relative(dir, filePath)} to set server.host and server.allowedHosts to true`);
            }
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            appendLog(`[Vite Patcher] Failed to patch ${fileBasename}: ${message}`);
          }
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        appendLog(`[Vite Patcher] Error scanning for Vite configs: ${message}`);
      }
    };

    const startDeployment = async () => {
      let project: any = null;
      let cleanSlug = '';
      const buildDir = path.join('/usr/src/app/storage-mock/builds', deploymentId);
      try {
        project = await this.prisma.project.findUnique({ where: { id: projectId } });
        if (!project) {
          appendLog('Project not found. Deployment aborted.');
          return;
        }
        cleanSlug = project.slug.toLowerCase().replace(/[^a-z0-9]/g, '');

        const deployment = await this.prisma.deployment.findUnique({ where: { id: deploymentId } });
        if (!deployment) {
          appendLog('Deployment not found. Deployment aborted.');
          return;
        }

        await this.prisma.deployment.update({
          where: { id: deploymentId },
          data: { status: 'BUILDING', startedAt: new Date() },
        });

        sendDiscordNotification(project.teamId, 'deploy', {
          title: `🚀 Deployment Started: ${project.name}`,
          description: `A new deployment has been triggered for **${project.name}**.`,
          color: 8138221, // Purple
          fields: [
            { name: 'Branch', value: `\`${project.githubBranch || 'main'}\``, inline: true },
            { name: 'Triggered By', value: deployment.triggeredByName || 'Manual Action', inline: true },
            { name: 'Commit Message', value: deployment.commitMessage || 'No commit message', inline: false },
          ]
        });

        // 1. Prepare Workspace
        fs.mkdirSync(buildDir, { recursive: true });

        // 2. Clone Git Repo — prefer GitHub App installation token (works for org repos)
        let repoUrl = project.githubRepo;
        if (!repoUrl) {
          appendLog('No GitHub repository URL provided. Aborting.');
          throw new Error('No GitHub repository provided');
        }

        // Normalize owner/repo form
        const cleanRepoRef = (url: string) =>
          url.replace(/https?:\/\/github\.com\//i, '').replace(/\.git$/i, '').replace(/^\/+|\/+$/g, '').trim();
        const repoFullName = cleanRepoRef(repoUrl);
        const repoOwner = repoFullName.split('/')[0] || '';
        const teamInstallations = await this.prisma.githubInstallation.findMany({
          where: { teamId: project.teamId },
        });

        // ONLY collect candidate App installations that belong to this project's team!
        // Strictly isolated: never look up installations globally across other users/teams.
        type InstallCandidate = {
          installationId: string;
          accountLogin: string;
          accountType: string;
          via: string;
        };
        const candidates: InstallCandidate[] = [];
        const seenIds = new Set<string>();
        const pushCandidate = (c: InstallCandidate | null | undefined) => {
          if (!c?.installationId || seenIds.has(c.installationId)) return;
          seenIds.add(c.installationId);
          candidates.push(c);
        };

        // 1. Check if an installation belonging to this team matches the repo owner
        const matchingOwnerInst = repoOwner
          ? teamInstallations.find(
              (t) => t.accountLogin.toLowerCase() === repoOwner.toLowerCase(),
            )
          : null;

        if (matchingOwnerInst) {
          pushCandidate({
            installationId: matchingOwnerInst.installationId,
            accountLogin: matchingOwnerInst.accountLogin,
            accountType: matchingOwnerInst.accountType,
            via: 'team-owner-match',
          });
          appendLog(
            `Matched team GitHub App installation @${matchingOwnerInst.accountLogin} (${matchingOwnerInst.accountType}).`,
          );
        }

        // 2. Add any other installations linked to this team
        for (const tInst of teamInstallations) {
          pushCandidate({
            installationId: tInst.installationId,
            accountLogin: tInst.accountLogin,
            accountType: tInst.accountType,
            via: 'team-link',
          });
        }

        // Mint tokens for each candidate; try clone with the first that works.
        const installTokens: { token: string; source: string; accountLogin: string }[] = [];
        for (const c of candidates) {
          try {
            const token = await this.githubApp.getInstallationToken(c.installationId);
            installTokens.push({
              token,
              source: `GitHub App (@${c.accountLogin})`,
              accountLogin: c.accountLogin,
            });
          } catch (err: any) {
            appendLog(
              `[Warn] Failed to mint token for @${c.accountLogin} (${c.via}): ${err.message}`,
            );
          }
        }

        // OAuth fallback after App installs
        const teamMember = await this.prisma.teamMember.findFirst({
          where: { teamId: project.teamId, user: { githubAccessToken: { not: null } } },
          include: { user: true },
        });
        const oauthToken = teamMember?.user?.githubAccessToken || null;

        if (installTokens.length === 0 && !oauthToken) {
          appendLog('[Warn] No GitHub credentials available — public clone only.');
        } else if (installTokens.length === 0) {
          appendLog('[Warn] No GitHub App installation token available. Falling back to OAuth.');
        }

        const maskedRepoUrl = `https://github.com/${repoFullName}.git`;
        const branch = project.githubBranch || 'main';
        let cloneRes: { code: number; stdout: string; stderr: string } | null = null;
        const tryClone = async (token: string | null, source: string) => {
          const url = token
            ? `https://x-access-token:${token}@github.com/${repoFullName}.git`
            : `https://github.com/${repoFullName}.git`;
          appendLog(`Cloning branch "${branch}" from ${maskedRepoUrl} (auth: ${source})`);
          return runCmd(`git clone --depth 1 -b ${branch} "${url}" .`, buildDir);
        };

        for (const t of installTokens) {
          cloneRes = await tryClone(t.token, t.source);
          if (cloneRes.code === 0) break;
          const hint = (cloneRes.stderr || cloneRes.stdout || '').toLowerCase();
          const accessDenied =
            hint.includes('not found') ||
            hint.includes('repository not found') ||
            hint.includes('could not read from remote') ||
            hint.includes('authentication failed');
          if (!accessDenied) break; // non-auth failure — don't keep retrying
          appendLog(
            `[Warn] Clone failed with @${t.accountLogin}. Trying next GitHub App installation if available...`,
          );
          // Clear partial clone so next attempt can write into buildDir
          try {
            for (const entry of fs.readdirSync(buildDir)) {
              fs.rmSync(path.join(buildDir, entry), { recursive: true, force: true });
            }
          } catch { /* ignore */ }
        }

        if ((!cloneRes || cloneRes.code !== 0) && oauthToken) {
          cloneRes = await tryClone(oauthToken, 'OAuth (personal)');
        }

        if (!cloneRes) {
          cloneRes = await tryClone(null, 'none');
        }

        if (cloneRes.code !== 0) {
          const errHint = (cloneRes.stderr || cloneRes.stdout || '').toLowerCase();
          if (errHint.includes('not found') || errHint.includes('repository not found') || errHint.includes('could not read from remote')) {
            const ownerHint = repoOwner ? `@${repoOwner}` : 'the account that owns this repo';
            throw new Error(
              `Repository not found or access denied for "${repoFullName}". ` +
              `Open Configure on ${ownerHint} for kh-cloud-app and grant access to this repository, then redeploy.`,
            );
          }
          throw new Error('Failed to clone Git repository');
        }

        // Compute effective build directory if project.rootDirectory is configured
        let effectiveBuildDir = buildDir;
        if (project.rootDirectory) {
          const relativePath = project.rootDirectory.replace(/^\/+/, '');
          const targetPath = path.resolve(buildDir, relativePath);
          if (targetPath.startsWith(buildDir)) {
            effectiveBuildDir = targetPath;
            appendLog(`[Smart Builder] Using custom root directory: ${relativePath}`);
          } else {
            appendLog(`[Smart Builder] Warning: Invalid root directory path "${project.rootDirectory}". Defaulting to repository root.`);
          }
        }

        // Patch Vite configuration for host check bypass inside effective directory
        patchViteConfig(effectiveBuildDir);

        // 3. Auto-generate Dockerfile if none exists
        const dockerfilePath = path.join(effectiveBuildDir, 'Dockerfile');
        if (!fs.existsSync(dockerfilePath)) {
          appendLog('No Dockerfile found in root directory. Running smart engine to auto-generate one...');
          
          // Case 1: Node.js Project (package.json exists)
          if (fs.existsSync(path.join(effectiveBuildDir, 'package.json'))) {
            appendLog('Detected Node.js application (package.json found). Checking build configuration...');
            let hasBuildScript = false;
            let detectedStartCommand = 'npm start';
            let detectedPort = project.port || 3000;
            
            const isPnpm = fs.existsSync(path.join(effectiveBuildDir, 'pnpm-lock.yaml'));
            const isYarn = fs.existsSync(path.join(effectiveBuildDir, 'yarn.lock'));
            const isBun = fs.existsSync(path.join(effectiveBuildDir, 'bun.lockb')) || fs.existsSync(path.join(effectiveBuildDir, 'bun.lock'));

            if (isPnpm) {
              appendLog('pnpm-lock.yaml detected. Preparing pnpm manager configuration...');
              detectedStartCommand = 'pnpm start';
            } else if (isYarn) {
              appendLog('yarn.lock detected. Preparing yarn manager configuration...');
              detectedStartCommand = 'yarn start';
            } else if (isBun) {
              appendLog('bun.lock detected. Preparing bun manager configuration...');
              detectedStartCommand = 'bun start';
            }

            try {
              const packageJson = JSON.parse(fs.readFileSync(path.join(effectiveBuildDir, 'package.json'), 'utf8'));
              const scripts = packageJson.scripts || {};
              hasBuildScript = !!scripts.build;
              
              if (scripts.start) {
                // Keep default detectedStartCommand
              } else if (scripts.dev) {
                appendLog('No "start" script found. Falling back to "dev" script...');
                detectedStartCommand = isPnpm ? 'pnpm run dev' :
                                       isYarn ? 'yarn dev' :
                                       isBun ? 'bun run dev' : 'npm run dev';
              } else if (packageJson.main && fs.existsSync(path.join(effectiveBuildDir, packageJson.main))) {
                appendLog(`No start script found. Launching main entrypoint file: node ${packageJson.main}`);
                detectedStartCommand = `node ${packageJson.main}`;
              } else {
                // Look for common files
                const entries = ['server.js', 'app.js', 'index.js', 'main.js'];
                const found = entries.find(f => fs.existsSync(path.join(effectiveBuildDir, f)));
                if (found) {
                  appendLog(`Detected entrypoint file "${found}". Launching: node ${found}`);
                  detectedStartCommand = `node ${found}`;
                } else {
                  appendLog(`Warning: No clear startup script detected. Defaulting to: ${detectedStartCommand}`);
                }
              }
            } catch (err: unknown) {
              const message = err instanceof Error ? err.message : String(err);
              appendLog(`Failed to parse package.json: ${message}. Defaulting to npm start.`);
              hasBuildScript = true; // Attempt build step on parse failures
            }

            // Prefer user-configured install/build/start from project settings
            const customInstall = typeof project.installCommand === 'string' ? project.installCommand.trim() : '';
            const customBuild = typeof project.buildCommand === 'string' ? project.buildCommand.trim() : null;
            const customStart = typeof project.startCommand === 'string' ? project.startCommand.trim() : '';

            const commandBlob = `${customInstall} ${customBuild || ''} ${customStart} ${detectedStartCommand}`;
            // Ensure package managers exist in the image when lockfiles or commands need them
            // (e.g. install=npm but build/start=pnpm → previously failed with "pnpm: not found")
            const needsPnpm = isPnpm || /\bpnpm\b/.test(commandBlob);
            // Prefer pnpm when both lockfiles exist; only pull in bun if commands explicitly use it
            const needsBun =
              /\b(?:bun|bunx)\s/.test(`${commandBlob} `) ||
              (isBun && !needsPnpm && !isYarn);

            let installSteps: string;
            if (customInstall) {
              let installCmd = customInstall;
              if (needsPnpm && !/\bnpm install -g pnpm\b/.test(installCmd) && !/\bcorepack\b/.test(installCmd)) {
                installCmd = `npm install -g pnpm && ${installCmd}`;
              }
              if (needsBun && !/\bnpm install -g bun\b/.test(installCmd)) {
                installCmd = `npm install -g bun && ${installCmd}`;
              }
              installSteps = `RUN ${installCmd}`;
              appendLog(`Using configured install command: ${customInstall}`);
              if (installCmd !== customInstall) {
                appendLog(`Bootstrapping package manager before install (effective: ${installCmd})`);
              }
            } else if (isPnpm || needsPnpm) {
              installSteps = 'RUN npm install -g pnpm && pnpm install';
            } else if (isYarn) {
              installSteps = 'RUN yarn install';
            } else if (isBun || needsBun) {
              installSteps = 'RUN npm install -g bun && bun install';
            } else {
              installSteps = 'RUN npm install';
            }

            let buildSteps = '';
            if (customBuild !== null) {
              // Explicit setting (including empty string = skip build)
              buildSteps = customBuild ? `RUN ${customBuild}` : '';
              if (customBuild) appendLog(`Using configured build command: ${customBuild}`);
              else appendLog('Build command left empty — skipping build step.');
            } else if (hasBuildScript) {
              buildSteps = needsPnpm || isPnpm
                ? 'RUN pnpm build'
                : isYarn
                  ? 'RUN yarn build'
                  : needsBun || isBun
                    ? 'RUN bun run build'
                    : 'RUN npm run build';
            }

            const runCmdText = customStart || detectedStartCommand;
            if (customStart) appendLog(`Using configured start command: ${customStart}`);

            // Build the Dockerfile lines dynamically, stripping out empty lines (like buildSteps if no build script exists)
            // CMD uses shell exec form so signals propagate correctly to the Node process
            const dockerfileContent = [
              'FROM node:20-alpine',
              'WORKDIR /app',
              'COPY package*.json ./',
              'COPY pnpm-lock.yaml* yarn.lock* package-lock.json* bun.lockb* bun.lock* ./',
              installSteps,
              'COPY . .',
              buildSteps,
              `EXPOSE ${detectedPort}`,
              `CMD ["sh", "-c", "${runCmdText.replace(/"/g, '\\"')}"]`
            ].filter(Boolean).join('\n');

            fs.writeFileSync(dockerfilePath, dockerfileContent);
            appendLog(`Generated Node.js Dockerfile (Port: ${detectedPort}, CMD: ${runCmdText}, Has Build: ${!!buildSteps})`);
            
            // Sync port to DB if not set
            if (!project.port) {
              await this.prisma.project.update({ where: { id: projectId }, data: { port: detectedPort } });
              project.port = detectedPort;
            }
          }
          // Case 2: Python Project (requirements.txt exists)
          else if (fs.existsSync(path.join(effectiveBuildDir, 'requirements.txt'))) {
            appendLog('Detected Python application (requirements.txt found). Generating configuration...');
            let detectedStartCommand = 'python app.py';
            let detectedPort = project.port || 8000;

            const entrypoints = ['app.py', 'main.py', 'server.py', 'wsgi.py'];
            const found = entrypoints.find(f => fs.existsSync(path.join(effectiveBuildDir, f)));
            if (found) {
              detectedStartCommand = `python ${found}`;
            }

            const customInstall = typeof project.installCommand === 'string' ? project.installCommand.trim() : '';
            const customStart = typeof project.startCommand === 'string' ? project.startCommand.trim() : '';
            const installCmd = customInstall || 'pip install --no-cache-dir -r requirements.txt';
            const runCmdText = customStart || project.startCommand || detectedStartCommand;
            if (customInstall) appendLog(`Using configured install command: ${customInstall}`);
            if (customStart) appendLog(`Using configured start command: ${customStart}`);

            const defaultDockerfile = `FROM python:3.10-slim\nWORKDIR /app\nCOPY requirements.txt .\nRUN ${installCmd}\nCOPY . .\nEXPOSE ${detectedPort}\nCMD ["sh", "-c", "${runCmdText.replace(/"/g, '\\"')}"]`;
            fs.writeFileSync(dockerfilePath, defaultDockerfile);
            appendLog(`Generated Python Dockerfile (Port: ${detectedPort}, CMD: ${runCmdText})`);
            
            // Sync port to DB if not set
            if (!project.port) {
              await this.prisma.project.update({ where: { id: projectId }, data: { port: detectedPort } });
              project.port = detectedPort;
            }
          }
          // Case 3: Go Project (go.mod exists)
          else if (fs.existsSync(path.join(effectiveBuildDir, 'go.mod'))) {
            appendLog('Detected Go application (go.mod found). Generating builder configuration...');
            let detectedPort = project.port || 8080;
            const defaultDockerfile = `FROM golang:1.21-alpine AS builder\nWORKDIR /app\nCOPY go.mod go.sum* ./\nRUN go mod download --if-present\nCOPY . .\nRUN CGO_ENABLED=0 GOOS=linux go build -o main .\nFROM alpine:latest\nWORKDIR /app\nCOPY --from=builder /app/main .\nEXPOSE ${detectedPort}\nCMD ["./main"]`;
            fs.writeFileSync(dockerfilePath, defaultDockerfile);
            appendLog(`Generated Go builder Dockerfile (Port: ${detectedPort})`);
            
            // Sync port to DB if not set
            if (!project.port) {
              await this.prisma.project.update({ where: { id: projectId }, data: { port: detectedPort } });
              project.port = detectedPort;
            }
          }
          // Case 4: Static HTML Nginx fallback
          else {
            appendLog('No code dependency files found. Generating static Nginx web server...');
            const defaultDockerfile = `FROM nginx:alpine\nCOPY . /usr/share/nginx/html\nEXPOSE 80`;
            fs.writeFileSync(dockerfilePath, defaultDockerfile);
            appendLog('Generated static HTML Nginx Dockerfile (Port: 80)');
            
            // Force port 80 for static
            if (project.port !== 80) {
              await this.prisma.project.update({ where: { id: projectId }, data: { port: 80 } });
              project.port = 80;
            }
          }
        } else {
          appendLog('Dockerfile detected in repository root. Using repository Dockerfile for deployment.');
        }

        // 3.5 Synchronize environment variables to build directory (.env, .env.production, .env.local) and persistent host storage
        const { dockerEnvFlags, envVars } = await this.syncProjectEnvFile(projectId, effectiveBuildDir);
        appendLog(`[Env Engine] Injected ${envVars.length} environment variables into build workspace (.env) and runtime config.`);

        // 4. Build Docker Image (BuildKit Engine with Smart Layer Recovery)
        cleanSlug = project.slug.toLowerCase().replace(/[^a-z0-9]/g, '');
        const imageTag = `kh-cloud-${cleanSlug}:${deploymentId}`;
        const containerName = `kh-cloud-app-${cleanSlug}-${project.id.substring(0, 8)}`;

        // Pre-build health check: keep builder cache bounded before starting heavy builds
        await runCmd('docker builder prune -f --keep-storage 2GB', buildDir).catch(() => null);

        appendLog(`Starting Docker image build (BuildKit engine): ${imageTag}`);
        let buildRes = await runCmd(`DOCKER_BUILDKIT=1 docker build -t ${imageTag} .`, effectiveBuildDir);

        if (buildRes.code !== 0) {
          const errText = `${buildRes.stderr || ''} ${buildRes.stdout || ''}`.toLowerCase();
          const isSnapshotterOrCacheError =
            errText.includes('failed to export layer') ||
            errText.includes('creatediff') ||
            errText.includes('mount callback failed') ||
            errText.includes('no such file or directory') ||
            errText.includes('failed to commit') ||
            errText.includes('no space left on device') ||
            errText.includes('context canceled');

          if (isSnapshotterOrCacheError) {
            appendLog('[Smart Builder Recovery] Detected containerd snapshotter / builder cache issue.');
            appendLog('[Smart Builder Recovery] Clearing stale builder cache and retrying build with fresh cache...');
            await runCmd('docker builder prune -af', buildDir).catch(() => null);
            await new Promise((r) => setTimeout(r, 2000));
            buildRes = await runCmd(`DOCKER_BUILDKIT=1 docker build --no-cache -t ${imageTag} .`, effectiveBuildDir);
          }

          if (buildRes.code !== 0) {
            throw new Error('Docker build process failed');
          }
        }

        // 5. Update Status to Deploying
        await this.prisma.deployment.update({
          where: { id: deploymentId },
          data: { status: 'DEPLOYING' },
        });

        // 6. Zero-Downtime Blue-Green Staging: Put current running container in standby
        const isContainerRunning = async (name: string): Promise<boolean> => {
          try {
            const res = await runCmd(`docker inspect -f '{{.State.Running}}' ${name}`, buildDir);
            return res.stdout.trim() === 'true';
          } catch {
            return false;
          }
        };

        const standbyContainerName = `${containerName}-standby`;
        const hadActiveContainer = await isContainerRunning(containerName);

        if (hadActiveContainer) {
          appendLog(`[Zero-Downtime] Active container is online. Staging it to standby (${standbyContainerName}) during deployment.`);
          await runCmd(`docker rm -f ${standbyContainerName}`, buildDir).catch(() => null);
          await runCmd(`docker rename ${containerName} ${standbyContainerName}`, buildDir).catch(() => null);
        } else {
          // Clean up any stopped or residual container with this name
          await runCmd(`docker rm -f ${containerName}`, buildDir).catch(() => null);
        }

        // 7. Start container with Traefik routing labels and environment variables
        
        // Fetch all active domains associated with the project
        const projectDomains = await this.prisma.domain.findMany({
          where: { projectId },
        });
        const targetDomain = `${project.slug}.${this.getBaseDomain()}`;
        const hostnames = Array.from(new Set([targetDomain, ...projectDomains.map(d => d.hostname)]));
        const hostRules = hostnames.map(hn => `Host(\\"${hn}\\")`).join(' || ');

        // Use auto-generated Node server port (3000) or static nginx port (80)
        let containerPort = project.port || 3000;
        if (!fs.existsSync(path.join(effectiveBuildDir, 'package.json')) && !fs.existsSync(dockerfilePath)) {
          // If we auto-generated nginx, the containerPort is 80
          containerPort = 80;
        }
        
        // Auto-inject HOST=0.0.0.0 for Node/Python/web framework routing safety
        const isNodeProject = fs.existsSync(path.join(effectiveBuildDir, 'package.json'));
        const isPythonProject = fs.existsSync(path.join(effectiveBuildDir, 'requirements.txt'));
        const autoEnvFlags = (isNodeProject || isPythonProject) ? '-e HOST=0.0.0.0' : '';
        
        // Auto-inject Vite allowedHosts parameter to bypass host checks in Vite 6+
        const allowedHostsVal = hostnames.join(',');
        const viteAllowedHostsFlag = isNodeProject ? `-e __VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS="${allowedHostsVal}"` : '';
        const pythonEnvFlags = isPythonProject ? '-e PYTHONUNBUFFERED=1' : '';

        const envFlags = [
          autoEnvFlags,
          pythonEnvFlags,
          viteAllowedHostsFlag,
          dockerEnvFlags,
        ].filter(Boolean).join(' ');

        const middlewareName = `${containerName}-hosthdr`;
        let runCmdString = [
          'docker run -d',
          `--name ${containerName}`,
          `--network kh-cloud-network`,
          `-e PORT=${containerPort}`,
          envFlags,
          `--restart unless-stopped`,
          `-l "traefik.enable=true"`,
          `-l "traefik.docker.network=kh-cloud-network"`,
          `-l "traefik.http.middlewares.${middlewareName}.headers.customrequestheaders.Host=localhost"`,
          `-l "traefik.http.routers.${containerName}.rule=${hostRules}"`,
          `-l "traefik.http.routers.${containerName}.entrypoints=websecure"`,
          `-l "traefik.http.routers.${containerName}.tls.certresolver=letsencrypt"`,
          `-l "traefik.http.routers.${containerName}.middlewares=${middlewareName}"`,
          `-l "traefik.http.services.${containerName}.loadbalancer.server.port=${containerPort}"`,
          imageTag
        ].filter(Boolean).join(' ');

        appendLog(`Deploying container to Traefik routing mesh...`);
        let runRes = await runCmd(runCmdString, buildDir);
        if (runRes.code !== 0) {
          const conflictHint = `${runRes.stderr || ''} ${runRes.stdout || ''}`.toLowerCase();
          if (conflictHint.includes('already in use') || conflictHint.includes('conflict')) {
            appendLog('Container name conflict detected — cleaning up residual name and retrying once...');
            await runCmd(`docker rm -f ${containerName}`, buildDir).catch(() => null);
            runRes = await runCmd(runCmdString, buildDir);
          }
          if (runRes.code !== 0) {
            throw new Error(`Failed to run container: ${runRes.stderr || 'Unknown Docker error'}`);
          }
        }

        // 8. Smart port auto-detection & health validation
        appendLog(`Waiting for container initialization and reading startup logs...`);
        await new Promise((resolve) => setTimeout(resolve, 3000));
        
        const logsRes = await runCmd(`docker logs ${containerName}`, buildDir).catch(() => ({ stdout: '', stderr: '' }));
        const logsCombined = (logsRes.stdout || '') + '\n' + (logsRes.stderr || '');

        const detectPortFromLogs = (logText: string): number | null => {
          const regexes = [
            /localhost:(\d+)/i,
            /127\.0\.0\.1:(\d+)/i,
            /0\.0\.0\.0:(\d+)/i,
            /network.*?:\s*http:\/\/.*?:(\d+)/i,
            /listening\s+on\s+(?:port\s+)?(\d+)/i,
            /listening\s+at\s+.*?:\s*(\d+)/i,
            /port\s*:\s*(\d+)/i
          ];
          for (const rx of regexes) {
            const match = logText.match(rx);
            if (match) {
              const p = parseInt(match[1], 10);
              if (p >= 80 && p <= 65535) return p;
            }
          }
          return null;
        };

        const detectedPort = detectPortFromLogs(logsCombined);
        if (detectedPort && detectedPort !== containerPort) {
          appendLog(`Smart Engine: Auto-detected container listening on port ${detectedPort} (configured: ${containerPort}).`);
          appendLog(`Smart Engine: Re-routing Traefik load balancer to port ${detectedPort}...`);

          // Update project target port in DB
          await this.prisma.project.update({
            where: { id: projectId },
            data: { port: detectedPort }
          });

          // Stop and remove current container to re-run with correct port
          await runCmd(`docker rm -f ${containerName}`, buildDir).catch(() => null);

          // Rebuild run string with the auto-detected port
          containerPort = detectedPort;
          runCmdString = [
            'docker run -d',
            `--name ${containerName}`,
            `--network kh-cloud-network`,
            `-e PORT=${containerPort}`,
            envFlags,
            `--restart unless-stopped`,
            `-l "traefik.enable=true"`,
            `-l "traefik.docker.network=kh-cloud-network"`,
            `-l "traefik.http.middlewares.${middlewareName}.headers.customrequestheaders.Host=localhost"`,
            `-l "traefik.http.routers.${containerName}.rule=${hostRules}"`,
            `-l "traefik.http.routers.${containerName}.entrypoints=websecure"`,
            `-l "traefik.http.routers.${containerName}.tls.certresolver=letsencrypt"`,
            `-l "traefik.http.routers.${containerName}.middlewares=${middlewareName}"`,
            `-l "traefik.http.services.${containerName}.loadbalancer.server.port=${containerPort}"`,
            imageTag
          ].filter(Boolean).join(' ');

          runRes = await runCmd(runCmdString, buildDir);
          if (runRes.code !== 0) {
            throw new Error(`Failed to restart container with auto-detected port ${detectedPort}`);
          }
        }

        // Final verification
        const inspectRes = await runCmd(`docker inspect -f '{{.State.Running}}' ${containerName}`, buildDir);
        const isRunning = inspectRes.stdout.trim() === 'true';

        if (!isRunning) {
          throw new Error('Container failed health probes (not running)');
        }

        // Successfully deployed and verified: retire standby container
        if (hadActiveContainer) {
          appendLog(`[Zero-Downtime] New container verified healthy! Retiring previous standby container with zero downtime.`);
          await runCmd(`docker rm -f ${standbyContainerName}`, buildDir).catch(() => null);
        }

        appendLog(`Deployment successful! App is online at https://${targetDomain}`);

        // Update DB records
        await this.prisma.deployment.update({
          where: { id: deploymentId },
          data: {
            status: 'READY',
            endedAt: new Date(),
            buildDuration: Math.floor((Date.now() - deployment.createdAt.getTime()) / 1000),
          },
        });

        await this.prisma.project.update({
          where: { id: projectId },
          data: { status: 'READY' },
        });

        sendDiscordNotification(project.teamId, 'deploy', {
          title: `✅ Deployment Successful: ${project.name}`,
          description: `The deployment for **${project.name}** was successful and is now online.`,
          color: 2278750, // Green
          url: `https://${targetDomain}`,
          fields: [
            { name: 'Branch', value: `\`${project.githubBranch || 'main'}\``, inline: true },
            { name: 'Duration', value: `${Math.floor((Date.now() - deployment.createdAt.getTime()) / 1000)}s`, inline: true },
            { name: 'Domain', value: `[${targetDomain}](https://${targetDomain})`, inline: false }
          ]
        });

        // Clean up workspace build directory, old project images, dangling layers, and build cache
        await this.cleanupDeploymentArtifacts(
          projectId,
          cleanSlug,
          imageTag,
          buildDir,
          appendLog
        );

        this.deploymentLogs.delete(deploymentId);

      } catch (err: any) {
        appendLog(`[ERROR] Deployment failed: ${err.message}`);

        // Zero-Downtime Rollback: If a standby container exists, restore it immediately
        const activeContainerName = cleanSlug ? `kh-cloud-app-${cleanSlug}-${projectId.substring(0, 8)}` : '';
        const standbyContainerName = activeContainerName ? `${activeContainerName}-standby` : '';
        if (standbyContainerName) {
          const hasStandby = (await runCmd(`docker inspect ${standbyContainerName}`, buildDir).catch(() => ({ code: 1 }))).code === 0;
          if (hasStandby) {
            appendLog(`[Zero-Downtime Rollback] Restoring previous healthy container from standby...`);
            await runCmd(`docker rm -f ${activeContainerName}`, buildDir).catch(() => null);
            await runCmd(`docker rename ${standbyContainerName} ${activeContainerName}`, buildDir).catch(() => null);
            appendLog(`[Zero-Downtime Rollback] Previous healthy container restored. Live site remains online.`);
          }
        }

        // Check if active container is currently running and serving traffic
        let isStillRunning = false;
        if (activeContainerName) {
          const checkRes = await runCmd(`docker inspect -f '{{.State.Running}}' ${activeContainerName}`, buildDir).catch(() => ({ stdout: '' }));
          isStillRunning = checkRes.stdout.trim() === 'true';
        }

        await this.prisma.deployment.update({
          where: { id: deploymentId },
          data: { status: 'FAILED', endedAt: new Date() },
        });

        if (isStillRunning) {
          appendLog(`[Zero-Downtime] Project status remains READY because the previous release is active and serving traffic.`);
          await this.prisma.project.update({
            where: { id: projectId },
            data: { status: 'READY' },
          });
        } else {
          await this.prisma.project.update({
            where: { id: projectId },
            data: { status: 'INACTIVE' },
          });
        }

        sendDiscordNotification(project?.teamId || '', 'error', {
          title: `❌ Deployment Failed: ${project?.name || 'Unknown Project'}`,
          description: `The deployment for **${project?.name || 'unknown'}** has failed.`,
          color: 15680580, // Red
          fields: [
            { name: 'Branch', value: `\`${project?.githubBranch || 'main'}\``, inline: true },
            { name: 'Error Message', value: err.message || 'Unknown error', inline: false }
          ]
        });

        // Even on failure, purge the workspace build directory and prune dangling build artifacts
        await this.cleanupDeploymentArtifacts(
          projectId,
          cleanSlug || '',
          null,
          buildDir,
          appendLog
        ).catch(() => null);

        this.deploymentLogs.delete(deploymentId);
      }
    };

    startDeployment();
  }

  async getRuntimeLogs(projectId: string, teamId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, teamId },
    });
    if (!project) throw new NotFoundException('Project not found.');

    const cleanSlug = project.slug.toLowerCase().replace(/[^a-z0-9]/g, '');
    const containerName = `kh-cloud-app-${cleanSlug}-${project.id.substring(0, 8)}`;

    const runCmd = (cmd: string): Promise<{ code: number; stdout: string; stderr: string }> => {
      return new Promise((resolve) => {
        const proc = exec(cmd, { maxBuffer: 1024 * 1024 * 10 });
        let stdout = '';
        let stderr = '';
        proc.stdout?.on('data', (d) => { stdout += d.toString(); });
        proc.stderr?.on('data', (d) => { stderr += d.toString(); });
        proc.on('close', (code) => resolve({ code: code ?? 0, stdout, stderr }));
      });
    };

    const logsRes = await runCmd(`docker logs --tail 150 ${containerName}`).catch(() => ({ stdout: '', stderr: 'Container not running or not found.' }));
    return { logs: (logsRes.stdout || '') + '\n' + (logsRes.stderr || '') };
  }

  /**
   * Post-deployment storage and cache cleanup:
   * 1. Removes all previous Docker images of this project, retaining only current imageTag.
   * 2. Prunes dangling Docker images (unnamed intermediate build layers).
   * 3. Prunes Docker buildx/builder cache to prevent disk exhaustion.
   * 4. Removes the deployment workspace build directory and cleans any orphaned build directories.
   */
  private async cleanupDeploymentArtifacts(
    projectId: string,
    cleanSlug: string,
    currentImageTag: string | null,
    buildDir?: string,
    logFn?: (msg: string) => void,
  ) {
    const log = (msg: string) => {
      this.logger.log(msg);
      if (logFn) logFn(msg);
    };

    // 1. Clean workspace build directory
    if (buildDir && fs.existsSync(buildDir)) {
      try {
        fs.rmSync(buildDir, { recursive: true, force: true });
        log(`[Cleanup] Removed workspace build directory: ${buildDir}`);
      } catch (err: any) {
        this.logger.warn(`Failed to remove buildDir ${buildDir}: ${err.message}`);
      }
    }

    // 2. Remove orphaned temporary build directories older than 30 minutes
    try {
      const baseBuildsDir = '/usr/src/app/storage-mock/builds';
      if (fs.existsSync(baseBuildsDir)) {
        const now = Date.now();
        const entries = fs.readdirSync(baseBuildsDir);
        for (const entry of entries) {
          const entryPath = path.join(baseBuildsDir, entry);
          try {
            const stats = fs.statSync(entryPath);
            if (stats.isDirectory() && now - stats.mtimeMs > 30 * 60 * 1000) {
              fs.rmSync(entryPath, { recursive: true, force: true });
              this.logger.log(`[Cleanup] Pruned orphaned build directory: ${entryPath}`);
            }
          } catch { /* ignore individual stat/rm errors */ }
        }
      }
    } catch { /* ignore base directory access errors */ }

    // 3. Remove previous Docker images for this project (keeping only currentImageTag)
    if (cleanSlug) {
      try {
        const repoName = `kh-cloud-${cleanSlug}`;
        const cmd = `docker images --format "{{.Repository}}:{{.Tag}}" ${repoName}`;
        const output = await new Promise<string>((resolve) => {
          exec(cmd, { timeout: 15000 }, (err, stdout) => resolve(stdout || ''));
        });

        const lines = output.trim().split('\n').filter(Boolean);
        let removedCount = 0;
        for (const line of lines) {
          const trimmedTag = line.trim();
          if (trimmedTag && trimmedTag !== currentImageTag) {
            await new Promise<void>((resolve) => {
              exec(`docker rmi -f ${trimmedTag}`, { timeout: 15000 }, () => resolve());
            });
            removedCount++;
          }
        }
        if (removedCount > 0) {
          log(`[Cleanup] Pruned ${removedCount} previous Docker image(s) for ${repoName}.`);
        }
      } catch (err: any) {
        this.logger.warn(`[Cleanup] Failed to clean old project images: ${err.message}`);
      }
    }

    // 4. Prune dangling images (unnamed intermediate build layers)
    try {
      await new Promise<void>((resolve) => {
        exec('docker image prune -f', { timeout: 30000 }, (err, stdout) => {
          if (!err && stdout?.trim()) {
            this.logger.log(`[Cleanup] Image prune: ${stdout.replace(/\n/g, ' ')}`);
          }
          resolve();
        });
      });
    } catch { /* ignore */ }

    // 5. Prune Docker buildx/builder cache to prevent disk exhaustion
    try {
      await new Promise<void>((resolve) => {
        exec('docker builder prune -f --keep-storage 500MB', { timeout: 30000 }, (err, stdout) => {
          if (!err && stdout?.trim()) {
            this.logger.log(`[Cleanup] Builder cache prune: ${stdout.replace(/\n/g, ' ')}`);
          }
          resolve();
        });
      });
    } catch { /* ignore */ }

    log(`[Cleanup] Storage and cache cleanup complete.`);
  }
}
