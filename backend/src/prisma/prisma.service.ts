import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    const dbUrl = process.env.DATABASE_URL || 'file:prisma/dev.db';
    const adapter = new PrismaBetterSqlite3({
      url: dbUrl,
    });
    super({ adapter });
  }

  async onModuleInit() {
    await this.$connect();
    await this.ensureSchemaSync();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  private async ensureSchemaSync() {
    try {
      // 1. Ensure avatarUrl column exists in GithubInstallation table
      const columns = (await this.$queryRawUnsafe(`PRAGMA table_info("GithubInstallation");`).catch(() => [])) as any[];
      const hasAvatarUrl = Array.isArray(columns) && columns.some((c: any) => c.name === 'avatarUrl');
      if (!hasAvatarUrl) {
        this.logger.log('Auto-migrating SQLite: Adding avatarUrl column to GithubInstallation');
        await this.$executeRawUnsafe(`ALTER TABLE "GithubInstallation" ADD COLUMN "avatarUrl" TEXT;`).catch((e: any) =>
          this.logger.warn(`Could not add avatarUrl column: ${e.message}`),
        );
      }

      // 2. Drop old single-column unique constraint on teamId if present
      await this.$executeRawUnsafe(`DROP INDEX IF EXISTS "GithubInstallation_teamId_key";`).catch(() => null);

      // 3. Ensure composite unique index exists for (teamId, installationId)
      await this.$executeRawUnsafe(
        `CREATE UNIQUE INDEX IF NOT EXISTS "GithubInstallation_teamId_installationId_key" ON "GithubInstallation"("teamId", "installationId");`,
      ).catch(() => null);

      this.logger.log('Database schema self-healing check complete.');
    } catch (err: any) {
      this.logger.warn(`Schema self-healing error: ${err.message}`);
    }
  }
}

