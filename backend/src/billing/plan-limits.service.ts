import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Plan limits enforced per team.
 *
 * hobby     : 1 project, 1 database, 1 edge function, NO storage
 * pro       : 10 projects, 5 databases, 10 edge functions, 50 GB storage
 * enterprise: unlimited everything
 */
export const PLAN_LIMITS: Record<
  string,
  {
    maxProjects: number;
    maxDatabases: number;
    maxEdgeFunctions: number;
    storageAllowed: boolean;
    maxStorageGB: number;
  }
> = {
  hobby: {
    maxProjects: 1,
    maxDatabases: 1,
    maxEdgeFunctions: 1,
    storageAllowed: false,
    maxStorageGB: 0,
  },
  pro: {
    maxProjects: 10,
    maxDatabases: 5,
    maxEdgeFunctions: 10,
    storageAllowed: true,
    maxStorageGB: 10,
  },
  enterprise: {
    maxProjects: Infinity,
    maxDatabases: Infinity,
    maxEdgeFunctions: Infinity,
    storageAllowed: true,
    maxStorageGB: Infinity,
  },
};

@Injectable()
export class PlanLimitsService {
  constructor(private prisma: PrismaService) {}

  /** Returns the current planId for the team (defaults to 'hobby'). */
  async getTeamPlan(teamId: string): Promise<string> {
    const sub = await this.prisma.billingSubscription.findUnique({
      where: { teamId },
      select: { planId: true },
    });
    return sub?.planId || 'hobby';
  }

  /** Returns the limit config for the team. */
  async getLimits(teamId: string) {
    const plan = await this.getTeamPlan(teamId);
    return { plan, limits: PLAN_LIMITS[plan] ?? PLAN_LIMITS.hobby };
  }

  private throwPaymentRequired(message: string) {
    throw new HttpException(message, HttpStatus.PAYMENT_REQUIRED);
  }

  /**
   * Throw Payment Required if the team has reached the project limit.
   */
  async enforceProjectLimit(teamId: string): Promise<void> {
    const { plan, limits } = await this.getLimits(teamId);
    if (limits.maxProjects === Infinity) return;

    const count = await this.prisma.project.count({ where: { teamId } });
    if (count >= limits.maxProjects) {
      this.throwPaymentRequired(
        `Your ${plan} plan allows a maximum of ${limits.maxProjects} project(s). ` +
          `You currently have ${count}. Upgrade to Pro or Enterprise to create more.`,
      );
    }
  }

  /**
   * Throw Payment Required if the team has reached the database limit.
   */
  async enforceDatabaseLimit(teamId: string): Promise<void> {
    const { plan, limits } = await this.getLimits(teamId);
    if (limits.maxDatabases === Infinity) return;

    const count = await this.prisma.databaseInstance.count({ where: { teamId } });
    if (count >= limits.maxDatabases) {
      this.throwPaymentRequired(
        `Your ${plan} plan allows a maximum of ${limits.maxDatabases} database(s). ` +
          `You currently have ${count}. Upgrade to Pro or Enterprise to create more.`,
      );
    }
  }

  /**
   * Throw Payment Required if the team's plan does not allow storage access.
   */
  async enforceStorageAccess(teamId: string): Promise<void> {
    const { plan, limits } = await this.getLimits(teamId);
    if (!limits.storageAllowed) {
      this.throwPaymentRequired(
        `Storage is not available on the ${plan} plan. ` +
          `Upgrade to Pro or Enterprise to access object storage.`,
      );
    }
  }

  /**
   * Throw Payment Required if the team has reached the edge function limit.
   */
  async enforceEdgeFunctionLimit(teamId: string): Promise<void> {
    const { plan, limits } = await this.getLimits(teamId);
    if (limits.maxEdgeFunctions === Infinity) return;

    const count = await this.prisma.edgeFunction.count({ where: { teamId } });
    if (count >= limits.maxEdgeFunctions) {
      this.throwPaymentRequired(
        `Your ${plan} plan allows a maximum of ${limits.maxEdgeFunctions} edge function(s). ` +
          `You currently have ${count}. Upgrade to Pro or Enterprise to create more.`,
      );
    }
  }
}
