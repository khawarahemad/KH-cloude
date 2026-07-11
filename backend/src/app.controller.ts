import { Controller, Get, Post, Delete, Body, Param, Query, UploadedFile, UseInterceptors, Res, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import * as express from 'express';
import { PrismaService } from './prisma/prisma.service';
import { StorageService } from './storage/storage.service';
import { ProjectsService } from './projects/projects.service';
import { DatabasesService } from './databases/databases.service';
import { TeamsService } from './teams/teams.service';
import { BillingService } from './billing/billing.service';
import { TeamRole, DatabaseType } from '@prisma/client';

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

  // --- AUTH ENDPOINTS (Simulation) ---

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

    // Create default account
    await this.prisma.account.create({
      data: {
        accountId: user.id,
        providerId: 'credentials',
        userId: user.id,
        password, // In production, hash this with bcrypt. Keeping it plain for simple SQLite setup.
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

    if (!user || user.accounts[0]?.password !== password) {
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
}

function pathName(key: string): string {
  const parts = key.split('/');
  return parts[parts.length - 1] || 'file';
}
