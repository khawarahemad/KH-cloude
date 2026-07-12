import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TeamRole } from '@prisma/client';

@Injectable()
export class TeamsService {
  constructor(private prisma: PrismaService) {}

  async createTeam(name: string, ownerUserId: string) {
    const slug = name.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    
    // Check slug uniqueness
    const existing = await this.prisma.team.findUnique({ where: { slug } });
    if (existing) {
      throw new BadRequestException('A team with this slug/name already exists.');
    }

    const team = await this.prisma.team.create({
      data: {
        name,
        slug,
      },
    });

    // Add owner as member
    await this.prisma.teamMember.create({
      data: {
        teamId: team.id,
        userId: ownerUserId,
        role: 'OWNER',
      },
    });

    // Generate default api keys
    const crypto = require('crypto');
    await this.prisma.apiKey.create({
      data: {
        teamId: team.id,
        name: 'anon',
        key: 'kh_anon_' + crypto.randomBytes(32).toString('hex'),
        role: 'ANON',
      },
    });
    await this.prisma.apiKey.create({
      data: {
        teamId: team.id,
        name: 'service_role',
        key: 'kh_service_' + crypto.randomBytes(32).toString('hex'),
        role: 'SERVICE_ROLE',
      },
    });

    // Generate hobby subscription by default
    await this.prisma.billingSubscription.create({
      data: {
        teamId: team.id,
        stripeCustomerId: `cus_${Math.random().toString(36).substring(2, 10)}`,
        planId: 'hobby',
        status: 'active',
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    await this.prisma.auditLog.create({
      data: {
        teamId: team.id,
        userId: ownerUserId,
        action: 'TEAM.CREATE',
        targetType: 'TEAM',
        targetId: team.id,
      },
    });

    return team;
  }

  async getOrCreateApiKeys(teamId: string) {
    const existing = await this.prisma.apiKey.findMany({
      where: { teamId },
    });

    if (existing.length > 0) {
      return existing;
    }

    const crypto = require('crypto');
    const anonKey = 'kh_anon_' + crypto.randomBytes(32).toString('hex');
    const serviceKey = 'kh_service_' + crypto.randomBytes(32).toString('hex');

    const created = await Promise.all([
      this.prisma.apiKey.create({
        data: {
          teamId,
          name: 'anon',
          key: anonKey,
          role: 'ANON',
        },
      }),
      this.prisma.apiKey.create({
        data: {
          teamId,
          name: 'service_role',
          key: serviceKey,
          role: 'SERVICE_ROLE',
        },
      }),
    ]);

    return created;
  }

  async getTeams(userId: string) {
    return this.prisma.team.findMany({
      where: {
        members: {
          some: { userId },
        },
      },
      include: {
        members: {
          include: { user: true },
        },
      },
    });
  }

  async getMembers(teamId: string) {
    return this.prisma.teamMember.findMany({
      where: { teamId },
      include: { user: true },
    });
  }

  async inviteMember(teamId: string, email: string, role: TeamRole, inviterUserId: string) {
    // Check if user is already a member
    const existingUser = await this.prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      const isMember = await this.prisma.teamMember.findUnique({
        where: { teamId_userId: { teamId, userId: existingUser.id } },
      });
      if (isMember) {
        throw new BadRequestException('User is already a member of this team.');
      }
    }

    const token = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    const invite = await this.prisma.invite.create({
      data: {
        teamId,
        email,
        role,
        token,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      },
    });

    await this.prisma.auditLog.create({
      data: {
        teamId,
        userId: inviterUserId,
        action: 'TEAM.INVITE_MEMBER',
        targetType: 'TEAM',
        details: JSON.stringify({ email, role }),
      },
    });

    return invite;
  }

  async getInvites(teamId: string) {
    return this.prisma.invite.findMany({
      where: { teamId, status: 'PENDING' },
    });
  }

  async deleteInvite(id: string, teamId: string, userId: string) {
    const invite = await this.prisma.invite.findFirst({
      where: { id, teamId },
    });
    if (!invite) throw new NotFoundException('Invitation not found.');

    await this.prisma.invite.update({
      where: { id },
      data: { status: 'REVOKED' },
    });

    await this.prisma.auditLog.create({
      data: {
        teamId,
        userId,
        action: 'TEAM.REVOKE_INVITE',
        targetType: 'TEAM',
        details: JSON.stringify({ email: invite.email }),
      },
    });

    return { success: true };
  }

  async getAuditLogs(teamId: string) {
    return this.prisma.auditLog.findMany({
      where: { teamId },
      include: { user: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }
}
