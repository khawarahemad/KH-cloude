import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TeamRole } from '@prisma/client';

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
   * Verify that the authenticated user belongs to the specified team and holds
   * at least the minimum required role.
   *
   * Platform ADMIN users automatically receive OWNER-level access on all teams.
   *
   * @param userId  - Comes from req.user.id (set by JwtAuthGuard) or req.user object.
   * @param teamId  - Team being accessed.
   * @param minRole - Minimum role required for the operation.
   */
  async verifyTeamRole(
    userId: string | { id?: string },
    teamId: string,
    minRole: TeamRole = 'VIEWER',
  ) {
    const actualUserId = typeof userId === 'object' && userId !== null ? userId.id : userId;
    if (!actualUserId || typeof actualUserId !== 'string') {
      throw new ForbiddenException('Authenticated user not found.');
    }

    if (!teamId) {
      throw new BadRequestException('teamId is required for this operation.');
    }

    const user = await this.prisma.user.findUnique({ where: { id: actualUserId } });
    if (!user) {
      throw new ForbiddenException('Authenticated user not found.');
    }

    // Platform Super Admin bypass — full OWNER access on all teams
    if (user.role === 'ADMIN') {
      const team = await this.prisma.team.findUnique({ where: { id: teamId } });
      if (!team) throw new NotFoundException('Team not found.');
      return { user, team, role: 'OWNER' as TeamRole, isPlatformAdmin: true };
    }

    const member = await this.prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId, userId: actualUserId } },
      include: { team: true },
    });

    if (!member) {
      throw new ForbiddenException(
        'Access denied. You are not a member of this team workspace.',
      );
    }

    const userWeight = ROLE_HIERARCHY[member.role] ?? 1;
    const requiredWeight = ROLE_HIERARCHY[minRole] ?? 1;

    if (userWeight < requiredWeight) {
      throw new ForbiddenException(
        `Insufficient permissions. This action requires ${minRole} role or higher (your role: ${member.role}).`,
      );
    }

    return { user, team: member.team, member, role: member.role, isPlatformAdmin: false };
  }

  /** Verify project access via the project's owning team. */
  async verifyProjectAccess(userId: string | { id?: string }, projectId: string, minRole: TeamRole = 'VIEWER') {
    const actualUserId = typeof userId === 'object' && userId !== null ? userId.id : userId;
    if (!actualUserId || typeof actualUserId !== 'string') {
      throw new ForbiddenException('Authenticated user not found.');
    }
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { team: true },
    });
    if (!project) throw new NotFoundException('Project not found.');
    const auth = await this.verifyTeamRole(actualUserId, project.teamId, minRole);
    return { ...auth, project };
  }

  /** Verify deployment access via its parent project's team. */
  async verifyDeploymentAccess(userId: string | { id?: string }, deploymentId: string, minRole: TeamRole = 'VIEWER') {
    const actualUserId = typeof userId === 'object' && userId !== null ? userId.id : userId;
    if (!actualUserId || typeof actualUserId !== 'string') {
      throw new ForbiddenException('Authenticated user not found.');
    }
    const deployment = await this.prisma.deployment.findUnique({
      where: { id: deploymentId },
      include: { project: { include: { team: true } } },
    });
    if (!deployment) throw new NotFoundException('Deployment not found.');
    const auth = await this.verifyTeamRole(actualUserId, deployment.project.teamId, minRole);
    return { ...auth, deployment, project: deployment.project };
  }

  /** Verify database instance access. */
  async verifyDatabaseAccess(userId: string | { id?: string }, databaseId: string, minRole: TeamRole = 'VIEWER') {
    const actualUserId = typeof userId === 'object' && userId !== null ? userId.id : userId;
    if (!actualUserId || typeof actualUserId !== 'string') {
      throw new ForbiddenException('Authenticated user not found.');
    }
    const database = await this.prisma.databaseInstance.findUnique({
      where: { id: databaseId },
      include: { team: true },
    });
    if (!database) throw new NotFoundException('Database not found.');
    const auth = await this.verifyTeamRole(actualUserId, database.teamId, minRole);
    return { ...auth, database };
  }

  /** Verify object storage bucket access. */
  async verifyBucketAccess(userId: string | { id?: string }, bucketId: string, minRole: TeamRole = 'VIEWER') {
    const actualUserId = typeof userId === 'object' && userId !== null ? userId.id : userId;
    if (!actualUserId || typeof actualUserId !== 'string') {
      throw new ForbiddenException('Authenticated user not found.');
    }
    const bucket = await this.prisma.bucket.findUnique({
      where: { id: bucketId },
      include: { team: true },
    });
    if (!bucket) throw new NotFoundException('Bucket not found.');
    const auth = await this.verifyTeamRole(actualUserId, bucket.teamId, minRole);
    return { ...auth, bucket };
  }

  /** Verify edge function access. */
  async verifyEdgeFunctionAccess(userId: string | { id?: string }, functionId: string, minRole: TeamRole = 'VIEWER') {
    const actualUserId = typeof userId === 'object' && userId !== null ? userId.id : userId;
    if (!actualUserId || typeof actualUserId !== 'string') {
      throw new ForbiddenException('Authenticated user not found.');
    }
    const fn = await this.prisma.edgeFunction.findUnique({
      where: { id: functionId },
      include: { team: true },
    });
    if (!fn) throw new NotFoundException('Edge function not found.');
    const auth = await this.verifyTeamRole(actualUserId, fn.teamId, minRole);
    return { ...auth, edgeFunction: fn };
  }
}
