import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { StoragePublicController } from './storage/storage-public.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { StorageService } from './storage/storage.service';
import { ProjectsService } from './projects/projects.service';
import { DatabasesService } from './databases/databases.service';
import { TeamsService } from './teams/teams.service';
import { BillingService } from './billing/billing.service';
import { EdgeFunctionsService } from './edge-functions/edge-functions.service';
import { GithubAppService } from './github-app/github-app.service';
import { DDoSModule } from './guards/ddos.module';

@Module({
  imports: [
    PrismaModule,
    DDoSModule, // 🛡️ Global DDoS protection — registers APP_GUARD across all routes
  ],
  controllers: [AppController, StoragePublicController],
  providers: [
    AppService,
    StorageService,
    ProjectsService,
    DatabasesService,
    TeamsService,
    BillingService,
    EdgeFunctionsService,
    GithubAppService,
  ],
})
export class AppModule {}

