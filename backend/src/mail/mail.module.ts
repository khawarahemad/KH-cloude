import { Module } from '@nestjs/common';
import { MailService } from './mail.service';
import { MailController, ResendCompatibleController } from './mail.controller';
import { SmtpServerService } from './smtp-server.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [MailController, ResendCompatibleController],
  providers: [MailService, SmtpServerService],
  exports: [MailService],
})
export class MailModule {}
