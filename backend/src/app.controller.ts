import { Controller, Get, Post, Delete, Body, Param, Query, UploadedFile, UseInterceptors, Res, BadRequestException, Headers } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import * as express from 'express';
import { PrismaService } from './prisma/prisma.service';
import { StorageService } from './storage/storage.service';
import { ProjectsService } from './projects/projects.service';
import { DatabasesService } from './databases/databases.service';
import { TeamsService } from './teams/teams.service';
import { BillingService } from './billing/billing.service';
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
    @Body() body: { name?: string; buildCommand?: string; startCommand?: string; port?: number; githubBranch?: string; teamId: string }
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

  @Get('projects/:id/metrics')
  async getProjectMetrics(@Param('id') id: string) {
    return this.projects.getProjectMetrics(id);
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
  async updatePlan(@Query('teamId') teamId: string, @Body() body: { planId: string }) {
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
}

function pathName(key: string): string {
  const parts = key.split('/');
  return parts[parts.length - 1] || 'file';
}
