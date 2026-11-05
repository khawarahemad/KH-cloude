import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { SMTPServer } from 'smtp-server';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SmtpServerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SmtpServerService.name);
  private server: SMTPServer | null = null;
  private readonly port = parseInt(process.env.SMTP_PORT || '2525', 10);

  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    this.startServer().catch((err) => {
      this.logger.warn(`SMTP server startup notice: ${err.message}`);
    });
  }

  async onModuleDestroy() {
    if (this.server) {
      this.server.close(() => {
        this.logger.log('Embedded SMTP server shut down');
      });
    }
  }

  private async startServer() {
    const self = this;

    this.server = new SMTPServer({
      authOptional: false,
      disabledCommands: ['STARTTLS'], // Simple authentication over TCP
      size: 15 * 1024 * 1024, // 15MB max message size

      // Authenticate via MailApiKey or user credentials
      async onAuth(auth, session, callback) {
        try {
          const keyInput = auth.password || auth.username;
          if (!keyInput) {
            return callback(new Error('Missing credentials'));
          }

          // Check if valid MailApiKey
          const apiKey = await self.prisma.mailApiKey.findFirst({
            where: { key: keyInput },
            include: { team: true },
          });

          if (apiKey) {
            // Update last used time
            await self.prisma.mailApiKey.update({
              where: { id: apiKey.id },
              data: { lastUsedAt: new Date() },
            });
            (session as any).teamId = apiKey.teamId;
            return callback(null, { user: apiKey.name });
          }

          // Check master admin or fallback
          if (
            auth.username === 'khcloud' &&
            auth.password === (process.env.ADMIN_PASSWORD || 'khcloudpassword')
          ) {
            return callback(null, { user: 'admin' });
          }

          return callback(new Error('Invalid Mail API Key or credentials'));
        } catch (err: any) {
          self.logger.error(`SMTP Auth error: ${err.message}`);
          return callback(new Error('Authentication failed'));
        }
      },

      // Validate sender
      async onMailFrom(address, session, callback) {
        return callback(); // Allowed
      },

      // Validate recipient
      async onRcptTo(address, session, callback) {
        return callback(); // Allowed
      },

      // Ingest message stream
      onData(stream, session, callback) {
        const chunks: Buffer[] = [];
        stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        stream.on('end', async () => {
          try {
            const rawMessage = Buffer.concat(chunks).toString('utf-8');
            const from =
              session.envelope.mailFrom && typeof session.envelope.mailFrom === 'object'
                ? (session.envelope.mailFrom as any).address
                : 'unknown';
            const toList = session.envelope.rcptTo?.map((r) => r.address) || [];
            const teamId = (session as any).teamId;

            // Extract subject line from raw headers
            const subjectMatch = rawMessage.match(/^Subject:\s*(.*)$/im);
            const subject = subjectMatch ? subjectMatch[1].trim() : 'No Subject';

            // Extract Message-ID
            const msgIdMatch = rawMessage.match(/^Message-ID:\s*(.*)$/im);
            const messageId = msgIdMatch
              ? msgIdMatch[1].trim()
              : `<${Date.now()}.${Math.random().toString(36).substring(2)}@khcloud.mail>`;

            if (teamId) {
              await self.prisma.mailLog.create({
                data: {
                  teamId,
                  from,
                  to: toList.join(', '),
                  subject,
                  status: 'SENT',
                  messageId,
                  sizeBytes: rawMessage.length,
                },
              });
            }

            self.logger.log(`SMTP message received from ${from} for ${toList.join(', ')}`);
            callback(null);
          } catch (err: any) {
            self.logger.error(`Error processing SMTP message: ${err.message}`);
            callback(err);
          }
        });
      },
    });

    this.server.on('error', (err) => {
      this.logger.error(`SMTP Server Error: ${err.message}`);
    });

    this.server.listen(this.port, '0.0.0.0', () => {
      this.logger.log(`Embedded SMTP Server listening on 0.0.0.0:${this.port}`);
    });
  }
}
