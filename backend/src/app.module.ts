import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { StorageService } from './storage/storage.service';
import { ProjectsService } from './projects/projects.service';
import { DatabasesService } from './databases/databases.service';
import { TeamsService } from './teams/teams.service';
import { BillingService } from './billing/billing.service';
import { WebhookController } from './webhook.controller';

@Module({
  imports: [PrismaModule],
  controllers: [AppController, WebhookController],
  providers: [
    AppService,
    StorageService,
    ProjectsService,
    DatabasesService,
    TeamsService,
    BillingService,
  ],
})
export class AppModule {}
