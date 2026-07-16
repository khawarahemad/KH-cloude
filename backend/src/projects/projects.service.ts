import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectStatus, DeploymentStatus } from '@prisma/client';
import { exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { sendDiscordNotification } from '../utils/discord-webhook';

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
            key: v.key,
            value: v.value,
            isSecret: v.isSecret,
          },
        })
      )
    );

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

        const cleanSlug = project.slug.toLowerCase().replace(/[^a-z0-9]/g, '');
        const containerName = `kh-cloud-app-${cleanSlug}-${project.id.substring(0, 8)}`;

        // Inspect running container to get its image tag
        const inspectRes = await runCmd(
          `docker inspect --format '{{.Config.Image}}' ${containerName}`
        );
        if (inspectRes.code !== 0 || !inspectRes.stdout.trim()) {
          this.logger.warn(`[Domain Route] Container ${containerName} not found, skipping re-route.`);
          await this.prisma.domain.update({ where: { id: domain.id }, data: { status: 'ACTIVE', sslStatus: 'ACTIVE', verifiedAt: new Date() } });
          return;
        }

        const imageTag = inspectRes.stdout.trim();
        const containerPort = project.port || 3000;

        // Get all domains including the new one
        const allDomains = await this.prisma.domain.findMany({ where: { projectId } });
        const targetDomain = `${project.slug}.khawarahemad.com`;
        const hostnames = Array.from(new Set([targetDomain, ...allDomains.map(d => d.hostname)]));
        const hostRules = hostnames.map(hn => `Host(\\\"${hn}\\\")`).join(' || ');
        const middlewareName = `${containerName}-hosthdr`;

        // Get env vars
        const envVars = await this.prisma.envVar.findMany({ where: { projectId } });
        const envFlags = [
          '-e HOST=0.0.0.0',
          `-e __VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS="${hostnames.join(',')}"`,
          ...envVars.map(ev => `-e ${ev.key}="${ev.value.replace(/"/g, '\\"')}"`)
        ].join(' ');

        // Stop old container
        await runCmd(`docker stop ${containerName}`).catch(() => null);
        await runCmd(`docker rm ${containerName}`).catch(() => null);

        // Start new container with updated Traefik labels
        const runCmdStr = [
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

        const rerunRes = await runCmd(runCmdStr);
        if (rerunRes.code === 0) {
          this.logger.log(`[Domain Route] Container ${containerName} re-launched with ${hostname} in Traefik routing.`);
          await this.prisma.domain.update({ where: { id: domain.id }, data: { status: 'ACTIVE', sslStatus: 'ACTIVE', verifiedAt: new Date() } });
        } else {
          this.logger.error(`[Domain Route] Failed to re-launch container: ${rerunRes.stderr}`);
        }
      } catch (err) {
        this.logger.error(`[Domain Route] Error during container re-route: ${err.message}`);
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

        const cleanSlug = project.slug.toLowerCase().replace(/[^a-z0-9]/g, '');
        const containerName = `kh-cloud-app-${cleanSlug}-${project.id.substring(0, 8)}`;

        // Inspect running container to get its image tag
        const inspectRes = await runCmd(
          `docker inspect --format '{{.Config.Image}}' ${containerName}`
        );
        if (inspectRes.code !== 0 || !inspectRes.stdout.trim()) {
          this.logger.warn(`[Domain Remove] Container ${containerName} not found, skipping re-route.`);
          return;
        }

        const imageTag = inspectRes.stdout.trim();
        const containerPort = project.port || 3000;

        // Get remaining domains
        const allDomains = await this.prisma.domain.findMany({ where: { projectId } });
        const targetDomain = `${project.slug}.khawarahemad.com`;
        const hostnames = Array.from(new Set([targetDomain, ...allDomains.map(d => d.hostname)]));
        const hostRules = hostnames.map(hn => `Host(\\\"${hn}\\\")`).join(' || ');
        const middlewareName = `${containerName}-hosthdr`;

        // Get env vars
        const envVars = await this.prisma.envVar.findMany({ where: { projectId } });
        const envFlags = [
          '-e HOST=0.0.0.0',
          `-e __VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS="${hostnames.join(',')}"`,
          ...envVars.map(ev => `-e ${ev.key}="${ev.value.replace(/"/g, '\\"')}"`)
        ].join(' ');

        // Stop old container
        await runCmd(`docker stop ${containerName}`).catch(() => null);
        await runCmd(`docker rm ${containerName}`).catch(() => null);

        // Start new container with updated Traefik labels
        const runCmdStr = [
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

        const rerunRes = await runCmd(runCmdStr);
        if (rerunRes.code === 0) {
          this.logger.log(`[Domain Remove] Container ${containerName} re-launched without ${domain.hostname} in Traefik routing.`);
        } else {
          this.logger.error(`[Domain Remove] Failed to re-launch container: ${rerunRes.stderr}`);
        }
      } catch (err) {
        this.logger.error(`[Domain Remove] Error during container re-route: ${err.message}`);
      }
    });

    return { success: true };
  }

  async deleteProject(projectId: string, teamId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, teamId },
    });
    if (!project) throw new NotFoundException('Project not found.');

    // Stop and remove the project's Docker container on the host VPS
    const cleanSlug = project.slug.toLowerCase().replace(/[^a-z0-9]/g, '');
    const containerName = `kh-cloud-app-${cleanSlug}-${project.id.substring(0, 8)}`;

    exec(`docker stop ${containerName} && docker rm ${containerName}`, (error, stdout, stderr) => {
      if (error) {
        this.logger.error(`Failed to stop/remove container ${containerName}: ${stderr}`);
      } else {
        this.logger.log(`Successfully removed container ${containerName}`);
      }
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

    const runCmd = (cmd: string, cwd: string): Promise<{ code: number; stdout: string; stderr: string }> => {
      return new Promise((resolve) => {
        const proc = exec(cmd, { cwd, maxBuffer: 1024 * 1024 * 50 });
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
          } catch (err) {
            appendLog(`[Vite Patcher] Failed to patch ${fileBasename}: ${err.message}`);
          }
        }
      } catch (err) {
        appendLog(`[Vite Patcher] Error scanning for Vite configs: ${err.message}`);
      }
    };

    const startDeployment = async () => {
      let project: any = null;
      try {
        project = await this.prisma.project.findUnique({ where: { id: projectId } });
        if (!project) {
          appendLog('Project not found. Deployment aborted.');
          return;
        }

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
        const buildDir = path.join('/usr/src/app/storage-mock/builds', deploymentId);
        fs.mkdirSync(buildDir, { recursive: true });

        // 2. Clone Git Repo
        let repoUrl = project.githubRepo;
        if (!repoUrl) {
          appendLog('No GitHub repository URL provided. Aborting.');
          throw new Error('No GitHub repository provided');
        }

        // Fetch team member user to retrieve GitHub Access Token
        const teamMember = await this.prisma.teamMember.findFirst({
          where: { teamId: project.teamId },
          include: { user: true },
        });
        const githubToken = teamMember?.user?.githubAccessToken;

        if (!repoUrl.startsWith('http://') && !repoUrl.startsWith('https://')) {
          if (githubToken) {
            repoUrl = `https://x-access-token:${githubToken}@github.com/${repoUrl}.git`;
          } else {
            repoUrl = `https://github.com/${repoUrl}.git`;
          }
        } else if (githubToken && repoUrl.includes('github.com')) {
          repoUrl = repoUrl.replace('https://github.com', `https://x-access-token:${githubToken}@github.com`);
        }

        const maskedRepoUrl = repoUrl.replace(/:[^@]+@github\.com/, ':****@github.com');
        appendLog(`Cloning branch "${project.githubBranch || 'main'}" from repository: ${maskedRepoUrl}`);
        const cloneRes = await runCmd(`git clone --depth 1 -b ${project.githubBranch || 'main'} ${repoUrl} .`, buildDir);
        if (cloneRes.code !== 0) {
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

            if (isPnpm) {
              appendLog('pnpm-lock.yaml detected. Preparing pnpm manager configuration...');
              detectedStartCommand = 'pnpm start';
            } else if (isYarn) {
              appendLog('yarn.lock detected. Preparing yarn manager configuration...');
              detectedStartCommand = 'yarn start';
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
                                       isYarn ? 'yarn dev' : 'npm run dev';
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
            } catch (err) {
              appendLog(`Failed to parse package.json: ${err.message}. Defaulting to npm start.`);
              hasBuildScript = true; // Attempt build step on parse failures
            }

            let installSteps = 'RUN npm install';
            let buildSteps = hasBuildScript ? 'RUN npm run build' : '';

            if (isPnpm) {
              installSteps = 'RUN npm install -g pnpm && pnpm install';
              buildSteps = hasBuildScript ? 'RUN pnpm build' : '';
            } else if (isYarn) {
              installSteps = 'RUN yarn install';
              buildSteps = hasBuildScript ? 'RUN yarn build' : '';
            }

            const runCmdText = project.startCommand || detectedStartCommand;

            // Build the Dockerfile lines dynamically, stripping out empty lines (like buildSteps if no build script exists)
            // CMD uses shell exec form so signals propagate correctly to the Node process
            const dockerfileContent = [
              'FROM node:20-alpine',
              'WORKDIR /app',
              'COPY package*.json ./',
              'COPY pnpm-lock.yaml* yarn.lock* package-lock.json* ./',
              installSteps,
              'COPY . .',
              buildSteps,
              `EXPOSE ${detectedPort}`,
              `CMD ["sh", "-c", "${runCmdText.replace(/"/g, '\\"')}"]`
            ].filter(Boolean).join('\n');

            fs.writeFileSync(dockerfilePath, dockerfileContent);
            appendLog(`Generated Node.js Dockerfile (Port: ${detectedPort}, CMD: ${runCmdText}, Has Build: ${hasBuildScript})`);
            
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

            const runCmdText = project.startCommand || detectedStartCommand;
            const defaultDockerfile = `FROM python:3.10-slim\nWORKDIR /app\nCOPY requirements.txt .\nRUN pip install --no-cache-dir -r requirements.txt\nCOPY . .\nEXPOSE ${detectedPort}\nCMD ["sh", "-c", "${runCmdText.replace(/"/g, '\\"')}"]`;
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

        // 4. Build Docker Image
        const cleanSlug = project.slug.toLowerCase().replace(/[^a-z0-9]/g, '');
        const imageTag = `kh-cloud-${cleanSlug}:${deploymentId}`;
        const containerName = `kh-cloud-app-${cleanSlug}-${project.id.substring(0, 8)}`;

        appendLog(`Starting Docker image build: ${imageTag}`);
        const buildRes = await runCmd(`docker build -t ${imageTag} .`, effectiveBuildDir);
        if (buildRes.code !== 0) {
          throw new Error('Docker build process failed');
        }

        // 5. Update Status to Deploying
        await this.prisma.deployment.update({
          where: { id: deploymentId },
          data: { status: 'DEPLOYING' },
        });

        // 6. Stop and Remove previous container version
        appendLog(`Stopping and removing any existing container version: ${containerName}`);
        await runCmd(`docker stop ${containerName}`, buildDir).catch(() => null);
        await runCmd(`docker rm ${containerName}`, buildDir).catch(() => null);

        // 7. Start container with Traefik routing labels and environment variables
        
        // Fetch all active domains associated with the project
        const projectDomains = await this.prisma.domain.findMany({
          where: { projectId },
        });
        const targetDomain = `${project.slug}.khawarahemad.com`;
        const hostnames = Array.from(new Set([targetDomain, ...projectDomains.map(d => d.hostname)]));
        const hostRules = hostnames.map(hn => `Host(\\"${hn}\\")`).join(' || ');

        // Use auto-generated Node server port (3000) or static nginx port (80)
        let containerPort = project.port || 3000;
        if (!fs.existsSync(path.join(effectiveBuildDir, 'package.json')) && !fs.existsSync(dockerfilePath)) {
          // If we auto-generated nginx, the containerPort is 80
          containerPort = 80;
        }

        // Fetch custom environment variables configured for this project
        const envVars = await this.prisma.envVar.findMany({
          where: { projectId },
        });
        
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
          ...envVars.map(ev => `-e ${ev.key}="${ev.value.replace(/"/g, '\\"')}"`)
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
          throw new Error('Failed to run container');
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

          // Stop and remove old mismatched container
          await runCmd(`docker stop ${containerName}`, buildDir).catch(() => null);
          await runCmd(`docker rm ${containerName}`, buildDir).catch(() => null);

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

        // Clean up build directory
        fs.rmSync(buildDir, { recursive: true, force: true });
        this.deploymentLogs.delete(deploymentId);

      } catch (err: any) {
        appendLog(`[ERROR] Deployment failed: ${err.message}`);
        await this.prisma.deployment.update({
          where: { id: deploymentId },
          data: { status: 'FAILED', endedAt: new Date() },
        });
        await this.prisma.project.update({
          where: { id: projectId },
          data: { status: 'INACTIVE' },
        });

        sendDiscordNotification(project?.teamId || '', 'error', {
          title: `❌ Deployment Failed: ${project?.name || 'Unknown Project'}`,
          description: `The deployment for **${project?.name || 'unknown'}** has failed.`,
          color: 15680580, // Red
          fields: [
            { name: 'Branch', value: `\`${project?.githubBranch || 'main'}\``, inline: true },
            { name: 'Error Message', value: err.message || 'Unknown error', inline: false }
          ]
        });

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

  async executeTerminalCommand(projectId: string, command: string, teamId: string) {
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

    const inspectRes = await runCmd(`docker inspect -f "{{.State.Running}}" ${containerName}`).catch(() => ({ stdout: 'false' }));
    const isRunning = inspectRes.stdout.trim() === 'true';

    if (!isRunning) {
      return { output: 'Error: Container is not running.' };
    }

    const escapedCmd = command.replace(/"/g, '\\"');
    const execRes = await runCmd(`docker exec ${containerName} sh -c "${escapedCmd}"`).catch((err) => ({
      code: 1,
      stdout: '',
      stderr: `Execution failed: ${err.message}`
    }));

    const output = (execRes.stdout || '') + (execRes.stderr || '');
    return { output: output || '(No output)' };
  }
}
