import { Controller, Get, Post, Put, Delete, Body, Param, Query, UploadedFile, UseInterceptors, Res, BadRequestException, Headers } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import * as express from 'express';
import { PrismaService } from './prisma/prisma.service';
import { StorageService } from './storage/storage.service';
import { ProjectsService } from './projects/projects.service';
import { DatabasesService } from './databases/databases.service';
import { TeamsService } from './teams/teams.service';
import { BillingService } from './billing/billing.service';
import { EdgeFunctionsService } from './edge-functions/edge-functions.service';
import { TeamRole, DatabaseType } from '@prisma/client';

import * as crypto from 'crypto';

function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

@Controller('api')
export class AppController {
  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
    private projects: ProjectsService,
    private databases: DatabasesService,
    private teams: TeamsService,
    private billing: BillingService,
    private edgeFunctions: EdgeFunctionsService,
  ) {}

  // --- AUTH ENDPOINTS ---

  @Post('auth/register')
  async register(@Body() body: any) {
    const { name, email, password } = body;
    if (!name || !email || !password) {
      throw new BadRequestException('Name, email and password are required.');
    }

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new BadRequestException('User with this email already exists.');
    }

    // Create user
    const user = await this.prisma.user.create({
      data: { name, email },
    });

    // Create default account with hashed password
    await this.prisma.account.create({
      data: {
        accountId: user.id,
        providerId: 'credentials',
        userId: user.id,
        password: hashPassword(password),
      },
    });

    // Create default team
    const team = await this.teams.createTeam(`${name}'s Team`, user.id);

    return { user, team };
  }

  @Post('auth/login')
  async login(@Body() body: any) {
    const { email, password } = body;
    if (!email || !password) {
      throw new BadRequestException('Email and password are required.');
    }

    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { accounts: true },
    });

    if (!user || user.accounts[0]?.password !== hashPassword(password)) {
      throw new BadRequestException('Invalid email or password.');
    }

    // Find user's teams
    const teams = await this.teams.getTeams(user.id);

    return { user, teams };
  }

  @Get('auth/me')
  async me(@Query('userId') userId: string) {
    if (!userId) throw new BadRequestException('User ID required.');
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new BadRequestException('User not found.');
    const teams = await this.teams.getTeams(userId);
    return { user, teams };
  }

  // --- TEAMS ENDPOINTS ---

  @Get('teams/:teamId/members')
  async getMembers(@Param('teamId') teamId: string) {
    return this.teams.getMembers(teamId);
  }

  @Post('teams/:teamId/invites')
  async inviteMember(
    @Param('teamId') teamId: string,
    @Body() body: { email: string; role: TeamRole; inviterId: string }
  ) {
    return this.teams.inviteMember(teamId, body.email, body.role, body.inviterId);
  }

  @Get('teams/:teamId/invites')
  async getInvites(@Param('teamId') teamId: string) {
    return this.teams.getInvites(teamId);
  }

  @Delete('teams/:teamId/invites/:inviteId')
  async deleteInvite(
    @Param('teamId') teamId: string,
    @Param('inviteId') inviteId: string,
    @Query('userId') userId: string
  ) {
    return this.teams.deleteInvite(inviteId, teamId, userId);
  }

  @Get('teams/:teamId/audit')
  async getAuditLogs(@Param('teamId') teamId: string) {
    return this.teams.getAuditLogs(teamId);
  }

  // --- PROJECTS ENDPOINTS ---

  @Post('projects')
  async createProject(@Body() body: any) {
    return this.projects.createProject(body);
  }

  @Post('projects/:id/update')
  async updateProject(
    @Param('id') id: string,
    @Body() body: { name?: string; buildCommand?: string; startCommand?: string; port?: number; githubBranch?: string; rootDirectory?: string; teamId: string }
  ) {
    return this.projects.updateProject(id, body);
  }

  @Get('projects')
  async getProjects(@Query('teamId') teamId: string) {
    return this.projects.getProjects(teamId);
  }

  @Get('projects/:id')
  async getProjectDetails(@Param('id') id: string, @Query('teamId') teamId: string) {
    return this.projects.getProjectDetails(id, teamId);
  }

  @Post('projects/:id/deploy')
  async deployProject(@Param('id') id: string, @Body() body: { teamId: string }) {
    return this.projects.triggerDeployment(id, body.teamId);
  }

  @Get('projects/:id/deployments')
  async getProjectDeployments(@Param('id') id: string) {
    return this.projects.getDeployments(id);
  }

  @Get('deployments/:depId/logs')
  async getDeploymentLogs(@Param('depId') depId: string) {
    return this.projects.getDeploymentLogs(depId);
  }

  @Post('projects/:id/restart')
  async restartProject(@Param('id') id: string, @Body() body: { teamId: string }) {
    return this.projects.restartProject(id, body.teamId);
  }

  @Post('projects/:id/rollback')
  async rollbackProject(
    @Param('id') id: string,
    @Body() body: { deploymentId: string; teamId: string }
  ) {
    return this.projects.rollbackDeployment(id, body.deploymentId, body.teamId);
  }

  @Post('projects/:id/env')
  async setEnvVars(@Param('id') id: string, @Body() body: { vars: any[] }) {
    return this.projects.setEnvVars(id, body.vars);
  }

  @Post('projects/:id/domain')
  async addCustomDomain(
    @Param('id') id: string,
    @Body() body: { hostname: string; teamId: string }
  ) {
    return this.projects.addCustomDomain(id, body.hostname, body.teamId);
  }

  @Delete('projects/:id/domain/:domainId')
  async removeCustomDomain(
    @Param('id') id: string,
    @Param('domainId') domainId: string,
    @Body() body: { teamId: string }
  ) {
    return this.projects.removeCustomDomain(id, domainId, body.teamId);
  }

  @Get('projects/:id/metrics')
  async getProjectMetrics(@Param('id') id: string) {
    return this.projects.getProjectMetrics(id);
  }

  @Get('projects/:id/runtime-logs')
  async getRuntimeLogs(
    @Param('id') id: string,
    @Query('teamId') teamId: string
  ) {
    return this.projects.getRuntimeLogs(id, teamId);
  }

  @Post('projects/:id/terminal')
  async executeTerminalCommand(
    @Param('id') id: string,
    @Body() body: { command: string; teamId: string }
  ) {
    return this.projects.executeTerminalCommand(id, body.command, body.teamId);
  }

  @Delete('projects/:id')
  async deleteProject(
    @Param('id') id: string,
    @Query('teamId') teamId: string
  ) {
    return this.projects.deleteProject(id, teamId);
  }

  @Post('github/webhook')
  async handleGithubWebhook(
    @Body() payload: any,
    @Headers('x-github-event') event: string
  ) {
    if (event === 'push') {
      const repoFullName = payload.repository?.full_name;
      const ref = payload.ref; // e.g. refs/heads/main
      if (repoFullName && ref) {
        const branch = ref.replace('refs/heads/', '');
        await this.projects.triggerGitOpsDeployment(repoFullName, branch);
      }
    }
    return { received: true };
  }

  // --- DATABASES ENDPOINTS ---

  @Post('databases')
  async createDatabase(@Body() body: { name: string; type: DatabaseType; teamId: string; projectId?: string }) {
    return this.databases.createDatabase(body);
  }

  @Get('databases')
  async getDatabases(@Query('teamId') teamId: string) {
    return this.databases.getDatabases(teamId);
  }

  @Delete('databases/:id')
  async deleteDatabase(@Param('id') id: string, @Query('teamId') teamId: string) {
    return this.databases.deleteDatabase(id, teamId);
  }

  @Get('databases/:id/tables')
  async getDatabaseTables(
    @Param('id') id: string,
    @Query('teamId') teamId: string
  ) {
    return this.databases.getTables(id, teamId);
  }

  @Post('databases/:id/query')
  async runDatabaseQuery(
    @Param('id') id: string,
    @Body() body: { sql: string; teamId: string }
  ) {
    return this.databases.runQuery(id, body.teamId, body.sql);
  }

  // --- OBJECT STORAGE (BUCKETS) ENDPOINTS ---

  @Post('storage/buckets')
  async createBucket(@Body() body: { name: string; isPublic: boolean; teamId: string }) {
    return this.storage.createBucket(body.name, body.isPublic, body.teamId);
  }

  @Get('storage/buckets')
  async getBuckets(@Query('teamId') teamId: string) {
    return this.storage.getBuckets(teamId);
  }

  @Delete('storage/buckets/:id')
  async deleteBucket(@Param('id') id: string, @Query('teamId') teamId: string) {
    return this.storage.deleteBucket(id, teamId);
  }

  @Get('storage/buckets/:id/files')
  async listFiles(@Param('id') id: string, @Query('prefix') prefix: string) {
    return this.storage.listFiles(id, prefix || '');
  }

  @Post('storage/buckets/:id/upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @Param('id') id: string,
    @UploadedFile() file: any,
    @Query('key') key: string,
    @Query('teamId') teamId: string
  ) {
    if (!file) throw new BadRequestException('No file uploaded.');
    return this.storage.uploadFile(id, key || file.originalname, file.buffer, file.mimetype, file.originalname, teamId);
  }

  @Get('storage/buckets/:id/download')
  async downloadFile(
    @Param('id') id: string,
    @Query('key') key: string,
    @Res() res: express.Response
  ) {
    if (!key) throw new BadRequestException('File key required.');
    const fileBuffer = await this.storage.getFile(id, key);
    
    // Attempt to guess Content-Type from metadata
    const meta = await this.prisma.objectMetadata.findFirst({
      where: { bucketId: id, key },
    });
    
    res.setHeader('Content-Type', meta?.contentType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${pathName(key)}"`);
    return res.send(fileBuffer);
  }

  @Delete('storage/buckets/:id/files')
  async deleteFile(
    @Param('id') id: string,
    @Query('key') key: string,
    @Query('teamId') teamId: string
  ) {
    if (!key) throw new BadRequestException('File key required.');
    return this.storage.deleteFile(id, key, teamId);
  }

  @Get('storage/buckets/:id/presigned')
  async getPresignedUrl(
    @Param('id') id: string,
    @Query('key') key: string,
    @Query('expiresIn') expiresIn: string
  ) {
    if (!key) throw new BadRequestException('File key required.');
    const exp = expiresIn ? parseInt(expiresIn) : 3600;
    const url = await this.storage.generatePresignedUrl(id, key, exp);
    return { url };
  }

  // --- BILLING ENDPOINTS ---

  @Get('billing')
  async getBillingInfo(@Query('teamId') teamId: string) {
    return this.billing.getBillingInfo(teamId);
  }

  @Post('billing/plan')
  async updatePlan(
    @Query('teamId') teamId: string,
    @Query('adminUserId') adminUserId: string,
    @Body() body: { planId: string }
  ) {
    await this.verifyAdmin(adminUserId);
    return this.billing.updatePlan(teamId, body.planId);
  }

  // --- GITHUB INTEGRATION ENDPOINTS ---

  @Post('auth/github/callback')
  async githubCallback(@Body() body: { code: string; userId?: string }) {
    const { code, userId } = body;
    if (!code) throw new BadRequestException('Authorization code required.');

    const clientId = process.env.GITHUB_CLIENT_ID || 'Iv23libP2nC0sNq21c8u'; // Default/fallback Client ID
    const clientSecret = process.env.GITHUB_CLIENT_SECRET || 'a1b2c3d4e5f6g7h8i9j0'; // Default/fallback Secret

    // 1. Exchange code for access token
    const tokenUrl = 'https://github.com/login/oauth/access_token';
    const tokenRes = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
      }),
    }).then((r) => r.json());

    const accessToken = tokenRes.access_token;
    if (!accessToken) {
      throw new BadRequestException(`GitHub token exchange failed: ${tokenRes.error_description || 'unknown error'}`);
    }

    // 2. Fetch user profile details
    const userUrl = 'https://api.github.com/user';
    const githubUser = await fetch(userUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        'User-Agent': 'KH-Cloud-Backend',
      },
    }).then((r) => r.json());

    const githubUsername = githubUser.login;
    if (!githubUsername) {
      throw new BadRequestException('Failed to fetch GitHub profile.');
    }

    let user;
    if (userId) {
      // Attach to existing user
      user = await this.prisma.user.update({
        where: { id: userId },
        data: {
          githubAccessToken: accessToken,
          githubUsername,
        },
      });
    } else {
      // Register/Login flow
      const email = githubUser.email || `${githubUsername}@github.com`;
      user = await this.prisma.user.findFirst({
        where: {
          OR: [
            { email },
            { githubUsername }
          ]
        }
      });

      if (!user) {
        user = await this.prisma.user.create({
          data: {
            name: githubUser.name || githubUsername,
            email,
            githubAccessToken: accessToken,
            githubUsername,
          },
        });

        // Create default team
        await this.teams.createTeam(`${user.name}'s Team`, user.id);
      } else {
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: {
            githubAccessToken: accessToken,
            githubUsername,
          },
        });
      }
    }

    const teams = await this.teams.getTeams(user.id);
    return { user, teams };
  }

  @Get('github/repos')
  async getGithubRepos(@Query('userId') userId: string) {
    if (!userId) throw new BadRequestException('User ID is required.');

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || !user.githubAccessToken) {
      return [];
    }

    try {
      const repos = await fetch('https://api.github.com/user/repos?per_page=100&sort=updated', {
        headers: {
          Authorization: `Bearer ${user.githubAccessToken}`,
          Accept: 'application/json',
          'User-Agent': 'KH-Cloud-Backend',
        },
      }).then((r) => r.json());

      if (!Array.isArray(repos)) {
        return [];
      }

      return repos.map((repo: any) => ({
        name: repo.name,
        fullName: repo.full_name,
        defaultBranch: repo.default_branch || 'main',
        cloneUrl: repo.clone_url,
      }));
    } catch (err) {
      return [];
    }
  }

  @Get('github/repos/detect')
  async detectGithubProject(
    @Query('userId') userId: string,
    @Query('repo') repo: string,
    @Query('branch') branch?: string,
    @Query('rootDir') rootDir?: string
  ) {
    if (!userId || !repo) throw new BadRequestException('User ID and repo are required.');

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.githubAccessToken) {
      throw new BadRequestException('GitHub access token not found for user.');
    }

    const token = user.githubAccessToken;
    const ref = branch ? `?ref=${branch}` : '';
    const cleanRootDir = rootDir ? rootDir.replace(/^\/|\/$/g, '') : '';
    const contentsUrl = `https://api.github.com/repos/${repo}/contents/${cleanRootDir}${ref}`;

    try {
      const res = await fetch(contentsUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          'User-Agent': 'KH-Cloud-Backend',
        },
      });

      if (!res.ok) {
        return {
          type: 'STATIC',
          port: 80,
          buildCommand: '',
          startCommand: '',
          installCommand: '',
        };
      }

      const files = await res.json();
      if (!Array.isArray(files)) {
        return {
          type: 'STATIC',
          port: 80,
          buildCommand: '',
          startCommand: '',
          installCommand: '',
        };
      }

      const hasFile = (name: string) => files.some((f: any) => f.name.toLowerCase() === name.toLowerCase());

      if (hasFile('package.json')) {
        const pkgFile = files.find((f: any) => f.name === 'package.json');
        let scripts: any = {};
        let dependencies: any = {};
        let devDependencies: any = {};

        if (pkgFile && pkgFile.download_url) {
          try {
            const pkgRes = await fetch(pkgFile.download_url, {
              headers: { Authorization: `Bearer ${token}` }
            });
            if (pkgRes.ok) {
              const pkgJson = await pkgRes.json();
              scripts = pkgJson.scripts || {};
              dependencies = pkgJson.dependencies || {};
              devDependencies = pkgJson.devDependencies || {};
            }
          } catch (e) {}
        }

        const isDep = (name: string) => !!dependencies[name] || !!devDependencies[name];

        let buildCommand = 'npm run build';
        let startCommand = 'npm run start';
        let port = 3000;

        if (isDep('next')) {
          buildCommand = 'npm run build';
          startCommand = scripts.start ? 'npm run start' : 'npx next start';
          port = 3000;
        } else if (isDep('nuxt')) {
          buildCommand = 'npm run build';
          startCommand = scripts.start ? 'npm run start' : 'npx nuxt start';
          port = 3000;
        } else if (isDep('astro')) {
          buildCommand = 'npm run build';
          startCommand = scripts.start ? 'npm run start' : 'npx astro preview --host 0.0.0.0';
          port = 4321;
        } else if (isDep('@remix-run/dev') || isDep('@remix-run/node')) {
          buildCommand = 'npm run build';
          startCommand = scripts.start ? 'npm run start' : 'npx remix-serve build/index.js';
          port = 3000;
        } else if (isDep('vite')) {
          buildCommand = scripts.build ? 'npm run build' : '';
          startCommand = scripts.dev ? 'npm run dev' : (scripts.start ? 'npm run start' : 'npx vite --host 0.0.0.0');
          port = 5173;
        } else if (isDep('react-scripts')) {
          buildCommand = 'npm run build';
          startCommand = 'npm run start';
          port = 3000;
        } else if (isDep('@angular/core')) {
          buildCommand = 'npm run build';
          startCommand = scripts.start ? 'npm run start' : 'npx ng serve --host 0.0.0.0';
          port = 4200;
        } else if (isDep('@nestjs/core')) {
          buildCommand = 'npm run build';
          startCommand = scripts['start:prod'] ? 'npm run start:prod' : (scripts.start ? 'npm run start' : 'node dist/main.js');
          port = 3000;
        } else {
          if (!scripts.build) {
            buildCommand = '';
          }
          if (scripts.start) {
            startCommand = 'npm run start';
          } else if (scripts.dev) {
            startCommand = 'npm run dev';
          } else if (scripts.serve) {
            startCommand = 'npm run serve';
          } else {
            startCommand = 'node index.js';
          }
        }

        return {
          type: 'NODE',
          port,
          buildCommand,
          startCommand,
          installCommand: 'npm install',
        };
      }

      if (hasFile('requirements.txt') || hasFile('pipfile') || hasFile('pyproject.toml')) {
        let startCommand = 'python app.py';
        if (hasFile('main.py')) {
          startCommand = 'python main.py';
        } else if (hasFile('manage.py')) {
          startCommand = 'python manage.py runserver 0.0.0.0:8000';
        }

        return {
          type: 'PYTHON',
          port: 8000,
          buildCommand: '',
          startCommand,
          installCommand: 'pip install -r requirements.txt',
        };
      }

      if (hasFile('go.mod')) {
        return {
          type: 'GO',
          port: 8080,
          buildCommand: 'go build -o main .',
          startCommand: './main',
          installCommand: 'go mod download',
        };
      }

      return {
        type: 'STATIC',
        port: 80,
        buildCommand: '',
        startCommand: '',
        installCommand: '',
      };
    } catch (err) {
      return {
        type: 'STATIC',
        port: 80,
        buildCommand: '',
        startCommand: '',
        installCommand: '',
      };
    }
  }

  // --- ADMIN PANEL ENDPOINTS ---

  private async verifyAdmin(adminUserId: string) {
    if (!adminUserId) {
      throw new BadRequestException('Admin user ID is required.');
    }
    const adminUser = await this.prisma.user.findUnique({
      where: { id: adminUserId },
    });
    if (!adminUser || adminUser.role !== 'ADMIN') {
      throw new BadRequestException('Access denied. Admin privileges required.');
    }
  }

  @Get('admin/users')
  async adminGetUsers(@Query('adminUserId') adminUserId: string) {
    await this.verifyAdmin(adminUserId);
    const users = await this.prisma.user.findMany({
      include: {
        teamMembers: {
          include: {
            team: {
              include: {
                projects: true,
                databases: true,
                buckets: true,
                billingSubscription: true,
              }
            }
          }
        }
      }
    });

    return users.map(u => {
      let projectsCount = 0;
      let databasesCount = 0;
      let bucketsCount = 0;
      
      u.teamMembers.forEach(tm => {
        projectsCount += tm.team.projects.length;
        databasesCount += tm.team.databases.length;
        bucketsCount += tm.team.buckets.length;
      });

      const userTeams = u.teamMembers.map(tm => ({
        id: tm.team.id,
        name: tm.team.name,
        planId: tm.team.billingSubscription?.planId || 'hobby',
        status: tm.team.billingSubscription?.status || 'active',
      }));

      return {
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        createdAt: u.createdAt,
        projectsCount,
        databasesCount,
        bucketsCount,
        teams: userTeams,
      };
    });
  }

  @Post('admin/users/:id/role')
  async adminToggleUserRole(
    @Param('id') userId: string,
    @Body('role') role: string,
    @Query('adminUserId') adminUserId: string,
  ) {
    await this.verifyAdmin(adminUserId);
    if (role !== 'USER' && role !== 'ADMIN') {
      throw new BadRequestException('Invalid role.');
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { role },
    });
    return { success: true, role: updated.role };
  }

  @Delete('admin/users/:id')
  async adminDeleteUser(
    @Param('id') userId: string,
    @Query('adminUserId') adminUserId: string,
  ) {
    await this.verifyAdmin(adminUserId);
    if (userId === adminUserId) {
      throw new BadRequestException('You cannot delete your own admin account.');
    }
    await this.prisma.user.delete({ where: { id: userId } });
    return { success: true };
  }

  @Get('admin/projects')
  async adminGetProjects(@Query('adminUserId') adminUserId: string) {
    await this.verifyAdmin(adminUserId);
    const projects = await this.prisma.project.findMany({
      include: {
        team: true,
      }
    });
    return projects;
  }

  @Post('admin/projects/:id/status')
  async adminToggleProjectStatus(
    @Param('id') projectId: string,
    @Body('status') status: any,
    @Query('adminUserId') adminUserId: string,
  ) {
    await this.verifyAdmin(adminUserId);
    
    const project = await this.prisma.project.update({
      where: { id: projectId },
      data: { status },
    });

    try {
      if (status === 'SUSPENDED') {
        await this.projects.stopProject(projectId);
      }
    } catch (e) {}

    return project;
  }

  @Delete('admin/projects/:id')
  async adminDeleteProject(
    @Param('id') projectId: string,
    @Query('adminUserId') adminUserId: string,
  ) {
    await this.verifyAdmin(adminUserId);
    await this.projects.deleteProject(projectId, adminUserId);
    return { success: true };
  }

  @Get('admin/buckets')
  async adminGetBuckets(@Query('adminUserId') adminUserId: string) {
    await this.verifyAdmin(adminUserId);
    const buckets = await this.prisma.bucket.findMany({
      include: {
        team: true,
      }
    });

    return buckets.map(b => ({
      ...b,
      sizeLimit: b.sizeLimit.toString(),
      sizeUsed: b.sizeUsed.toString(),
    }));
  }

  @Post('admin/buckets/:id/limit')
  async adminUpdateBucketLimit(
    @Param('id') bucketId: string,
    @Body('sizeLimit') sizeLimit: string,
    @Query('adminUserId') adminUserId: string,
  ) {
    await this.verifyAdmin(adminUserId);
    const limitBytes = BigInt(sizeLimit);
    
    const bucket = await this.prisma.bucket.update({
      where: { id: bucketId },
      data: { sizeLimit: limitBytes },
    });

    return {
      ...bucket,
      sizeLimit: bucket.sizeLimit.toString(),
      sizeUsed: bucket.sizeUsed.toString(),
    };
  }

  @Delete('admin/buckets/:id')
  async adminDeleteBucket(
    @Param('id') bucketId: string,
    @Query('adminUserId') adminUserId: string,
  ) {
    await this.verifyAdmin(adminUserId);
    
    const bucket = await this.prisma.bucket.findUnique({ where: { id: bucketId } });
    if (!bucket) {
      throw new BadRequestException('Bucket not found.');
    }
    
    await this.prisma.objectMetadata.deleteMany({ where: { bucketId } });
    await this.storage.deleteBucket(bucketId, bucket.teamId);
    
    return { success: true };
  }

  @Get('admin/subscriptions')
  async adminGetSubscriptions(@Query('adminUserId') adminUserId: string) {
    await this.verifyAdmin(adminUserId);
    const subs = await this.prisma.billingSubscription.findMany({
      include: {
        team: true,
      }
    });
    return subs;
  }

  @Post('admin/subscriptions/override')
  async adminOverrideSubscription(
    @Body() body: { teamId: string; planId: string; status: string },
    @Query('adminUserId') adminUserId: string,
  ) {
    await this.verifyAdmin(adminUserId);
    const { teamId, planId, status } = body;
    if (!teamId || !planId || !status) {
      throw new BadRequestException('teamId, planId and status are required.');
    }

    const sub = await this.prisma.billingSubscription.upsert({
      where: { teamId },
      update: { planId, status, currentPeriodEnd: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) },
      create: {
        teamId,
        stripeCustomerId: 'manual_override_' + Math.random().toString(36).substring(2, 9),
        stripeSubscriptionId: 'sub_override_' + Math.random().toString(36).substring(2, 9),
        planId,
        status,
        currentPeriodEnd: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      }
    });

    return sub;
  }

  @Get('admin/system/storage')
  async adminGetSystemStorage(@Query('adminUserId') adminUserId: string) {
    await this.verifyAdmin(adminUserId);

    const fs = require('fs');
    const path = require('path');

    let totalDiskBytes = 0;
    let freeDiskBytes = 0;
    let usedDiskBytes = 0;
    try {
      const stats = fs.statfsSync('.');
      totalDiskBytes = stats.blocks * stats.bsize;
      freeDiskBytes = stats.bavail * stats.bsize;
      usedDiskBytes = totalDiskBytes - freeDiskBytes;
    } catch (err) {
      totalDiskBytes = 100 * 1024 * 1024 * 1024;
      freeDiskBytes = 60 * 1024 * 1024 * 1024;
      usedDiskBytes = totalDiskBytes - freeDiskBytes;
    }

    const buckets = await this.prisma.bucket.findMany({
      include: {
        team: {
          include: {
            members: {
              where: { role: 'OWNER' },
              include: { user: true }
            }
          }
        }
      }
    });

    const bucketsBreakdown = buckets.map(b => {
      const owner = b.team.members[0]?.user;
      return {
        id: b.id,
        name: b.name,
        type: 'S3 Bucket',
        teamName: b.team.name,
        ownerName: owner ? owner.name : 'N/A',
        ownerEmail: owner ? owner.email : 'N/A',
        sizeUsed: b.sizeUsed.toString(),
      };
    });

    const databases = await this.prisma.databaseInstance.findMany({
      include: {
        team: {
          include: {
            members: {
              where: { role: 'OWNER' },
              include: { user: true }
            }
          }
        }
      }
    });

    const dbBreakdown = [];
    const dbDir = './data';
    
    for (const db of databases) {
      let sizeBytes = 0;
      try {
        const dbPath = path.join(dbDir, `virtual_db_${db.id}.db`);
        if (fs.existsSync(dbPath)) {
          sizeBytes = fs.statSync(dbPath).size;
        }
      } catch {}

      const owner = db.team.members[0]?.user;
      dbBreakdown.push({
        id: db.id,
        name: db.name,
        type: db.type + ' Database',
        teamName: db.team.name,
        ownerName: owner ? owner.name : 'N/A',
        ownerEmail: owner ? owner.email : 'N/A',
        sizeUsed: sizeBytes.toString(),
      });
    }

    return {
      disk: {
        total: totalDiskBytes.toString(),
        free: freeDiskBytes.toString(),
        used: usedDiskBytes.toString(),
        percentUsed: totalDiskBytes > 0 ? ((usedDiskBytes / totalDiskBytes) * 100).toFixed(1) : '0',
      },
      breakdown: [...bucketsBreakdown, ...dbBreakdown].sort((a, b) => Number(b.sizeUsed) - Number(a.sizeUsed)),
    };
  }

  // --- TABLE EDITOR ENDPOINTS ---

  @Get('databases/:id/schema/:table')
  async getTableSchema(
    @Param('id') id: string,
    @Param('table') table: string,
    @Query('teamId') teamId: string
  ) {
    return this.databases.getTableSchema(id, teamId, table);
  }

  @Get('databases/:id/rows/:table')
  async getTableRows(
    @Param('id') id: string,
    @Param('table') table: string,
    @Query('teamId') teamId: string,
    @Query('page') page: string,
    @Query('pageSize') pageSize: string,
    @Query('filter') filter: string,
  ) {
    return this.databases.getTableRows(
      id, teamId, table,
      parseInt(page || '1'),
      parseInt(pageSize || '50'),
      filter || ''
    );
  }

  @Post('databases/:id/rows/:table')
  async insertRow(
    @Param('id') id: string,
    @Param('table') table: string,
    @Body() body: { teamId: string; data: Record<string, any> }
  ) {
    return this.databases.insertRow(id, body.teamId, table, body.data);
  }

  @Put('databases/:id/rows/:table/:pk')
  async updateRow(
    @Param('id') id: string,
    @Param('table') table: string,
    @Param('pk') pk: string,
    @Body() body: { teamId: string; pkValue: any; data: Record<string, any> }
  ) {
    return this.databases.updateRow(id, body.teamId, table, pk, body.pkValue, body.data);
  }

  @Delete('databases/:id/rows/:table/:pk')
  async deleteRow(
    @Param('id') id: string,
    @Param('table') table: string,
    @Param('pk') pk: string,
    @Query('teamId') teamId: string,
    @Query('pkValue') pkValue: string,
  ) {
    return this.databases.deleteRow(id, teamId, table, pk, pkValue);
  }

  // --- EDGE FUNCTIONS ENDPOINTS ---

  @Get('edge-functions')
  async getEdgeFunctions(@Query('teamId') teamId: string) {
    return this.edgeFunctions.getFunctions(teamId);
  }

  @Post('edge-functions')
  async createEdgeFunction(@Body() body: { name: string; teamId: string }) {
    return this.edgeFunctions.createFunction(body);
  }

  @Put('edge-functions/:id')
  async updateEdgeFunction(
    @Param('id') id: string,
    @Body() body: { teamId: string; code?: string; envVars?: string; name?: string }
  ) {
    return this.edgeFunctions.updateFunction(id, body.teamId, body);
  }

  @Delete('edge-functions/:id')
  async deleteEdgeFunction(
    @Param('id') id: string,
    @Query('teamId') teamId: string
  ) {
    return this.edgeFunctions.deleteFunction(id, teamId);
  }

  @Post('edge-functions/:id/invoke')
  async invokeEdgeFunction(
    @Param('id') id: string,
    @Body() body: { teamId: string; method?: string; path?: string; query?: any; body?: any; headers?: any }
  ) {
    return this.edgeFunctions.invokeFunction(id, body.teamId, body);
  }
}

function pathName(key: string): string {
  const parts = key.split('/');
  return parts[parts.length - 1] || 'file';
}
