import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectStatus, DeploymentStatus } from '@prisma/client';
import { exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

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
    envVars?: { key: string; value: string; isSecret: boolean }[];
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

    // Start background live deployment engine
    this.runLiveDeploymentEngine(project.id, deployment.id);

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
        status: 'QUEUED',
        buildLogs: `Initiating rollback to deployment ${deploymentId}...\n`,
      },
    });

    this.runLiveDeploymentEngine(projectId, rollback.id);

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

  async updateProject(
    projectId: string,
    data: { name?: string; buildCommand?: string; startCommand?: string; port?: number; githubBranch?: string; teamId: string }
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
        startCommand: data.startCommand ?? project.startCommand,
        port: data.port !== undefined ? data.port : project.port,
        githubBranch: data.githubBranch ?? project.githubBranch,
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
        const proc = exec(cmd, { cwd });
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

    const startDeployment = async () => {
      try {
        const project = await this.prisma.project.findUnique({ where: { id: projectId } });
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

        // 3. Auto-generate Dockerfile if none exists
        const dockerfilePath = path.join(buildDir, 'Dockerfile');
        if (!fs.existsSync(dockerfilePath)) {
          appendLog('No Dockerfile found in root directory. Running smart engine to auto-generate one...');
          
          // Case 1: Node.js Project (package.json exists)
          if (fs.existsSync(path.join(buildDir, 'package.json'))) {
            appendLog('Detected Node.js application (package.json found). Parsing scripts...');
            let detectedStartCommand = 'npm start';
            let detectedPort = project.port || 3000;

            try {
              const packageJson = JSON.parse(fs.readFileSync(path.join(buildDir, 'package.json'), 'utf8'));
              const scripts = packageJson.scripts || {};
              
              if (scripts.start) {
                detectedStartCommand = 'npm start';
              } else if (scripts.dev) {
                appendLog('No "start" script found. Falling back to "dev" script...');
                detectedStartCommand = 'npm run dev';
              } else if (packageJson.main && fs.existsSync(path.join(buildDir, packageJson.main))) {
                appendLog(`No start script found. Launching main entrypoint file: node ${packageJson.main}`);
                detectedStartCommand = `node ${packageJson.main}`;
              } else {
                // Look for common files
                const entries = ['server.js', 'app.js', 'index.js', 'main.js'];
                const found = entries.find(f => fs.existsSync(path.join(buildDir, f)));
                if (found) {
                  appendLog(`Detected entrypoint file "${found}". Launching: node ${found}`);
                  detectedStartCommand = `node ${found}`;
                } else {
                  appendLog('Warning: No clear startup script or entrypoint file detected. Defaulting to: npm start');
                }
              }
            } catch (err) {
              appendLog(`Failed to parse package.json: ${err.message}. Defaulting to npm start.`);
            }

            const runCmdText = project.startCommand || detectedStartCommand;
            const defaultDockerfile = `FROM node:20-alpine\nWORKDIR /app\nCOPY package*.json ./\nRUN npm install\nCOPY . .\nRUN npm run build --if-present\nEXPOSE ${detectedPort}\nCMD ${runCmdText}`;
            fs.writeFileSync(dockerfilePath, defaultDockerfile);
            appendLog(`Generated Node.js Dockerfile (Port: ${detectedPort}, CMD: ${runCmdText})`);
            
            // Sync port to DB if not set
            if (!project.port) {
              await this.prisma.project.update({ where: { id: projectId }, data: { port: detectedPort } });
              project.port = detectedPort;
            }
          }
          // Case 2: Python Project (requirements.txt exists)
          else if (fs.existsSync(path.join(buildDir, 'requirements.txt'))) {
            appendLog('Detected Python application (requirements.txt found). Generating configuration...');
            let detectedStartCommand = 'python app.py';
            let detectedPort = project.port || 8000;

            const entrypoints = ['app.py', 'main.py', 'server.py', 'wsgi.py'];
            const found = entrypoints.find(f => fs.existsSync(path.join(buildDir, f)));
            if (found) {
              detectedStartCommand = `python ${found}`;
            }

            const runCmdText = project.startCommand || detectedStartCommand;
            const defaultDockerfile = `FROM python:3.10-slim\nWORKDIR /app\nCOPY requirements.txt .\nRUN pip install --no-cache-dir -r requirements.txt\nCOPY . .\nEXPOSE ${detectedPort}\nCMD ${runCmdText}`;
            fs.writeFileSync(dockerfilePath, defaultDockerfile);
            appendLog(`Generated Python Dockerfile (Port: ${detectedPort}, CMD: ${runCmdText})`);
            
            // Sync port to DB if not set
            if (!project.port) {
              await this.prisma.project.update({ where: { id: projectId }, data: { port: detectedPort } });
              project.port = detectedPort;
            }
          }
          // Case 3: Go Project (go.mod exists)
          else if (fs.existsSync(path.join(buildDir, 'go.mod'))) {
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
        const buildRes = await runCmd(`docker build -t ${imageTag} .`, buildDir);
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
        if (!fs.existsSync(path.join(buildDir, 'package.json')) && !fs.existsSync(dockerfilePath)) {
          // If we auto-generated nginx, the containerPort is 80
          containerPort = 80;
        }

        // Fetch custom environment variables configured for this project
        const envVars = await this.prisma.envVar.findMany({
          where: { projectId },
        });
        const envFlags = envVars.map(ev => `-e ${ev.key}="${ev.value.replace(/"/g, '\\"')}"`).join(' ');

        const runCmdString = [
          'docker run -d',
          `--name ${containerName}`,
          `--network kh-cloud-network`,
          `-e PORT=${containerPort}`,
          envFlags,
          `--restart unless-stopped`,
          `-l "traefik.enable=true"`,
          `-l "traefik.docker.network=kh-cloud-network"`,
          `-l "traefik.http.routers.${containerName}.rule=${hostRules}"`,
          `-l "traefik.http.routers.${containerName}.entrypoints=websecure"`,
          `-l "traefik.http.routers.${containerName}.tls.certresolver=letsencrypt"`,
          `-l "traefik.http.services.${containerName}.loadbalancer.server.port=${containerPort}"`,
          imageTag
        ].filter(Boolean).join(' ');

        appendLog(`Deploying container to Traefik routing mesh...`);
        const runRes = await runCmd(runCmdString, buildDir);
        if (runRes.code !== 0) {
          throw new Error('Failed to run container');
        }

        // 8. Health check validation (wait 5s)
        appendLog(`Waiting for container initialization and routing mesh propagation...`);
        await new Promise((resolve) => setTimeout(resolve, 5000));
        
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
        this.deploymentLogs.delete(deploymentId);
      }
    };

    startDeployment();
  }
}
