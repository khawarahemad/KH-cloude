import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  Req,
  Headers,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { MailService } from './mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { Public } from '../auth/public.decorator';

@Controller('api/mail')
export class MailController {
  constructor(
    private readonly mailService: MailService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Helper to resolve teamId from either:
   * 1. Explicit query or body teamId (if session user is authorized)
   * 2. Bearer API key (kh_mail_live_...)
   * 3. Session user's default team
   */
  private async resolveTeamId(req: any, authHeader?: string, explicitTeamId?: string): Promise<string> {
    // 1. Check Bearer API key
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.replace('Bearer ', '').trim();
      if (token.startsWith('kh_mail_')) {
        const apiKey = await this.prisma.mailApiKey.findFirst({
          where: { key: token },
        });
        if (!apiKey) {
          throw new UnauthorizedException('Invalid Mail API Key.');
        }
        await this.prisma.mailApiKey.update({
          where: { id: apiKey.id },
          data: { lastUsedAt: new Date() },
        });
        return apiKey.teamId;
      }
    }

    // 2. Check session user
    const user = req.user;
    if (user) {
      if (explicitTeamId) return explicitTeamId;
      // Find team for user
      const membership = await this.prisma.teamMember.findFirst({
        where: { userId: user.id },
      });
      if (membership) return membership.teamId;
    }

    if (explicitTeamId) return explicitTeamId;

    throw new UnauthorizedException('Please authenticate with a session or Bearer Mail API Key.');
  }

  @Get('stats')
  async getStats(@Req() req: any, @Query('teamId') teamId?: string) {
    const resolvedTeamId = await this.resolveTeamId(req, req.headers.authorization, teamId);
    return this.mailService.getStats(resolvedTeamId);
  }

  @Get('domains')
  async getDomains(@Req() req: any, @Query('teamId') teamId?: string) {
    const resolvedTeamId = await this.resolveTeamId(req, req.headers.authorization, teamId);
    return this.mailService.getDomains(resolvedTeamId);
  }

  @Post('domains')
  async addDomain(
    @Req() req: any,
    @Body('domain') domain: string,
    @Body('teamId') teamId?: string,
  ) {
    if (!domain) throw new BadRequestException('Domain name is required.');
    const resolvedTeamId = await this.resolveTeamId(req, req.headers.authorization, teamId);
    return this.mailService.addDomain(resolvedTeamId, domain);
  }

  @Delete('domains/:id')
  async deleteDomain(
    @Req() req: any,
    @Param('id') domainId: string,
    @Query('teamId') teamId?: string,
  ) {
    const resolvedTeamId = await this.resolveTeamId(req, req.headers.authorization, teamId);
    return this.mailService.deleteDomain(resolvedTeamId, domainId);
  }

  @Post('domains/:id/verify')
  async verifyDomain(
    @Req() req: any,
    @Param('id') domainId: string,
    @Query('teamId') teamId?: string,
  ) {
    const resolvedTeamId = await this.resolveTeamId(req, req.headers.authorization, teamId);
    return this.mailService.verifyDomain(resolvedTeamId, domainId);
  }

  @Get('keys')
  async getKeys(@Req() req: any, @Query('teamId') teamId?: string) {
    const resolvedTeamId = await this.resolveTeamId(req, req.headers.authorization, teamId);
    return this.mailService.getApiKeys(resolvedTeamId);
  }

  @Post('keys')
  async createKey(
    @Req() req: any,
    @Body('name') name: string,
    @Body('teamId') teamId?: string,
  ) {
    const resolvedTeamId = await this.resolveTeamId(req, req.headers.authorization, teamId);
    return this.mailService.createApiKey(resolvedTeamId, name);
  }

  @Delete('keys/:id')
  async deleteKey(
    @Req() req: any,
    @Param('id') keyId: string,
    @Query('teamId') teamId?: string,
  ) {
    const resolvedTeamId = await this.resolveTeamId(req, req.headers.authorization, teamId);
    return this.mailService.deleteApiKey(resolvedTeamId, keyId);
  }

  @Public()
  @Get('smtp-config')
  getSmtpConfig() {
    return this.mailService.getSmtpConfig();
  }

  @Get('logs')
  async getLogs(
    @Req() req: any,
    @Query('teamId') teamId?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('search') search?: string,
    @Query('status') status?: string,
  ) {
    const resolvedTeamId = await this.resolveTeamId(req, req.headers.authorization, teamId);
    return this.mailService.getLogs(
      resolvedTeamId,
      page ? parseInt(page, 10) : 1,
      pageSize ? parseInt(pageSize, 10) : 25,
      search || '',
      status || '',
    );
  }

  /**
   * Primary REST API for sending emails (Resend style).
   */
  @Public()
  @Post('send')
  async sendEmail(
    @Req() req: any,
    @Headers('authorization') authHeader: string,
    @Body() body: {
      from: string;
      to: string | string[];
      subject: string;
      html?: string;
      text?: string;
      replyTo?: string;
      headers?: Record<string, string>;
      teamId?: string;
    },
  ) {
    const resolvedTeamId = await this.resolveTeamId(req, authHeader, body.teamId);
    return this.mailService.sendEmail(resolvedTeamId, body);
  }
}

/**
 * Direct Resend-compatible endpoint: POST /api/v1/emails
 */
@Controller('api/v1')
export class ResendCompatibleController {
  constructor(
    private readonly mailService: MailService,
    private readonly prisma: PrismaService,
  ) {}

  @Public()
  @Post('emails')
  async sendEmail(
    @Headers('authorization') authHeader: string,
    @Body() body: {
      from: string;
      to: string | string[];
      subject: string;
      html?: string;
      text?: string;
      reply_to?: string;
      headers?: Record<string, string>;
    },
  ) {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing Bearer API key in Authorization header.');
    }

    const token = authHeader.replace('Bearer ', '').trim();
    const apiKey = await this.prisma.mailApiKey.findFirst({
      where: { key: token },
    });

    if (!apiKey) {
      throw new UnauthorizedException('Invalid Mail API Key.');
    }

    await this.prisma.mailApiKey.update({
      where: { id: apiKey.id },
      data: { lastUsedAt: new Date() },
    });

    const result = await this.mailService.sendEmail(apiKey.teamId, {
      from: body.from,
      to: body.to,
      subject: body.subject,
      html: body.html,
      text: body.text,
      replyTo: body.reply_to,
      headers: body.headers,
    });

    return {
      id: result.id,
      from: result.from,
      to: result.to,
      created_at: result.createdAt,
    };
  }
}
