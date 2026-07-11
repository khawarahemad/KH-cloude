import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class BillingService {
  constructor(private prisma: PrismaService) {}

  async getBillingInfo(teamId: string) {
    const subscription = await this.prisma.billingSubscription.findUnique({
      where: { teamId },
    });

    if (!subscription) {
      throw new NotFoundException('Subscription not found.');
    }

    // Dynamic cost estimations based on mock values or usage metrics
    const storageUsage = await this.prisma.bucket.aggregate({
      where: { teamId },
      _sum: { sizeUsed: true },
    });

    const activeProjects = await this.prisma.project.count({
      where: { teamId, status: 'READY' },
    });

    const databasesCount = await this.prisma.databaseInstance.count({
      where: { teamId, status: 'RUNNING' },
    });

    const sizeUsedBytes = Number(storageUsage._sum.sizeUsed || BigInt(0));
    const storageGB = sizeUsedBytes / (1024 * 1024 * 1024);
    const storageCost = storageGB * 0.02; // $0.02 per GB
    const computeCost = activeProjects * 5.0 + databasesCount * 7.0; // $5/project, $7/db
    const projectedCost = computeCost + storageCost;

    // Billing plans definition
    const plans = [
      { id: 'hobby', name: 'Hobby', price: 0, specs: '1 Team member, 3 projects, 5GB storage' },
      { id: 'pro', name: 'Pro', price: 29, specs: 'Unlimited members, 25 projects, 50GB storage' },
      { id: 'enterprise', name: 'Enterprise', price: 250, specs: 'Custom limits, dedicated servers, SLA' },
    ];

    // Invoices list simulation
    const invoices = [
      { id: `inv_${Math.random().toString(36).substring(2, 8)}`, date: 'Jul 01, 2026', amount: '$0.00', status: 'PAID' },
      { id: `inv_${Math.random().toString(36).substring(2, 8)}`, date: 'Jun 01, 2026', amount: '$0.00', status: 'PAID' },
    ];

    return {
      subscription,
      plans,
      invoices,
      usage: {
        activeProjects,
        databasesCount,
        storageGB: storageGB.toFixed(2),
        currentSpend: projectedCost.toFixed(2),
      },
    };
  }

  async updatePlan(teamId: string, planId: string) {
    const subscription = await this.prisma.billingSubscription.findUnique({
      where: { teamId },
    });

    if (!subscription) {
      throw new NotFoundException('Subscription not found.');
    }

    const updated = await this.prisma.billingSubscription.update({
      where: { teamId },
      data: {
        planId,
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // extends 30 days
      },
    });

    await this.prisma.auditLog.create({
      data: {
        teamId,
        action: 'BILLING.UPDATE_PLAN',
        targetType: 'BILLING',
        details: JSON.stringify({ planId }),
      },
    });

    return updated;
  }
}
