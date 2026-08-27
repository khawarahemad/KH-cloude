import { Controller, Get, Post, Put, Delete, Body, Param, Query, UploadedFile, UseInterceptors, Res, Req, BadRequestException, NotFoundException, Headers, UnauthorizedException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import * as express from 'express';
import type { Response } from 'express';
import { PrismaService } from './prisma/prisma.service';
import { StorageService } from './storage/storage.service';
import { ProjectsService } from './projects/projects.service';
import { DatabasesService } from './databases/databases.service';
import { TeamsService } from './teams/teams.service';
import { BillingService } from './billing/billing.service';
import { EdgeFunctionsService } from './edge-functions/edge-functions.service';
import { GithubAppService } from './github-app/github-app.service';
import { NetworkService } from './guards/network.service';
import { MaintenanceService } from './maintenance/maintenance.service';
import { TeamRole, DatabaseType } from '@prisma/client';
import { sendDirectDiscordNotification } from './utils/discord-webhook';
import { RbacService } from './guards/rbac.service';
import { PlanLimitsService } from './billing/plan-limits.service';
import { TokenService } from './auth/token.service';
import { Public } from './auth/public.decorator';
import { UserDto } from './auth/dto/user.dto';

import * as argon2 from 'argon2';

async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password);
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
    private planLimits: PlanLimitsService,
    private edgeFunctions: EdgeFunctionsService,
    private githubApp: GithubAppService,
    private networkService: NetworkService,
    private maintenance: MaintenanceService,
    private rbac: RbacService,
    private tokens: TokenService,
  ) {}

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private setSessionCookies(res: Response, accessToken: string, refreshToken: string) {
    const isProduction = process.env.NODE_ENV === 'production';
    const cookieOpts = {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict' as const,
      path: '/',
    };
    res.cookie('kh_session', accessToken, { ...cookieOpts, maxAge: 15 * 60 * 1000 });
    res.cookie('kh_refresh', refreshToken, { ...cookieOpts, maxAge: 7 * 24 * 60 * 60 * 1000 });
  }

  private clearSessionCookies(res: Response) {
    res.clearCookie('kh_session', { path: '/' });
    res.clearCookie('kh_refresh', { path: '/' });
  }

  // --- AUTH ENDPOINTS ---

  @Public()
  @Post('auth/register')
  async register(@Body() body: any, @Res({ passthrough: true }) res: Response) {
    const { name, email, password } = body;
    if (!name || !email || !password) {
      throw new BadRequestException('Name, email and password are required.');
    }

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new BadRequestException('User with this email already exists.');
    }

    const user = await this.prisma.user.create({ data: { name, email } });

    await this.prisma.account.create({
      data: {
        accountId: user.id,
        providerId: 'credentials',
        userId: user.id,
        password: await hashPassword(password),
      },
    });

    const team = await this.teams.createTeam(`${name}'s Team`, user.id);

    // Issue session immediately on registration
    const [accessToken, refreshToken] = await Promise.all([
      this.tokens.signAccessToken(user.id),
      this.tokens.signRefreshToken(user.id),
    ]);
    this.setSessionCookies(res, accessToken, refreshToken);

    return { user: UserDto.from(user), team };
  }

  @Public()
  @Post('auth/login')
  async login(@Body() body: any, @Res({ passthrough: true }) res: Response) {
    const { email, password } = body;
    if (!email || !password) {
      throw new BadRequestException('Email and password are required.');
    }

    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { accounts: true },
    });

    if (!user || !user.accounts[0]?.password) {
      throw new BadRequestException('Invalid email or password.');
    }
    const isValid = await argon2.verify(user.accounts[0].password, password).catch(() => false);
    if (!isValid) {
      throw new BadRequestException('Invalid email or password.');
    }

    const teams = await this.teams.getTeams(user.id);

    const [accessToken, refreshToken] = await Promise.all([
      this.tokens.signAccessToken(user.id),
      this.tokens.signRefreshToken(user.id),
    ]);
    this.setSessionCookies(res, accessToken, refreshToken);

    return { user: UserDto.from(user), teams };
  }

  @Public()
  @Post('auth/refresh')
  async refresh(@Req() req: express.Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken: string | undefined = (req.cookies as any)?.['kh_refresh'];
    if (!refreshToken) throw new UnauthorizedException('No refresh token provided.');

    let payload: { sub: string; type: string };
    try {
      payload = await this.tokens.verifyToken(refreshToken);
    } catch {
      this.clearSessionCookies(res);
      throw new UnauthorizedException('Refresh token is invalid or expired. Please log in again.');
    }

    if (payload.type !== 'refresh') {
      this.clearSessionCookies(res);
      throw new UnauthorizedException('Invalid token type.');
    }

    const [newAccess, newRefresh] = await Promise.all([
      this.tokens.signAccessToken(payload.sub),
      this.tokens.signRefreshToken(payload.sub),
    ]);
    this.setSessionCookies(res, newAccess, newRefresh);

    return { success: true };
  }

  @Post('auth/logout')
  async logout(@Res({ passthrough: true }) res: Response) {
    this.clearSessionCookies(res);
    return { success: true };
  }

  @Get('auth/me')
  async me(@Req() req: express.Request) {
    const userId = (req as any).user?.id as string;
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found.');
    const teams = await this.teams.getTeams(userId);
    return { user: UserDto.from(user), teams };
  }

  @Post('users/:userId/settings')
  async updateSettings(
    @Param('userId') paramUserId: string,
    @Req() req: express.Request,
    @Body() body: {
      discordWebhookUrl?: string;
      discordNotifyDeploys?: boolean;
      discordNotifyErrors?: boolean;
      discordNotifyDatabases?: boolean;
    }
  ) {
    const userId = (req as any).user.id as string;
    // Users may only update their own settings
    if (userId !== paramUserId) throw new BadRequestException('You may only update your own settings.');

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found.');

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        discordWebhookUrl: body.discordWebhookUrl !== undefined ? body.discordWebhookUrl : user.discordWebhookUrl,
        discordNotifyDeploys: body.discordNotifyDeploys !== undefined ? body.discordNotifyDeploys : user.discordNotifyDeploys,
        discordNotifyErrors: body.discordNotifyErrors !== undefined ? body.discordNotifyErrors : user.discordNotifyErrors,
        discordNotifyDatabases: body.discordNotifyDatabases !== undefined ? body.discordNotifyDatabases : user.discordNotifyDatabases,
      },
    });

    return UserDto.from(updated);
  }

  @Post('users/:userId/settings/test-discord')
  async testDiscordWebhook(
    @Param('userId') paramUserId: string,
    @Req() req: express.Request,
    @Body() body: { webhookUrl: string }
  ) {
    const userId = (req as any).user.id as string;
    if (userId !== paramUserId) throw new BadRequestException('You may only test your own Discord webhook.');
    if (!body.webhookUrl) throw new BadRequestException('Webhook URL is required.');
    // Only allow discord.com webhooks to prevent SSRF
    if (!body.webhookUrl.startsWith('https://discord.com/api/webhooks/')) {
      throw new BadRequestException('webhookUrl must be a valid Discord webhook URL (https://discord.com/api/webhooks/...).');
    }

    try {
      await sendDirectDiscordNotification(body.webhookUrl, {
        title: 'Test Notification Successful',
        description: 'Your Discord integration for KH Cloud is successfully configured. You will now receive system notifications here based on your preferences.',
        color: 8138221,
      });
      return { success: true };
    } catch (err: any) {
      throw new BadRequestException(`Failed to send test notification: ${err.message}`);
    }
  }

  // --- TEAMS ENDPOINTS ---

  @Get('teams/:teamId/members')
  async getMembers(@Param('teamId') teamId: string, @Req() req: express.Request) {
    const userId = (req as any).user.id as string;

    await this.rbac.verifyTeamRole(userId, teamId, 'VIEWER');
    return this.teams.getMembers(teamId);
  }

  @Put('teams/:teamId/members/:userId/role')
  async updateMemberRole(
    @Param('teamId') teamId: string,
    @Param('userId') targetUserId: string,
    @Body() body: { role: TeamRole; actorUserId?: string },
    @Req() req: express.Request,
  ) {
    const actorUserId = (req as any).user.id as string;
    await this.rbac.verifyTeamRole(actorUserId, teamId, 'ADMIN');
    return this.teams.updateMemberRole(teamId, targetUserId, body.role, actorUserId);
  }

  @Delete('teams/:teamId/members/:userId')
  async removeMember(
    @Param('teamId') teamId: string,
    @Param('userId') targetUserId: string,
    @Query('actorUserId') actorUserIdQuery: string,
    @Req() req: express.Request,
  ) {
    const actorUserId = (req as any).user.id as string;
    if (actorUserId !== targetUserId) {
      await this.rbac.verifyTeamRole(actorUserId, teamId, 'ADMIN');
    } else {
      await this.rbac.verifyTeamRole(actorUserId, teamId, 'VIEWER');
    }
    return this.teams.removeMember(teamId, targetUserId, actorUserId);
  }

  @Post('teams/:teamId/invites')
  async inviteMember(
    @Param('teamId') teamId: string,
    @Body() body: { email: string; role: TeamRole; inviterId?: string },
    @Req() req: express.Request,
  ) {
    const inviterId = (req as any).user.id as string;
    await this.rbac.verifyTeamRole(inviterId, teamId, 'ADMIN');
    return this.teams.inviteMember(teamId, body.email, body.role, inviterId);
  }

  @Get('teams/:teamId/invites')
  async getInvites(@Param('teamId') teamId: string, @Req() req: express.Request) {
    const userId = (req as any).user.id as string;

    await this.rbac.verifyTeamRole(userId, teamId, 'ADMIN');
    return this.teams.getInvites(teamId);
  }

  @Get('user/invites')
  async getUserInvites(@Query('email') email: string) {
    return this.teams.getUserPendingInvites(email);
  }

  @Post('teams/invites/:inviteId/accept')
  async acceptInvite(
    @Param('inviteId') inviteId: string,
    @Body() body: { userId: string }
  ) {
    return this.teams.acceptInvite(inviteId, body.userId);
  }

  @Post('teams/invites/:inviteId/reject')
  async rejectInvite(
    @Param('inviteId') inviteId: string,
    @Body() body: { userId: string }
  ) {
    return this.teams.rejectInvite(inviteId, body.userId);
  }

  @Delete('teams/:teamId/invites/:inviteId')
  async deleteInvite(
    @Param('teamId') teamId: string,
    @Param('inviteId') inviteId: string,
    @Query('userId') queryUserId: string,
    @Req() req: express.Request,
  ) {
    const userId = (req as any).user.id as string;
    await this.rbac.verifyTeamRole(userId, teamId, 'ADMIN');
    return this.teams.deleteInvite(inviteId, teamId, userId);
  }

  @Get('teams/:teamId/audit')
  async getAuditLogs(@Param('teamId') teamId: string, @Req() req: express.Request) {
    const userId = (req as any).user.id as string;

    await this.rbac.verifyTeamRole(userId, teamId, 'VIEWER');
    return this.teams.getAuditLogs(teamId);
  }

  @Get('teams/:teamId/keys')
  async getTeamKeys(@Param('teamId') teamId: string, @Req() req: express.Request) {
    const userId = (req as any).user.id as string;

    await this.rbac.verifyTeamRole(userId, teamId, 'DEVELOPER');
    return this.teams.getOrCreateApiKeys(teamId);
  }

  // --- PROJECTS ENDPOINTS ---

  @Post('projects')
  async createProject(@Body() body: any, @Req() req: express.Request) {
    const userId = (req as any).user.id as string;

    await this.rbac.verifyTeamRole(userId, body.teamId, 'DEVELOPER');
    await this.planLimits.enforceProjectLimit(body.teamId);
    return this.projects.createProject(body);
  }

  @Post('projects/:id/update')
  async updateProject(
    @Param('id') id: string,
    @Body() body: { name?: string; buildCommand?: string; installCommand?: string; startCommand?: string; port?: number; githubBranch?: string; rootDirectory?: string; teamId: string },
    @Req() req: express.Request,
  ) {
    const userId = (req as any).user.id as string;

    await this.rbac.verifyProjectAccess(userId, id, 'DEVELOPER');
    return this.projects.updateProject(id, body);
  }

  @Get('projects')
  async getProjects(@Query('teamId') teamId: string, @Req() req: express.Request) {
    const userId = (req as any).user.id as string;

    await this.rbac.verifyTeamRole(userId, teamId, 'VIEWER');
    return this.projects.getProjects(teamId);
  }

  @Get('projects/:id')
  async getProjectDetails(
    @Param('id') id: string,
    @Query('teamId') teamId: string,
    @Req() req: express.Request,
  ) {
    const userId = (req as any).user.id as string;

    await this.rbac.verifyProjectAccess(userId, id, 'VIEWER');
    return this.projects.getProjectDetails(id, teamId);
  }

  @Post('projects/:id/deploy')
  async deployProject(
    @Param('id') id: string,
    @Body() body: { teamId: string; userName?: string; userId?: string },
    @Req() req: express.Request,
  ) {
    const userId = (req as any).user.id as string;

    await this.rbac.verifyProjectAccess(userId, id, 'DEVELOPER');
    return this.projects.triggerDeployment(id, body.teamId, {
      triggeredBy: 'MANUAL',
      triggeredByName: body.userName || 'Dashboard User',
    });
  }

  @Get('projects/:id/deployments')
  async getProjectDeployments(@Param('id') id: string, @Req() req: express.Request) {
    const userId = (req as any).user.id as string;

    await this.rbac.verifyProjectAccess(userId, id, 'VIEWER');
    return this.projects.getDeployments(id);
  }

  @Get('deployments/:depId/logs')
  async getDeploymentLogs(@Param('depId') depId: string, @Req() req: express.Request) {
    const userId = (req as any).user.id as string;

    await this.rbac.verifyDeploymentAccess(userId, depId, 'VIEWER');
    return this.projects.getDeploymentLogs(depId);
  }

  @Post('projects/:id/restart')
  async restartProject(
    @Param('id') id: string,
    @Body() body: { teamId: string },
    @Req() req: express.Request,
  ) {
    const userId = (req as any).user.id as string;

    await this.rbac.verifyProjectAccess(userId, id, 'DEVELOPER');
    return this.projects.restartProject(id, body.teamId);
  }

  @Post('projects/:id/rollback')
  async rollbackProject(
    @Param('id') id: string,
    @Body() body: { deploymentId: string; teamId: string },
    @Req() req: express.Request,
  ) {
    const userId = (req as any).user.id as string;

    await this.rbac.verifyProjectAccess(userId, id, 'DEVELOPER');
    return this.projects.rollbackDeployment(id, body.deploymentId, body.teamId);
  }

  @Post('projects/:id/env')
  async setEnvVars(
    @Param('id') id: string,
    @Body() body: { vars: any[] },
    @Req() req: express.Request,
  ) {
    const userId = (req as any).user.id as string;

    await this.rbac.verifyProjectAccess(userId, id, 'DEVELOPER');
    return this.projects.setEnvVars(id, body.vars);
  }

  @Post('projects/:id/domain')
  async addCustomDomain(
    @Param('id') id: string,
    @Body() body: { hostname: string; teamId: string },
    @Req() req: express.Request,
  ) {
    const userId = (req as any).user.id as string;

    await this.rbac.verifyProjectAccess(userId, id, 'DEVELOPER');
    return this.projects.addCustomDomain(id, body.hostname, body.teamId);
  }

  @Delete('projects/:id/domain/:domainId')
  async removeCustomDomain(
    @Param('id') id: string,
    @Param('domainId') domainId: string,
    @Body() body: { teamId: string },
    @Req() req: express.Request,
  ) {
    const userId = (req as any).user.id as string;

    await this.rbac.verifyProjectAccess(userId, id, 'DEVELOPER');
    return this.projects.removeCustomDomain(id, domainId, body.teamId);
  }

  @Get('projects/:id/metrics')
  async getProjectMetrics(@Param('id') id: string, @Req() req: express.Request) {
    const userId = (req as any).user.id as string;

    await this.rbac.verifyProjectAccess(userId, id, 'VIEWER');
    return this.projects.getProjectMetrics(id);
  }

  @Get('projects/:id/runtime-logs')
  async getRuntimeLogs(
    @Param('id') id: string,
    @Query('teamId') teamId: string,
    @Req() req: express.Request,
  ) {
    const userId = (req as any).user.id as string;

    await this.rbac.verifyProjectAccess(userId, id, 'VIEWER');
    return this.projects.getRuntimeLogs(id, teamId);
  }

  @Delete('projects/:id')
  async deleteProject(
    @Param('id') id: string,
    @Query('teamId') teamId: string,
    @Req() req: express.Request,
  ) {
    const userId = (req as any).user.id as string;

    await this.rbac.verifyProjectAccess(userId, id, 'ADMIN');
    return this.projects.deleteProject(id, teamId);
  }

  // --- ADMIN: ONE-TIME SECURITY CLEANUP ---

  @Post('admin/purge-github-installations')
  async adminPurgeGithubInstallations(@Req() req: express.Request) {
    // Only platform admins (user.role === 'ADMIN') can run this
    const userId = (req as any).user.id as string;
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.role !== 'ADMIN') {
      throw new BadRequestException('Platform admin role required.');
    }
    const purged = await this.prisma.purgeOrphanedInstallations();
    return { success: true, purgedRows: purged, message: purged > 0 ? `Removed ${purged} cross-tenant installation rows. All affected users must reconnect their GitHub accounts.` : 'No cross-tenant leakage found. Database is clean.' };
  }

  @Public()
  @Post('github/webhook')
  async handleGithubWebhook(
    @Body() payload: any,
    @Headers('x-github-event') event: string,
    @Headers('x-hub-signature-256') signature: string,
    @Req() req: any,
  ) {
    // Verify HMAC signature using GitHub App webhook secret
    const rawBody = req.rawBody || JSON.stringify(payload);
    if (signature && !this.githubApp.verifyWebhookSignature(rawBody, signature)) {
      throw new BadRequestException('Invalid webhook signature.');
    }

    if (event === 'push') {
      const repoFullName = payload.repository?.full_name;
      const ref = payload.ref; // e.g. refs/heads/main
      if (repoFullName && ref) {
        const branch = ref.replace('refs/heads/', '');

        // Extract commit metadata from GitHub push payload
        const headCommit = payload.head_commit;
        const commitHash = headCommit?.id ? headCommit.id.substring(0, 7) : undefined;
        const commitMessage = headCommit?.message
          ? headCommit.message.split('\n')[0].trim().substring(0, 120)  // first line, max 120 chars
          : undefined;
        const pusher = payload.pusher?.name || payload.sender?.login;
        const commitAuthor = headCommit?.author?.name || headCommit?.committer?.name || pusher;

        await this.projects.triggerGitOpsDeployment(
          repoFullName,
          branch,
          commitHash,
          commitMessage,
          pusher,
          commitAuthor,
        );
      }
    }
    return { received: true };
  }

  // --- DATABASES ENDPOINTS ---

  @Post('databases')
  async createDatabase(
    @Body() body: { name: string; type: DatabaseType; teamId: string; projectId?: string },
    @Req() req: express.Request,
  ) {
    const userId = (req as any).user.id as string;

    await this.rbac.verifyTeamRole(userId, body.teamId, 'DEVELOPER');
    await this.planLimits.enforceDatabaseLimit(body.teamId);
    return this.databases.createDatabase(body);
  }

  @Get('databases')
  async getDatabases(@Query('teamId') teamId: string, @Req() req: express.Request) {
    const userId = (req as any).user.id as string;

    await this.rbac.verifyTeamRole(userId, teamId, 'VIEWER');
    return this.databases.getDatabases(teamId);
  }

  @Get('databases/:id/credentials')
  async getDatabaseCredentials(
    @Param('id') id: string,
    @Query('teamId') teamId: string,
    @Req() req: express.Request,
  ) {
    const userId = (req as any).user.id as string;
    await this.rbac.verifyDatabaseAccess(userId, id, 'ADMIN');
    return this.databases.getDatabaseCredentials(id, teamId);
  }

  @Delete('databases/:id')
  async deleteDatabase(
    @Param('id') id: string,
    @Query('teamId') teamId: string,
    @Req() req: express.Request,
  ) {
    const userId = (req as any).user.id as string;

    await this.rbac.verifyDatabaseAccess(userId, id, 'ADMIN');
    return this.databases.deleteDatabase(id, teamId);
  }

  @Get('databases/:id/tables')
  async getDatabaseTables(
    @Param('id') id: string,
    @Query('teamId') teamId: string,
    @Req() req: express.Request,
  ) {
    const userId = (req as any).user.id as string;

    await this.rbac.verifyDatabaseAccess(userId, id, 'VIEWER');
    return this.databases.getTables(id, teamId);
  }

  @Post('databases/:id/query')
  async runDatabaseQuery(
    @Param('id') id: string,
    @Body() body: { sql: string; teamId: string },
    @Req() req: express.Request,
  ) {
    const userId = (req as any).user.id as string;

    await this.rbac.verifyDatabaseAccess(userId, id, 'DEVELOPER');
    return this.databases.runQuery(id, body.teamId, body.sql);
  }

  // --- OBJECT STORAGE (BUCKETS) ENDPOINTS ---

  @Post('storage/buckets')
  async createBucket(
    @Body() body: { name: string; isPublic: boolean; teamId: string },
    @Req() req: express.Request,
  ) {
    const userId = (req as any).user.id as string;

    await this.rbac.verifyTeamRole(userId, body.teamId, 'DEVELOPER');
    await this.planLimits.enforceStorageAccess(body.teamId);
    return this.storage.createBucket(body.name, body.isPublic, body.teamId);
  }

  @Get('storage/buckets')
  async getBuckets(@Query('teamId') teamId: string, @Req() req: express.Request) {
    const userId = (req as any).user.id as string;

    await this.rbac.verifyTeamRole(userId, teamId, 'VIEWER');
    return this.storage.getBuckets(teamId);
  }

  @Delete('storage/buckets/:id')
  async deleteBucket(
    @Param('id') id: string,
    @Query('teamId') teamId: string,
    @Req() req: express.Request,
  ) {
    const userId = (req as any).user.id as string;

    await this.rbac.verifyBucketAccess(userId, id, 'ADMIN');
    return this.storage.deleteBucket(id, teamId);
  }

  @Get('storage/buckets/:id/files')
  async listFiles(
    @Param('id') id: string,
    @Query('prefix') prefix: string,
    @Req() req: express.Request,
  ) {
    const userId = (req as any).user.id as string;

    await this.rbac.verifyBucketAccess(userId, id, 'VIEWER');
    return this.storage.listFiles(id, prefix || '');
  }

  @Post('storage/buckets/:id/upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @Param('id') id: string,
    @UploadedFile() file: any,
    @Query('key') key: string,
    @Query('teamId') teamId: string,
    @Req() req: express.Request,
  ) {
    if (!file) throw new BadRequestException('No file uploaded.');
    const userId = (req as any).user.id as string;

    await this.rbac.verifyBucketAccess(userId, id, 'DEVELOPER');
    await this.planLimits.enforceStorageAccess(teamId);
    return this.storage.uploadFile(id, key || file.originalname, file.buffer, file.mimetype, file.originalname, teamId);
  }

  @Get('storage/buckets/:id/download')
  async downloadFile(
    @Param('id') id: string,
    @Query('key') key: string,
    @Query('token') token: string,
    @Query('apikey') queryApiKey: string,
    @Headers() headers: any,
    @Res() res: express.Response
  ) {
    if (!key) throw new BadRequestException('File key required.');

    const bucket = await this.prisma.bucket.findUnique({ where: { id } });
    if (!bucket) throw new NotFoundException('Bucket not found.');

    if (!bucket.isPublic) {
      const passedKey = queryApiKey || headers?.['apikey'] || headers?.['x-api-key'] || (headers?.['authorization']?.startsWith('Bearer ') ? headers['authorization'].substring(7) : null);
      let isAuthorized = false;

      if (passedKey) {
        const crypto = require('crypto');
        const hashedKey = crypto.createHash('sha256').update(passedKey).digest('hex');
        const keyMatch = await this.prisma.apiKey.findFirst({
          where: { teamId: bucket.teamId, key: hashedKey },
        });
        if (keyMatch) isAuthorized = true;
      }

      if (!isAuthorized && token) {
        if (this.storage.verifyMockToken(id, key, token as string)) isAuthorized = true;
      }

      if (!isAuthorized) {
        throw new BadRequestException('Unauthorized access. Private buckets require a valid API Key or presigned token.');
      }
    }

    try {
      const fileBuffer = await this.storage.getFile(id, key);
      
      // Attempt to guess Content-Type from metadata
      const meta = await this.prisma.objectMetadata.findFirst({
        where: { bucketId: id, key },
      });
      
      res.setHeader('Content-Type', meta?.contentType || 'application/octet-stream');
      res.setHeader('Content-Disposition', `inline; filename="${pathName(key)}"`);
      if (bucket.isPublic) {
        res.setHeader('Cache-Control', 'public, max-age=86400');
      } else {
        res.setHeader('Cache-Control', 'private, no-store');
      }
      return res.send(fileBuffer);
    } catch (err: any) {
      if (err.name === 'AccessDenied' || err.message?.includes('AccessDenied')) {
        throw new BadRequestException(`Cloud Storage Error: Access Denied to backend. Please check MinIO credentials.`);
      }
      throw new BadRequestException(`Failed to read file: ${err.message}`);
    }
  }

  @Delete('storage/buckets/:id/files')
  async deleteFile(
    @Param('id') id: string,
    @Query('key') key: string,
    @Query('teamId') teamId: string,
    @Req() req: express.Request,
  ) {
    if (!key) throw new BadRequestException('File key required.');
    const userId = (req as any).user.id as string;

    await this.rbac.verifyBucketAccess(userId, id, 'DEVELOPER');
    return this.storage.deleteFile(id, key, teamId);
  }

  @Get('storage/buckets/:id/presigned')
  async getPresignedUrl(
    @Param('id') id: string,
    @Query('key') key: string,
    @Query('expiresIn') expiresIn: string,
    @Req() req: express.Request,
  ) {
    if (!key) throw new BadRequestException('File key required.');
    const userId = (req as any).user.id as string;

    await this.rbac.verifyBucketAccess(userId, id, 'VIEWER');
    const exp = expiresIn ? parseInt(expiresIn) : 3600;
    const url = await this.storage.generatePresignedUrl(id, key, exp);
    return { url };
  }

  // --- BILLING ENDPOINTS ---

  @Get('billing')
  async getBillingInfo(@Query('teamId') teamId: string, @Req() req: express.Request) {
    const userId = (req as any).user.id as string;

    await this.rbac.verifyTeamRole(userId, teamId, 'VIEWER');
    return this.billing.getBillingInfo(teamId);
  }

  @Post('billing/checkout')
  async createCheckoutSession(
    @Query('teamId') teamId: string,
    @Body() body: { planId: string },
    @Req() req: express.Request,
  ) {
    const userId = (req as any).user.id as string;
    await this.rbac.verifyTeamRole(userId, teamId, 'OWNER');
    // Simulate returning a Stripe checkout session URL
    return { url: `https://checkout.stripe.com/pay/cs_test_${teamId}_${body.planId}` };
  }

  /**
   * @security Stripe Webhook Signature Verification
   * Replaces the unverified webhook endpoint with cryptographic signature validation.
   * Ensures that `checkout.session.completed` payloads cannot be spoofed by attackers to bypass billing.
   */
  @Public()
  @Post('billing/webhook')
  async stripeWebhook(@Req() req: express.Request, @Headers('stripe-signature') signature: string) {
    if (!signature) throw new BadRequestException('Missing stripe signature');

    const stripeSecret = process.env.STRIPE_SECRET_KEY || '';
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET || '';

    if (!stripeSecret || !endpointSecret) {
      // In development, you might just accept it without verification if secrets are missing,
      // but for security audit, we must enforce it or throw.
      throw new BadRequestException('Stripe webhook secrets not configured');
    }

    const Stripe = require('stripe');
    const stripe = new Stripe(stripeSecret);

    let event;
    try {
      // req.rawBody is captured in main.ts by Express for precisely this purpose
      event = stripe.webhooks.constructEvent((req as any).rawBody, signature, endpointSecret);
    } catch (err: any) {
      throw new BadRequestException(`Webhook Signature Error: ${err.message}`);
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const teamId = session.client_reference_id;
      const planId = session.metadata?.planId;
      if (teamId && planId) {
        await this.billing.updatePlan(teamId, planId);
      }
    }
    return { received: true };
  }

  // --- GITHUB INTEGRATION ENDPOINTS ---

  @Public()
  @Post('auth/github/callback')
  async githubCallback(@Body() body: { code: string }, @Req() req: express.Request) {
    const { code } = body;
    if (!code) throw new BadRequestException('Authorization code required.');

    let userId: string | undefined;
    const cookieToken: string | undefined = (req.cookies as any)?.['kh_session'];
    const bearerToken = req.headers?.['authorization']?.startsWith('Bearer ') ? req.headers['authorization'].substring(7).trim() : null;
    const token = cookieToken || (bearerToken?.split('.').length === 3 ? bearerToken : null);
    if (token) {
      try {
        const payload = await this.tokens.verifyToken(token);
        if (payload.type === 'access') userId = payload.sub;
      } catch {}
    }

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
      let email = githubUser.email;
      if (!email) {
        try {
          const emailsRes = await fetch('https://api.github.com/user/emails', {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              Accept: 'application/json',
              'User-Agent': 'KH-Cloud-Backend',
            },
          }).then((r) => r.json());
          if (Array.isArray(emailsRes)) {
            const primaryEmail = emailsRes.find((e: any) => e.primary && e.verified);
            if (primaryEmail) {
              email = primaryEmail.email;
            }
          }
        } catch (err) {
          console.error('Failed to fetch GitHub private emails:', err);
        }
      }
      if (!email) {
        email = `${githubUsername}@github.com`;
      }

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

  @Public()
  @Post('auth/google/callback')
  async googleCallback(@Body() body: { code: string; redirectUri: string }, @Req() req: express.Request) {
    const { code, redirectUri } = body;
    if (!code) throw new BadRequestException('Authorization code required.');

    let userId: string | undefined;
    const cookieToken: string | undefined = (req.cookies as any)?.['kh_session'];
    const bearerToken = req.headers?.['authorization']?.startsWith('Bearer ') ? req.headers['authorization'].substring(7).trim() : null;
    const token = cookieToken || (bearerToken?.split('.').length === 3 ? bearerToken : null);
    if (token) {
      try {
        const payload = await this.tokens.verifyToken(token);
        if (payload.type === 'access') userId = payload.sub;
      } catch {}
    }

    const googleClientId = process.env.GOOGLE_CLIENT_ID || '';
    const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET || '';

    if (!googleClientId || !googleClientSecret) {
      throw new BadRequestException('Google OAuth credentials not configured on the backend. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.');
    }

    // 1. Exchange code for access token
    const tokenUrl = 'https://oauth2.googleapis.com/token';
    const tokenRes = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        code,
        client_id: googleClientId,
        client_secret: googleClientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    }).then((r) => r.json());

    const accessToken = tokenRes.access_token;
    if (!accessToken) {
      throw new BadRequestException(`Google token exchange failed: ${tokenRes.error_description || 'unknown error'}`);
    }

    // 2. Fetch user profile details
    const userUrl = 'https://www.googleapis.com/oauth2/v3/userinfo';
    const googleUser = await fetch(userUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }).then((r) => r.json());

    const email = googleUser.email;
    if (!email) {
      throw new BadRequestException('Failed to fetch email from Google profile.');
    }

    let user;
    if (userId) {
      // Attach to existing user
      user = await this.prisma.user.update({
        where: { id: userId },
        data: {
          image: googleUser.picture || undefined,
        },
      });
    } else {
      // Register/Login flow
      user = await this.prisma.user.findUnique({
        where: { email },
      });

      if (!user) {
        user = await this.prisma.user.create({
          data: {
            name: googleUser.name || googleUser.given_name || email.split('@')[0],
            email,
            image: googleUser.picture || null,
          },
        });

        // Create default team
        await this.teams.createTeam(`${user.name}'s Team`, user.id);
      } else if (googleUser.picture && !user.image) {
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: {
            image: googleUser.picture,
          },
        });
      }
    }

    const teams = await this.teams.getTeams(user.id);
    return { user, teams };
  }
  // --- GITHUB APP ENDPOINTS ---

  @Get('github-app/install-url')
  async getGithubAppInstallUrl(@Query('teamId') teamId: string, @Req() req: express.Request) {
    if (!teamId) throw new BadRequestException('teamId is required.');
    const userId = (req as any).user.id as string;

    await this.rbac.verifyTeamRole(userId, teamId, 'ADMIN');
    return { url: this.githubApp.getInstallUrl(teamId) };
  }

  @Public()
  @Get('github-app/callback')
  async githubAppCallback(
    @Query('installation_id') installationId: string,
    @Query('state') state: string,
    @Req() req: express.Request,
  ) {
    if (!installationId) throw new BadRequestException('installation_id is required.');

    let teamId: string | null = null;
    let exp: number | null = null;
    
    if (state) {
      try {
        const decodedStr = Buffer.from(state, 'base64url').toString('utf-8');
        const { payload, hmac } = JSON.parse(decodedStr);
        
        const secret = process.env.JWT_SECRET || 'fallback_secret_for_hmac';
        const expectedHmac = require('crypto').createHmac('sha256', secret).update(payload).digest('hex');
        
        if (hmac !== expectedHmac) throw new Error('Invalid HMAC');
        
        const decodedPayload = JSON.parse(payload);
        teamId = decodedPayload.teamId;
        exp = decodedPayload.exp;
      } catch (err) {
        throw new BadRequestException('Invalid, tampered, or missing state parameter.');
      }
    }

    if (!teamId) throw new BadRequestException('Invalid state parameter: missing teamId.');
    if (!exp || Date.now() > exp) throw new BadRequestException('Installation link has expired. Please try again.');

    let userId: string | undefined;
    const cookieToken: string | undefined = (req.cookies as any)?.['kh_session'];
    const bearerToken = req.headers?.['authorization']?.startsWith('Bearer ') ? req.headers['authorization'].substring(7).trim() : null;
    const token = cookieToken || (bearerToken?.split('.').length === 3 ? bearerToken : null);
    
    if (token) {
      try {
        const decoded = await this.tokens.verifyToken(token);
        if (decoded.type === 'access') userId = decoded.sub;
      } catch {}
    }

    if (!userId) throw new UnauthorizedException('Authentication required to install GitHub App.');
    await this.rbac.verifyTeamRole(userId, teamId, 'ADMIN');

    // Verify team exists
    const team = await this.prisma.team.findUnique({ where: { id: teamId } });
    if (!team) throw new BadRequestException('Team not found.');

    // Fetch installation metadata from GitHub
    const jwt = this.githubApp.generateAppJwt();
    const installRes = await fetch(`https://api.github.com/app/installations/${installationId}`, {
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'KH-Cloud-Backend',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    if (!installRes.ok) {
      const errText = await installRes.text();
      throw new BadRequestException(`Failed to fetch GitHub installation metadata: ${errText}`);
    }

    const installJson: any = await installRes.json();
    const accountLogin: string = installJson?.account?.login || 'unknown';
    const accountType: string = installJson?.account?.type || 'User';
    const avatarUrl: string | null = installJson?.account?.avatar_url || null;

    if (accountLogin === 'unknown') {
      throw new BadRequestException('GitHub installation account could not be resolved. Check GITHUB_APP_ID / GITHUB_APP_PRIVATE_KEY.');
    }

    // Upsert on team + installationId: allows multiple installations per team (personal + orgs)
    await (this.prisma.githubInstallation as any).upsert({
      where: {
        teamId_installationId: { teamId, installationId },
      },
      create: { installationId, teamId, accountLogin, accountType, avatarUrl },
      update: { accountLogin, accountType, avatarUrl },
    });

    return { success: true, installationId, accountLogin, accountType, avatarUrl };
  }

  @Get('github-app/installations')
  async getGithubAppInstallations(
    @Query('teamId') teamId: string,
    @Req() req: express.Request,
  ) {
    if (!teamId) throw new BadRequestException('teamId is required.');
    const userId = (req as any).user.id as string;

    await this.rbac.verifyTeamRole(userId, teamId, 'VIEWER');

    // ONLY fetch installations linked to this specific team
    const teamInstalls = await (this.prisma.githubInstallation as any).findMany({
      where: { teamId },
      orderBy: { createdAt: 'asc' },
    });

    return {
      connected: teamInstalls.length > 0,
      installations: teamInstalls.map((inst: any) => ({
        id: inst.id,
        installationId: inst.installationId,
        accountLogin: inst.accountLogin,
        accountType: inst.accountType,
        avatarUrl: inst.avatarUrl,
      })),
    };
  }

  @Delete('github-app/installations/:installationId')
  async deleteGithubAppInstallation(
    @Param('installationId') installationId: string,
    @Query('teamId') teamId: string,
    @Req() req: express.Request,
  ) {
    if (!teamId || !installationId) throw new BadRequestException('teamId and installationId are required.');
    const userId = (req as any).user.id as string;

    await this.rbac.verifyTeamRole(userId, teamId, 'DEVELOPER');

    await this.prisma.githubInstallation.deleteMany({
      where: { teamId, installationId },
    });

    return { success: true };
  }

  @Get('github-app/repos')
  async getGithubAppRepos(
    @Query('teamId') teamId: string,
    @Query('installationId') installationId?: string,
    @Req() req?: express.Request,
  ) {
    if (!teamId) throw new BadRequestException('teamId is required.');
    const userId = (req as any).user.id as string;

    await this.rbac.verifyTeamRole(userId, teamId, 'VIEWER');

    // Fetch ONLY installations belonging to this team
    const teamInstalls: any[] = await (this.prisma.githubInstallation as any).findMany({
      where: { teamId },
      orderBy: { createdAt: 'asc' },
    });

    if (teamInstalls.length === 0) {
      return { connected: false, installations: [], repos: [] };
    }

    // If a specific installation is requested (and not 'all')
    if (installationId && installationId !== 'all') {
      const target = teamInstalls.find((i) => i.installationId === installationId);
      if (!target) {
        throw new NotFoundException('GitHub installation not found for this team.');
      }

      try {
        const { repos, repositorySelection, totalCount } =
          await this.githubApp.listInstallationRepos(target.installationId);
        const enrichedRepos = repos.map((r) => ({
          ...r,
          accountLogin: target.accountLogin,
          accountType: target.accountType,
          avatarUrl: target.avatarUrl,
          installationId: target.installationId,
        }));
        return {
          connected: true,
          installations: teamInstalls,
          installationId: target.installationId,
          accountLogin: target.accountLogin,
          accountType: target.accountType,
          avatarUrl: target.avatarUrl,
          repositorySelection,
          totalCount,
          repos: enrichedRepos,
        };
      } catch (err: any) {
        return {
          connected: true,
          installations: teamInstalls,
          installationId: target.installationId,
          accountLogin: target.accountLogin,
          accountType: target.accountType,
          avatarUrl: target.avatarUrl,
          repositorySelection: null,
          totalCount: 0,
          repos: [],
          error: err.message,
        };
      }
    }

    // Default: fetch repos across all installations linked to this team
    const allRepos: any[] = [];
    const fetchPromises = teamInstalls.map(async (inst) => {
      try {
        const { repos } = await this.githubApp.listInstallationRepos(inst.installationId);
        return repos.map((r) => ({
          ...r,
          accountLogin: inst.accountLogin,
          accountType: inst.accountType,
          avatarUrl: inst.avatarUrl,
          installationId: inst.installationId,
        }));
      } catch (err: any) {
        console.warn(`Failed listing repos for installation ${inst.installationId} (@${inst.accountLogin}):`, err.message);
        return [];
      }
    });

    const results = await Promise.all(fetchPromises);
    for (const repoList of results) {
      allRepos.push(...repoList);
    }

    return {
      connected: true,
      installations: teamInstalls,
      installationId: 'all',
      accountLogin: teamInstalls.map((i) => i.accountLogin).join(', '),
      accountType: teamInstalls.length > 1 ? 'Multiple' : teamInstalls[0]?.accountType || 'User',
      repositorySelection: 'all',
      totalCount: allRepos.length,
      repos: allRepos,
    };
  }

  @Get('github-app/installation')
  async getGithubAppInstallation(@Query('teamId') teamId: string, @Req() req?: express.Request) {
    if (!teamId) throw new BadRequestException('teamId is required.');
    const userId = (req as any).user.id as string;

    await this.rbac.verifyTeamRole(userId, teamId, 'VIEWER');

    const installation: any = await (this.prisma.githubInstallation as any).findFirst({
      where: { teamId },
      orderBy: { createdAt: 'asc' },
    });
    return installation
      ? {
          connected: true,
          installationId: installation.installationId,
          accountLogin: installation.accountLogin,
          accountType: installation.accountType,
          avatarUrl: installation.avatarUrl,
        }
      : { connected: false };
  }

  @Get('github-app/manage-url')
  async getGithubAppManageUrl(
    @Query('teamId') teamId: string,
    @Query('installationId') installationId?: string,
    @Query('action') action?: string,
    @Req() req?: express.Request,
  ) {
    if (!teamId) throw new BadRequestException('teamId is required.');
    const userId = (req as any).user.id as string;

    await this.rbac.verifyTeamRole(userId, teamId, 'ADMIN');

    const appSlug = process.env.GITHUB_APP_SLUG || 'kh-cloud-app';

    if (action === 'install') {
      return {
        url: this.githubApp.getInstallUrl(teamId),
        mode: 'install',
        connected: true,
      };
    }

    let installation = null;
    if (installationId) {
      installation = await this.prisma.githubInstallation.findFirst({
        where: { teamId, installationId },
      });
    }

    if (!installation) {
      installation = await this.prisma.githubInstallation.findFirst({
        where: { teamId },
        orderBy: { createdAt: 'desc' },
      });
    }

    if (!installation) {
      return {
        url: this.githubApp.getInstallUrl(teamId),
        mode: 'install',
        connected: false,
        accountLogin: null,
        accountType: null,
      };
    }

    return {
      url: `https://github.com/apps/${appSlug}/installations/${installation.installationId}`,
      mode: 'manage',
      connected: true,
      installationId: installation.installationId,
      accountLogin: installation.accountLogin,
      accountType: installation.accountType,
    };
  }

  @Get('github-app/repos/detect')
  async detectGithubAppProject(
    @Query('teamId') teamId: string,
    @Query('repo') repo: string,
    @Query('branch') branch?: string,
    @Query('rootDir') rootDir?: string,
    @Req() req?: express.Request,
  ) {
    if (!teamId || !repo) throw new BadRequestException('teamId and repo are required.');
    const userId = (req as any).user.id as string;

    await this.rbac.verifyTeamRole(userId, teamId, 'VIEWER');

    const cleanRepoName = repo
      .replace(/https?:\/\/github\.com\//i, '')
      .replace(/\.git$/i, '')
      .replace(/^\/+|\/+$/g, '')
      .trim();

    const teamInstalls = await this.prisma.githubInstallation.findMany({
      where: { teamId },
    });

    if (teamInstalls.length === 0) {
      throw new BadRequestException('GitHub App is not connected to this team.');
    }

    let matchedInst = null;
    const owner = cleanRepoName.split('/')[0]?.toLowerCase();
    if (owner) {
      matchedInst = teamInstalls.find(
        (i) => i.accountLogin.toLowerCase() === owner,
      );
    }
    if (!matchedInst && teamInstalls.length > 0) {
      matchedInst = teamInstalls[0];
    }

    if (!matchedInst) {
      throw new BadRequestException('No suitable GitHub installation found for this team.');
    }

    const installationId = matchedInst.installationId;
    const accountLogin = matchedInst.accountLogin;

    const cleanRootDir = rootDir ? rootDir.replace(/^\/|\/$/g, '') : '';
    const files = await this.githubApp.fetchRepoContents(installationId, repo, cleanRootDir, branch);

    if (!files || files.length === 0) {
      // Distinguish empty dir vs access/not-found by probing the repo root
      const rootProbe = cleanRootDir
        ? await this.githubApp.fetchRepoContents(installationId, repo, '', branch)
        : files;
      if (!rootProbe || rootProbe.length === 0) {
        throw new NotFoundException(
          `Repository "${repo}" was not found or the GitHub App (@${accountLogin}) linked to this team does not have access. ` +
          `Install the app on the account/organization that owns this repo and grant repository access.`,
        );
      }
      // Root exists but rootDir is empty / wrong — continue with empty files for STATIC fallback
    }

    const hasFile = (name: string) => files.some((f: any) => f.name.toLowerCase() === name.toLowerCase());

    if (hasFile('package.json')) {
      const pkgFile = files.find((f: any) => f.name.toLowerCase() === 'package.json');
      let scripts: any = {};
      let dependencies: any = {};
      let devDependencies: any = {};
      let packageManager: string | null = null;

      if (pkgFile && pkgFile.download_url) {
        const pkgContent = await this.githubApp.fetchFileContent(installationId, pkgFile.download_url);
        if (pkgContent) {
          try {
            const pkgJson = JSON.parse(pkgContent);
            scripts = pkgJson.scripts || {};
            dependencies = pkgJson.dependencies || {};
            devDependencies = pkgJson.devDependencies || {};
            packageManager = typeof pkgJson.packageManager === 'string' ? pkgJson.packageManager : null;
          } catch (e) {}
        }
      }

      const isDep = (name: string) => !!dependencies[name] || !!devDependencies[name];
      const hasPnpm = hasFile('pnpm-lock.yaml') || (packageManager || '').startsWith('pnpm');
      const hasYarn = hasFile('yarn.lock') || (packageManager || '').startsWith('yarn');
      const hasBun = hasFile('bun.lockb') || hasFile('bun.lock') || (packageManager || '').startsWith('bun');

      const installCommand = hasPnpm
        ? 'pnpm install'
        : hasYarn
          ? 'yarn install'
          : hasBun
            ? 'bun install'
            : 'npm install';

      const pkgBuild = hasPnpm ? 'pnpm build' : hasYarn ? 'yarn build' : hasBun ? 'bun run build' : 'npm run build';
      const pkgStart = hasPnpm ? 'pnpm start' : hasYarn ? 'yarn start' : hasBun ? 'bun start' : 'npm run start';
      const pkgDev = hasPnpm ? 'pnpm run dev' : hasYarn ? 'yarn dev' : hasBun ? 'bun run dev' : 'npm run dev';

      let buildCommand = scripts.build ? pkgBuild : '';
      let startCommand = pkgStart;
      let port = 3000;

      if (isDep('next')) {
        buildCommand = scripts.build ? pkgBuild : 'npm run build';
        startCommand = scripts.start ? pkgStart : 'npx next start';
        port = 3000;
      } else if (isDep('nuxt')) {
        buildCommand = scripts.build ? pkgBuild : 'npm run build';
        startCommand = scripts.start ? pkgStart : 'npx nuxt start';
        port = 3000;
      } else if (isDep('astro')) {
        buildCommand = scripts.build ? pkgBuild : 'npm run build';
        startCommand = scripts.start ? pkgStart : 'npx astro preview --host 0.0.0.0';
        port = 4321;
      } else if (isDep('@remix-run/dev') || isDep('@remix-run/node')) {
        buildCommand = scripts.build ? pkgBuild : 'npm run build';
        startCommand = scripts.start ? pkgStart : 'npx remix-serve build/index.js';
        port = 3000;
      } else if (isDep('vite')) {
        buildCommand = scripts.build ? pkgBuild : '';
        if (scripts.dev) {
          startCommand = pkgDev;
        } else if (scripts.start) {
          startCommand = pkgStart;
        } else {
          startCommand = 'npx vite --host 0.0.0.0';
        }
        port = 5173;
      } else if (isDep('react-scripts')) {
        buildCommand = pkgBuild;
        startCommand = pkgStart;
        port = 3000;
      } else if (isDep('@angular/core')) {
        buildCommand = pkgBuild;
        startCommand = scripts.start ? pkgStart : 'npx ng serve --host 0.0.0.0';
        port = 4200;
      } else if (isDep('@nestjs/core')) {
        buildCommand = pkgBuild;
        if (scripts['start:prod']) {
          startCommand = hasPnpm ? 'pnpm run start:prod' : hasYarn ? 'yarn start:prod' : 'npm run start:prod';
        } else if (scripts.start) {
          startCommand = pkgStart;
        } else {
          startCommand = 'node dist/main.js';
        }
        port = 3000;
      } else {
        if (!scripts.build) {
          buildCommand = '';
        }
        if (scripts.start) {
          startCommand = pkgStart;
        } else if (scripts.dev) {
          startCommand = pkgDev;
        } else if (scripts.serve) {
          startCommand = hasPnpm ? 'pnpm run serve' : hasYarn ? 'yarn serve' : 'npm run serve';
        } else {
          startCommand = 'node index.js';
        }
      }

      return {
        type: 'NODE',
        port,
        buildCommand,
        startCommand,
        installCommand,
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

    return {
      type: 'STATIC',
      port: 80,
      buildCommand: '',
      startCommand: '',
      installCommand: '',
    };
  }

  // --- GITHUB REPOS (LEGACY — OAuth access token, fallback only) ---

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

  @Get('admin/system/storage-analyzer')
  async adminGetSystemStorageAnalyzer(@Query('adminUserId') adminUserId: string) {
    await this.verifyAdmin(adminUserId);

    const { execSync } = require('child_process');
    const path = require('path');
    const fs = require('fs');

    let dockerDf = 'Docker not active or command not found.';
    try {
      dockerDf = execSync('docker system df', { timeout: 4000, encoding: 'utf8' });
    } catch (e) {
      try {
        dockerDf = execSync('docker df', { timeout: 4000, encoding: 'utf8' });
      } catch (err) {}
    }

    let topDirs = [];
    const dirsToCheck = [
      '/var/lib/docker',
      '/var/log',
      '/root',
      '/home',
      '/usr',
      '/var/lib/kh-cloud',
    ];

    for (const dir of dirsToCheck) {
      try {
        if (fs.existsSync(dir)) {
          const sizeStr = execSync(`du -sh ${dir} 2>/dev/null`, { timeout: 3000, encoding: 'utf8' });
          if (sizeStr) {
            const parts = sizeStr.trim().split(/\s+/);
            topDirs.push({ path: dir, size: parts[0] });
          }
        }
      } catch (e) {}
    }

    // Also run du -sh on root / if possible but limit to depth 1
    let rootDirsRaw = '';
    try {
      rootDirsRaw = execSync('du -sh /* 2>/dev/null | sort -hr | head -n 10', { timeout: 5000, encoding: 'utf8' });
    } catch (e) {}

    const parsedRootDirs = [];
    if (rootDirsRaw) {
      const lines = rootDirsRaw.trim().split('\n');
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 2) {
          parsedRootDirs.push({ path: parts[1], size: parts[0] });
        }
      }
    }

    return {
      dockerDf,
      topDirs: topDirs.length > 0 ? topDirs : parsedRootDirs,
      rawRootDirs: rootDirsRaw,
    };
  }

  @Post('admin/system/prune')
  async adminPruneSystem(
    @Query('adminUserId') adminUserId: string,
    @Query('mode') mode: string = 'standard',
  ) {
    await this.verifyAdmin(adminUserId);

    const { execSync } = require('child_process');

    let output = '';
    const results: { label: string; reclaimed: string; success: boolean }[] = [];

    // 1. Docker system prune (dangling images, stopped containers, unused networks, build cache)
    try {
      const pruneSystem = execSync('docker system prune -f 2>&1', { timeout: 60000, encoding: 'utf8' });
      output += `--- DOCKER SYSTEM PRUNE ---\n${pruneSystem}\n`;
      const match = pruneSystem.match(/Total reclaimed space:\s*([\d.]+\w+)/i);
      results.push({ label: 'System Prune (dangling images + stopped containers)', reclaimed: match ? match[1] : 'unknown', success: true });
    } catch (e: any) {
      output += `--- DOCKER SYSTEM PRUNE ERROR ---\n${e.message}\n`;
      results.push({ label: 'System Prune', reclaimed: '0B', success: false });
    }

    // 2. Docker builder prune (build cache)
    try {
      const pruneBuilder = execSync('docker builder prune -af 2>&1', { timeout: 60000, encoding: 'utf8' });
      output += `--- DOCKER BUILDER PRUNE ---\n${pruneBuilder}\n`;
      const match = pruneBuilder.match(/Total reclaimed space:\s*([\d.]+\w+)/i);
      results.push({ label: 'Builder Cache Prune', reclaimed: match ? match[1] : 'unknown', success: true });
    } catch (e: any) {
      output += `--- DOCKER BUILDER PRUNE ERROR ---\n${e.message}\n`;
      results.push({ label: 'Builder Cache Prune', reclaimed: '0B', success: false });
    }

    // 3. Prune ALL unused images (not just dangling) — biggest space saver
    if (mode === 'deep') {
      try {
        const pruneImages = execSync('docker image prune -a -f 2>&1', { timeout: 60000, encoding: 'utf8' });
        output += `--- DOCKER IMAGE PRUNE (ALL UNUSED) ---\n${pruneImages}\n`;
        const match = pruneImages.match(/Total reclaimed space:\s*([\d.]+\w+)/i);
        results.push({ label: 'All Unused Images Pruned', reclaimed: match ? match[1] : 'unknown', success: true });
      } catch (e: any) {
        output += `--- DOCKER IMAGE PRUNE ERROR ---\n${e.message}\n`;
        results.push({ label: 'All Unused Images Prune', reclaimed: '0B', success: false });
      }
    }

    return {
      success: true,
      output,
      results,
    };
  }

  // --- TABLE EDITOR ENDPOINTS ---

  @Get('databases/:id/schema/:table')
  async getTableSchema(
    @Param('id') id: string,
    @Param('table') table: string,
    @Query('teamId') teamId: string,
    @Req() req: express.Request,
  ) {
    const userId = (req as any).user.id as string;

    await this.rbac.verifyDatabaseAccess(userId, id, 'VIEWER');
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
    @Req() req: express.Request,
  ) {
    const userId = (req as any).user.id as string;

    await this.rbac.verifyDatabaseAccess(userId, id, 'VIEWER');
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
    @Body() body: { teamId: string; data: Record<string, any> },
    @Req() req: express.Request,
  ) {
    const userId = (req as any).user.id as string;

    await this.rbac.verifyDatabaseAccess(userId, id, 'DEVELOPER');
    return this.databases.insertRow(id, body.teamId, table, body.data);
  }

  @Put('databases/:id/rows/:table/:pk')
  async updateRow(
    @Param('id') id: string,
    @Param('table') table: string,
    @Param('pk') pk: string,
    @Body() body: { teamId: string; pkValue: any; data: Record<string, any> },
    @Req() req: express.Request,
  ) {
    const userId = (req as any).user.id as string;

    await this.rbac.verifyDatabaseAccess(userId, id, 'DEVELOPER');
    return this.databases.updateRow(id, body.teamId, table, pk, body.pkValue, body.data);
  }

  @Delete('databases/:id/rows/:table/:pk')
  async deleteRow(
    @Param('id') id: string,
    @Param('table') table: string,
    @Param('pk') pk: string,
    @Query('teamId') teamId: string,
    @Query('pkValue') pkValue: string,
    @Req() req: express.Request,
  ) {
    const userId = (req as any).user.id as string;

    await this.rbac.verifyDatabaseAccess(userId, id, 'DEVELOPER');
    return this.databases.deleteRow(id, teamId, table, pk, pkValue);
  }

  @Public()
  @Post('databases/:id/query')
  async runRawQuery(
    @Param('id') id: string,
    @Headers() headers: Record<string, string>,
    @Query('apikey') queryApiKey: string,
    @Body() body: { teamId: string; sql: string },
    @Req() req: express.Request,
  ) {
    const db = await this.prisma.databaseInstance.findUnique({
      where: { id }
    });
    if (!db) throw new NotFoundException('Database not found.');

    let passedKey = queryApiKey || headers['apikey'] || headers['x-api-key'];
    if (!passedKey && headers['authorization']) {
      const parts = headers['authorization'].split(/\s+/);
      if (parts[0]?.toLowerCase() === 'bearer') {
        passedKey = parts[1];
      }
    }

    if (passedKey) {
      const crypto = require('crypto');
      const hashedKey = crypto.createHash('sha256').update(passedKey).digest('hex');
      const keyMatch = await this.prisma.apiKey.findFirst({
        where: { teamId: db.teamId, key: hashedKey }
      });
      if (keyMatch) {
        return this.databases.runQuery(id, db.teamId, body.sql);
      }
    }

    // Otherwise check user session role
    const userId = (req as any).user?.id as string | undefined;
    if (!userId) {
      throw new BadRequestException('API key or user authentication required.');
    }
    await this.rbac.verifyDatabaseAccess(userId, id, 'DEVELOPER');

    return this.databases.runQuery(id, db.teamId, body.sql);
  }

  @Public()
  @Post('databases/:teamIdOrSlug/:dbName/query')
  async runRawQueryBySlug(
    @Param('teamIdOrSlug') teamIdOrSlug: string,
    @Param('dbName') dbName: string,
    @Headers() headers: Record<string, string>,
    @Query('apikey') queryApiKey: string,
    @Body() body: { sql: string },
    @Req() req: express.Request,
  ) {
    const db = await this.prisma.databaseInstance.findFirst({
      where: {
        OR: [
          { teamId: teamIdOrSlug, name: dbName },
          { team: { slug: teamIdOrSlug }, name: dbName },
        ],
      },
    });
    if (!db) throw new NotFoundException('Database not found.');

    let passedKey = queryApiKey || headers['apikey'] || headers['x-api-key'];
    if (!passedKey && headers['authorization']) {
      const parts = headers['authorization'].split(/\s+/);
      if (parts[0]?.toLowerCase() === 'bearer') {
        passedKey = parts[1];
      }
    }

    if (passedKey) {
      const crypto = require('crypto');
      const hashedKey = crypto.createHash('sha256').update(passedKey).digest('hex');
      const keyMatch = await this.prisma.apiKey.findFirst({
        where: { teamId: db.teamId, key: hashedKey },
      });
      if (keyMatch) {
        return this.databases.runQuery(db.id, db.teamId, body.sql);
      }
    }

    // Otherwise check user session role
    const userId = (req as any).user?.id as string | undefined;
    if (!userId) {
      throw new BadRequestException('API key or user authentication required.');
    }
    await this.rbac.verifyDatabaseAccess(userId, db.id, 'DEVELOPER');

    return this.databases.runQuery(db.id, db.teamId, body.sql);
  }

  // --- EDGE FUNCTIONS ENDPOINTS ---

  @Get('edge-functions')
  async getEdgeFunctions(@Query('teamId') teamId: string, @Req() req: express.Request) {
    const userId = (req as any).user.id as string;

    await this.rbac.verifyTeamRole(userId, teamId, 'VIEWER');
    return this.edgeFunctions.getFunctions(teamId);
  }

  @Post('edge-functions')
  async createEdgeFunction(
    @Body() body: { name: string; teamId: string },
    @Req() req: express.Request,
  ) {
    const userId = (req as any).user.id as string;

    await this.rbac.verifyTeamRole(userId, body.teamId, 'DEVELOPER');
    await this.planLimits.enforceEdgeFunctionLimit(body.teamId);
    return this.edgeFunctions.createFunction(body);
  }

  @Put('edge-functions/:id')
  async updateEdgeFunction(
    @Param('id') id: string,
    @Body() body: { teamId: string; code?: string; envVars?: string; name?: string },
    @Req() req: express.Request,
  ) {
    const userId = (req as any).user.id as string;

    await this.rbac.verifyEdgeFunctionAccess(userId, id, 'DEVELOPER');
    return this.edgeFunctions.updateFunction(id, body.teamId, body);
  }

  @Delete('edge-functions/:id')
  async deleteEdgeFunction(
    @Param('id') id: string,
    @Query('teamId') teamId: string,
    @Req() req: express.Request,
  ) {
    const userId = (req as any).user.id as string;

    await this.rbac.verifyEdgeFunctionAccess(userId, id, 'DEVELOPER');
    return this.edgeFunctions.deleteFunction(id, teamId);
  }

  @Public()
  @Post('edge-functions/:id/invoke')
  async invokeEdgeFunction(
    @Param('id') id: string,
    @Headers() headers: Record<string, string>,
    @Query('apikey') queryApiKey: string,
    @Body() body: { teamId: string; method?: string; path?: string; query?: any; body?: any; headers?: any },
    @Req() req: express.Request,
  ) {
    const fn = await this.prisma.edgeFunction.findUnique({
      where: { id }
    });
    if (!fn) throw new NotFoundException('Edge function not found.');

    let passedKey = queryApiKey || headers['apikey'] || headers['x-api-key'];
    if (!passedKey && headers['authorization']) {
      const parts = headers['authorization'].split(/\s+/);
      if (parts[0]?.toLowerCase() === 'bearer') {
        passedKey = parts[1];
      }
    }

    if (passedKey) {
      const crypto = require('crypto');
      const hashedKey = crypto.createHash('sha256').update(passedKey).digest('hex');
      const keyMatch = await this.prisma.apiKey.findFirst({
        where: { teamId: fn.teamId, key: hashedKey }
      });
      if (keyMatch) {
        return this.edgeFunctions.invokeFunction(id, fn.teamId, body);
      }
    }

    // Otherwise check user session
    const userId = (req as any).user?.id as string | undefined;
    if (!userId) {
      throw new BadRequestException('API key or user authentication required.');
    }
    await this.rbac.verifyEdgeFunctionAccess(userId, id, 'VIEWER');

    return this.edgeFunctions.invokeFunction(id, fn.teamId, body);
  }

  @Public()
  @Post('edge-functions/:teamIdOrSlug/:slug/invoke')
  async invokeEdgeFunctionBySlug(
    @Param('teamIdOrSlug') teamIdOrSlug: string,
    @Param('slug') slug: string,
    @Headers() headers: Record<string, string>,
    @Query('apikey') queryApiKey: string,
    @Body() body: { method?: string; path?: string; query?: any; body?: any; headers?: any },
    @Req() req: express.Request,
  ) {
    const fn = await this.prisma.edgeFunction.findFirst({
      where: {
        OR: [
          { teamId: teamIdOrSlug, slug },
          { teamId: teamIdOrSlug, name: slug },
          { team: { slug: teamIdOrSlug }, slug },
          { team: { slug: teamIdOrSlug }, name: slug },
        ],
      },
    });
    if (!fn) throw new NotFoundException('Edge function not found.');

    let passedKey = queryApiKey || headers['apikey'] || headers['x-api-key'];
    if (!passedKey && headers['authorization']) {
      const parts = headers['authorization'].split(/\s+/);
      if (parts[0]?.toLowerCase() === 'bearer') {
        passedKey = parts[1];
      }
    }

    if (passedKey) {
      const crypto = require('crypto');
      const hashedKey = crypto.createHash('sha256').update(passedKey).digest('hex');
      const keyMatch = await this.prisma.apiKey.findFirst({
        where: { teamId: fn.teamId, key: hashedKey },
      });
      if (keyMatch) {
        return this.edgeFunctions.invokeFunction(fn.id, fn.teamId, body);
      }
    }

    // Otherwise check user session
    const userId = (req as any).user?.id as string | undefined;
    if (!userId) {
      throw new BadRequestException('API key or user authentication required.');
    }
    await this.rbac.verifyEdgeFunctionAccess(userId, fn.id, 'VIEWER');

    return this.edgeFunctions.invokeFunction(fn.id, fn.teamId, body);
  }

  // --- MAINTENANCE & SYSTEM HEALTH ENDPOINTS ---

  @Post('admin/maintenance/prune')
  async triggerDockerPrune(
    @Headers('x-admin-key') adminKey?: string,
    @Query('adminKey') queryAdminKey?: string,
  ) {
    const key = adminKey || queryAdminKey;
    const expectedKey = process.env.ADMIN_API_KEY;

    if (expectedKey && key !== expectedKey) {
      throw new BadRequestException('Unauthorized. Invalid admin key.');
    }

    return this.maintenance.runDockerPrune();
  }
}

function pathName(key: string): string {
  const parts = key.split('/');
  return parts[parts.length - 1] || 'file';
}
