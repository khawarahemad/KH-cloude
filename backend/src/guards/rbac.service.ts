import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TeamRole } from '@prisma/client';
import * as express from 'express';

export const ROLE_HIERARCHY: Record<TeamRole, number> = {
  OWNER: 4,
  ADMIN: 3,
  DEVELOPER: 2,
  VIEWER: 1,
};

@Injectable()
export class RbacService {
  constructor(private prisma: PrismaService) {}

  /**
   * Extract authenticated user ID from request headers or query/body fallback
   */
  extractUserId(req?: express.Request, explicitUserId?: string): string | null {
    if (explicitUserId) return explicitUserId;
    if (!req) return null;

    const headerUserId = req.headers?.['x-user-id'] as string;
    if (headerUserId) return headerUserId;

    const authHeader = req.headers?.['authorization'] as string;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7).trim();
      // If token is a UUID or user ID format
      if (token && !token.startsWith('kh_')) {
        return token;
      }
    }

    const queryUserId = req.query?.['userId'] as string;
    if (queryUserId) return queryUserId;

    const bodyUserId = (req.body as any)?.userId;
    if (bodyUserId) return bodyUserId;

    return null;
  }

  /**
   * Ensure requesting user exists in DB and return the user record
   */
  async getAuthenticatedUser(
    req?: express.Request,
    explicitUserId?: string,
  ) {
    const userId = this.extractUserId(req, explicitUserId);
    if (!userId) {
      throw new UnauthorizedException('Authentication required. Missing user identity.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid user session or user not found.');
    }

    return user;
  }

  /**
   * Verify that the user belongs to the specified team and check if their role meets the minimum required role.
   * Platform ADMIN users (user.role === 'ADMIN') automatically bypass team role checks with OWNER privileges.
   */
  async verifyTeamRole(
    userId: string,
    teamId: string,
    minRole: TeamRole = 'VIEWER',
  ) {
    if (!teamId) {
      throw new BadRequestException('teamId is required for this operation.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new UnauthorizedException('User not found.');
    }

    // Platform Super Admin bypass
    if (user.role === 'ADMIN') {
      const team = await this.prisma.team.findUnique({ where: { id: teamId } });
      if (!team) throw new NotFoundException('Team not found.');
      return {
        user,
        team,
        role: 'OWNER' as TeamRole,
        isPlatformAdmin: true,
      };
    }

    const member = await this.prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId, userId } },
      include: { team: true },
    });

    if (!member) {
      throw new ForbiddenException(
        'Access denied. You are not a member of this team workspace.',
      );
    }

    const userRoleWeight = ROLE_HIERARCHY[member.role] || 1;
    const requiredRoleWeight = ROLE_HIERARCHY[minRole] || 1;

    if (userRoleWeight < requiredRoleWeight) {
      throw new ForbiddenException(
        `Insufficient permissions. This action requires ${minRole} role or higher (your role is ${member.role}).`,
      );
    }

    return {
      user,
      team: member.team,
      member,
      role: member.role,
      isPlatformAdmin: false,
    };
  }

  /**
   * Verify project access by finding the project and checking user's role within the project's team.
   */
  async verifyProjectAccess(
    userId: string,
    projectId: string,
    minRole: TeamRole = 'VIEWER',
  ) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { team: true },
    });

    if (!project) {
      throw new NotFoundException('Project not found.');
    }

    const auth = await this.verifyTeamRole(userId, project.teamId, minRole);
    return { ...auth, project };
  }

  /**
   * Verify deployment access via its associated project
   */
  async verifyDeploymentAccess(
    userId: string,
    deploymentId: string,
    minRole: TeamRole = 'VIEWER',
  ) {
    const deployment = await this.prisma.deployment.findUnique({
      where: { id: deploymentId },
      include: { project: { include: { team: true } } },
    });

    if (!deployment) {
      throw new NotFoundException('Deployment not found.');
    }

    const auth = await this.verifyTeamRole(userId, deployment.project.teamId, minRole);
    return { ...auth, deployment, project: deployment.project };
  }

  /**
   * Verify database instance access
   */
  async verifyDatabaseAccess(
    userId: string,
    databaseId: string,
    minRole: TeamRole = 'VIEWER',
  ) {
    const database = await this.prisma.databaseInstance.findUnique({
      where: { id: databaseId },
      include: { team: true },
    });

    if (!database) {
      throw new NotFoundException('Database not found.');
    }

    const auth = await this.verifyTeamRole(userId, database.teamId, minRole);
    return { ...auth, database };
  }

  /**
   * Verify object storage bucket access
   */
  async verifyBucketAccess(
    userId: string,
    bucketId: string,
    minRole: TeamRole = 'VIEWER',
  ) {
    const bucket = await this.prisma.bucket.findUnique({
      where: { id: bucketId },
      include: { team: true },
    });

    if (!bucket) {
      throw new NotFoundException('Bucket not found.');
    }

    const auth = await this.verifyTeamRole(userId, bucket.teamId, minRole);
    return { ...auth, bucket };
  }

  /**
   * Verify edge function access
   */
  async verifyEdgeFunctionAccess(
    userId: string,
    functionId: string,
    minRole: TeamRole = 'VIEWER',
  ) {
    const edgeFunction = await this.prisma.edgeFunction.findUnique({
      where: { id: functionId },
      include: { team: true },
    });

    if (!edgeFunction) {
      throw new NotFoundException('Edge function not found.');
    }

    const auth = await this.verifyTeamRole(userId, edgeFunction.teamId, minRole);
    return { ...auth, edgeFunction };
  }
}
