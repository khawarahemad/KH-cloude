import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TeamRole } from '@prisma/client';

@Injectable()
export class TeamsService {
  constructor(private prisma: PrismaService) {}

  async createTeam(name: string, ownerUserId: string) {
    let slug = name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    if (!slug) slug = 'team';
    
    let existing = await this.prisma.team.findUnique({ where: { slug } });
    while (existing) {
      const suffix = `-${Math.random().toString(36).substring(2, 6)}`;
      const candidateSlug = `${slug.substring(0, 40 - suffix.length)}${suffix}`;
      existing = await this.prisma.team.findUnique({ where: { slug: candidateSlug } });
      if (!existing) {
        slug = candidateSlug;
      }
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
      return existing.map(k => {
        const { key, ...safeKey } = k;
        return safeKey;
      });
    }

    const crypto = require('crypto');
    const anonRaw = 'kh_anon_' + crypto.randomBytes(32).toString('hex');
    const serviceRaw = 'kh_service_' + crypto.randomBytes(32).toString('hex');

    const anonHash = crypto.createHash('sha256').update(anonRaw).digest('hex');
    const serviceHash = crypto.createHash('sha256').update(serviceRaw).digest('hex');

    await Promise.all([
      this.prisma.apiKey.create({
        data: {
          teamId,
          name: 'anon',
          key: anonHash,
          role: 'ANON',
        },
      }),
      this.prisma.apiKey.create({
        data: {
          teamId,
          name: 'service_role',
          key: serviceHash,
          role: 'SERVICE_ROLE',
        },
      }),
    ]);

    // Only return the raw keys once upon creation
    return [
      { name: 'anon', key: anonRaw, role: 'ANON' },
      { name: 'service_role', key: serviceRaw, role: 'SERVICE_ROLE' }
    ];
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
    const members = await this.prisma.teamMember.findMany({
      where: { teamId },
      include: { user: true },
    });
    const { UserDto } = require('../auth/dto/user.dto');
    return members.map((m: any) => ({
      ...m,
      user: m.user ? UserDto.from(m.user) : null,
    }));
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

    const crypto = require('crypto');
    const token = crypto.randomBytes(32).toString('hex');
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
      orderBy: { createdAt: 'desc' },
    });
  }

  async getUserPendingInvites(userEmail: string) {
    if (!userEmail) return [];
    return this.prisma.invite.findMany({
      where: {
        email: userEmail.toLowerCase().trim(),
        status: 'PENDING',
        expiresAt: { gt: new Date() },
      },
      include: {
        team: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async acceptInvite(inviteId: string, userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found.');

    const invite = await this.prisma.invite.findFirst({
      where: {
        id: inviteId,
        status: 'PENDING',
        expiresAt: { gt: new Date() },
      },
      include: { team: true },
    });

    if (!invite) {
      throw new BadRequestException('Invitation is invalid, expired, or already processed.');
    }

    if (user.email.toLowerCase().trim() !== invite.email.toLowerCase().trim()) {
      throw new BadRequestException(`This invitation was sent to ${invite.email}. Your current account email is ${user.email}.`);
    }

    // Upsert or create team member
    const existingMember = await this.prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId: invite.teamId, userId: user.id } },
    });

    if (!existingMember) {
      await this.prisma.teamMember.create({
        data: {
          teamId: invite.teamId,
          userId: user.id,
          role: invite.role,
        },
      });
    }

    // Mark invite as ACCEPTED
    await this.prisma.invite.update({
      where: { id: invite.id },
      data: { status: 'ACCEPTED' },
    });

    // Create Audit Log
    await this.prisma.auditLog.create({
      data: {
        teamId: invite.teamId,
        userId: user.id,
        action: 'TEAM.ACCEPT_INVITE',
        targetType: 'TEAM',
        details: JSON.stringify({ email: user.email, role: invite.role }),
      },
    });

    // Return the updated list of teams for this user
    const userTeams = await this.getTeams(user.id);
    return { success: true, team: invite.team, teams: userTeams };
  }

  async rejectInvite(inviteId: string, userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found.');

    const invite = await this.prisma.invite.findFirst({
      where: {
        id: inviteId,
        status: 'PENDING',
      },
    });

    if (!invite) throw new NotFoundException('Invitation not found.');

    if (user.email.toLowerCase().trim() !== invite.email.toLowerCase().trim()) {
      throw new BadRequestException('Unauthorized to decline this invitation.');
    }

    await this.prisma.invite.update({
      where: { id: invite.id },
      data: { status: 'REJECTED' },
    });

    return { success: true };
  }

  async updateMemberRole(teamId: string, targetUserId: string, newRole: TeamRole, actorUserId: string) {
    const actorMember = await this.prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId, userId: actorUserId } },
    });
    if (!actorMember || (actorMember.role !== 'OWNER' && actorMember.role !== 'ADMIN')) {
      throw new BadRequestException('Only Team Owners or Admins can update member roles.');
    }

    const targetMember = await this.prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId, userId: targetUserId } },
    });
    if (!targetMember) throw new NotFoundException('Member not found in this team.');

    if (targetMember.role === 'OWNER' && newRole !== 'OWNER' && actorMember.role !== 'OWNER') {
      throw new BadRequestException('Only the team Owner can change Owner permissions.');
    }

    const updated = await this.prisma.teamMember.update({
      where: { teamId_userId: { teamId, userId: targetUserId } },
      data: { role: newRole },
      include: { user: true },
    });

    await this.prisma.auditLog.create({
      data: {
        teamId,
        userId: actorUserId,
        action: 'TEAM.UPDATE_ROLE',
        targetType: 'TEAM_MEMBER',
        targetId: targetUserId,
        details: JSON.stringify({ oldRole: targetMember.role, newRole }),
      },
    });

    return updated;
  }

  async removeMember(teamId: string, targetUserId: string, actorUserId: string) {
    const actorMember = await this.prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId, userId: actorUserId } },
    });
    if (!actorMember) throw new BadRequestException('Unauthorized.');

    const isSelf = targetUserId === actorUserId;

    if (!isSelf && actorMember.role !== 'OWNER' && actorMember.role !== 'ADMIN') {
      throw new BadRequestException('Only Team Owners or Admins can remove team members.');
    }

    const targetMember = await this.prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId, userId: targetUserId } },
    });
    if (!targetMember) throw new NotFoundException('Member not found in team.');

    if (targetMember.role === 'OWNER') {
      const ownerCount = await this.prisma.teamMember.count({
        where: { teamId, role: 'OWNER' },
      });
      if (ownerCount <= 1) {
        throw new BadRequestException('Cannot remove or leave as the sole Team Owner. Transfer ownership first or delete the team.');
      }
    }

    await this.prisma.teamMember.delete({
      where: { teamId_userId: { teamId, userId: targetUserId } },
    });

    await this.prisma.auditLog.create({
      data: {
        teamId,
        userId: actorUserId,
        action: isSelf ? 'TEAM.LEAVE' : 'TEAM.REMOVE_MEMBER',
        targetType: 'TEAM_MEMBER',
        targetId: targetUserId,
      },
    });

    return { success: true };
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
