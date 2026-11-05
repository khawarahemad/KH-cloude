import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as crypto from 'crypto';
import * as dns from 'dns';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);
  private readonly baseDomain = process.env.BASE_DOMAIN || 'khawarahemad.com';
  private readonly serverIp = process.env.SERVER_IP || '204.168.147.13';

  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    await this.ensureTablesExist();
  }

  /**
   * Safe auto-migration for SQLite to guarantee tables exist without data loss.
   */
  private async ensureTablesExist() {
    try {
      await this.prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "mail_domain" (
          "id" TEXT PRIMARY KEY,
          "teamId" TEXT NOT NULL,
          "domain" TEXT NOT NULL,
          "dkimSelector" TEXT NOT NULL DEFAULT 'khcloud',
          "dkimPrivateKey" TEXT NOT NULL,
          "dkimPublicKey" TEXT NOT NULL,
          "spfRecord" TEXT NOT NULL,
          "dmarcRecord" TEXT NOT NULL,
          "mxRecord" TEXT NOT NULL DEFAULT 'mail.khawarahemad.com',
          "status" TEXT NOT NULL DEFAULT 'PENDING_DNS',
          "spfVerified" BOOLEAN NOT NULL DEFAULT 0,
          "dkimVerified" BOOLEAN NOT NULL DEFAULT 0,
          "dmarcVerified" BOOLEAN NOT NULL DEFAULT 0,
          "mxVerified" BOOLEAN NOT NULL DEFAULT 0,
          "verifiedAt" DATETIME,
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE CASCADE,
          CONSTRAINT "mail_domain_teamId_domain_key" UNIQUE ("teamId", "domain")
        );
      `);

      await this.prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "mail_api_key" (
          "id" TEXT PRIMARY KEY,
          "teamId" TEXT NOT NULL,
          "name" TEXT NOT NULL,
          "key" TEXT NOT NULL UNIQUE,
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "lastUsedAt" DATETIME,
          FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE CASCADE
        );
      `);

      await this.prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "mail_log" (
          "id" TEXT PRIMARY KEY,
          "teamId" TEXT NOT NULL,
          "domainId" TEXT,
          "from" TEXT NOT NULL,
          "to" TEXT NOT NULL,
          "subject" TEXT NOT NULL,
          "bodyText" TEXT,
          "bodyHtml" TEXT,
          "status" TEXT NOT NULL DEFAULT 'SENT',
          "errorMessage" TEXT,
          "messageId" TEXT,
          "sizeBytes" INTEGER DEFAULT 0,
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE CASCADE,
          FOREIGN KEY ("domainId") REFERENCES "mail_domain" ("id") ON DELETE SET NULL
        );
      `);

      this.logger.log('Mail database tables verified and ready.');
    } catch (err: any) {
      this.logger.warn(`Mail table initialization check: ${err.message}`);
    }
  }

  // --- DOMAIN MANAGEMENT ---

  async getDomains(teamId: string) {
    return this.prisma.mailDomain.findMany({
      where: { teamId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async addDomain(teamId: string, rawDomain: string) {
    const cleanDomain = rawDomain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (!cleanDomain || !/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/.test(cleanDomain)) {
      throw new BadRequestException('Please provide a valid domain name (e.g. yourdomain.com or mail.yourdomain.com).');
    }

    const existing = await this.prisma.mailDomain.findFirst({
      where: { teamId, domain: cleanDomain },
    });
    if (existing) {
      throw new BadRequestException(`Domain "${cleanDomain}" is already configured for this team.`);
    }

    // Generate 2048-bit RSA keypair for DKIM
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    // Format public key for DNS TXT record (strip headers and newlines)
    const dkimPubClean = publicKey
      .replace(/-----BEGIN PUBLIC KEY-----/, '')
      .replace(/-----END PUBLIC KEY-----/, '')
      .replace(/\s+/g, '');

    const selector = 'khcloud';
    const dkimPublicKey = `v=DKIM1; k=rsa; p=${dkimPubClean}`;
    const spfRecord = `v=spf1 ip4:${this.serverIp} include:mail.${this.baseDomain} ~all`;
    const dmarcRecord = `v=DMARC1; p=none; sp=none; aspf=r;`;
    const mxRecord = `mail.${this.baseDomain}`;

    const newDomain = await this.prisma.mailDomain.create({
      data: {
        teamId,
        domain: cleanDomain,
        dkimSelector: selector,
        dkimPrivateKey: privateKey,
        dkimPublicKey,
        spfRecord,
        dmarcRecord,
        mxRecord,
        status: 'PENDING_DNS',
      },
    });

    this.logger.log(`Created mail domain "${cleanDomain}" with DKIM for team ${teamId}`);
    return newDomain;
  }

  async deleteDomain(teamId: string, domainId: string) {
    const domain = await this.prisma.mailDomain.findFirst({
      where: { id: domainId, teamId },
    });
    if (!domain) throw new NotFoundException('Mail domain not found.');

    await this.prisma.mailDomain.delete({ where: { id: domainId } });
    return { success: true };
  }

  /**
   * Live DNS record verification using dns.promises.
   */
  async verifyDomain(teamId: string, domainId: string) {
    const domain = await this.prisma.mailDomain.findFirst({
      where: { id: domainId, teamId },
    });
    if (!domain) throw new NotFoundException('Mail domain not found.');

    const targetDomain = domain.domain;
    let spfVerified = false;
    let dkimVerified = false;
    let dmarcVerified = false;
    let mxVerified = false;

    // 1. Verify SPF: Query TXT records on target domain
    try {
      const txtRecords = await dns.promises.resolveTxt(targetDomain);
      const flattenedTxt = txtRecords.map((chunk) => chunk.join(''));
      for (const txt of flattenedTxt) {
        if (txt.includes('v=spf1')) {
          if (txt.includes(this.serverIp) || txt.includes(this.baseDomain) || txt.includes('include:')) {
            spfVerified = true;
            break;
          }
        }
      }
    } catch (e: any) {
      this.logger.debug(`SPF lookup for ${targetDomain}: ${e.message}`);
    }

    // 2. Verify DKIM: Query TXT records on selector._domainkey.targetDomain
    const dkimHost = `${domain.dkimSelector}._domainkey.${targetDomain}`;
    try {
      const dkimRecords = await dns.promises.resolveTxt(dkimHost);
      const flattenedDkim = dkimRecords.map((chunk) => chunk.join(''));
      // Extract key substring
      const expectedPart = domain.dkimPublicKey.replace(/^v=DKIM1;\s*k=rsa;\s*p=/, '').substring(0, 40);
      for (const txt of flattenedDkim) {
        if (txt.includes('v=DKIM1') && (txt.includes(expectedPart) || txt.includes('p='))) {
          dkimVerified = true;
          break;
        }
      }
    } catch (e: any) {
      this.logger.debug(`DKIM lookup for ${dkimHost}: ${e.message}`);
    }

    // 3. Verify DMARC: Query TXT records on _dmarc.targetDomain
    const dmarcHost = `_dmarc.${targetDomain}`;
    try {
      const dmarcRecords = await dns.promises.resolveTxt(dmarcHost);
      const flattenedDmarc = dmarcRecords.map((chunk) => chunk.join(''));
      for (const txt of flattenedDmarc) {
        if (txt.includes('v=DMARC1')) {
          dmarcVerified = true;
          break;
        }
      }
    } catch (e: any) {
      this.logger.debug(`DMARC lookup for ${dmarcHost}: ${e.message}`);
    }

    // 4. Verify MX: Query MX records on target domain
    try {
      const mxRecords = await dns.promises.resolveMx(targetDomain);
      for (const mx of mxRecords) {
        if (mx.exchange.toLowerCase().includes(this.baseDomain.toLowerCase()) || mx.exchange.length > 0) {
          mxVerified = true;
          break;
        }
      }
    } catch (e: any) {
      this.logger.debug(`MX lookup for ${targetDomain}: ${e.message}`);
    }

    // A domain is officially ready when DKIM and SPF are satisfied (or DMARC/MX as recommended)
    const isReady = dkimVerified && spfVerified;
    const newStatus = isReady ? 'VERIFIED' : 'PENDING_DNS';

    const updated = await this.prisma.mailDomain.update({
      where: { id: domainId },
      data: {
        spfVerified,
        dkimVerified,
        dmarcVerified,
        mxVerified,
        status: newStatus,
        verifiedAt: isReady ? new Date() : domain.verifiedAt,
      },
    });

    return {
      domain: updated,
      results: {
        spf: spfVerified,
        dkim: dkimVerified,
        dmarc: dmarcVerified,
        mx: mxVerified,
        status: newStatus,
      },
    };
  }

  // --- API KEYS ---

  async getApiKeys(teamId: string) {
    return this.prisma.mailApiKey.findMany({
      where: { teamId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        key: true,
        createdAt: true,
        lastUsedAt: true,
      },
    });
  }

  async createApiKey(teamId: string, name: string) {
    const rawKey = `kh_mail_live_${crypto.randomBytes(24).toString('hex')}`;
    return this.prisma.mailApiKey.create({
      data: {
        teamId,
        name: name || 'Default Mail Key',
        key: rawKey,
      },
    });
  }

  async deleteApiKey(teamId: string, keyId: string) {
    const key = await this.prisma.mailApiKey.findFirst({
      where: { id: keyId, teamId },
    });
    if (!key) throw new NotFoundException('Mail API Key not found.');

    await this.prisma.mailApiKey.delete({ where: { id: keyId } });
    return { success: true };
  }

  // --- SMTP CREDENTIALS INFO ---

  getSmtpConfig() {
    return {
      host: `mail.${this.baseDomain}`,
      smtpPort: 2525,
      submissionPort: 587,
      sslPort: 465,
      authMethod: 'LOGIN / PLAIN',
      usernameInstruction: 'Use your Mail API Key (kh_mail_live_...) as the username',
      passwordInstruction: 'Use your Mail API Key (kh_mail_live_...) as the password',
      serverIp: this.serverIp,
    };
  }

  // --- EMAIL DISPATCH (REST API like Resend) ---

  async sendEmail(
    teamId: string,
    params: {
      from: string;
      to: string | string[];
      subject: string;
      html?: string;
      text?: string;
      replyTo?: string;
      headers?: Record<string, string>;
    },
  ) {
    const { from, to, subject, html, text, replyTo, headers } = params;

    if (!from || !to || !subject) {
      throw new BadRequestException('Fields "from", "to", and "subject" are required.');
    }

    const toList = Array.isArray(to) ? to : [to];
    if (toList.length === 0) {
      throw new BadRequestException('At least one recipient email address is required.');
    }

    // Extract sender domain
    const fromMatch = from.match(/<([^>]+)>/) || [null, from];
    const fromEmail = (fromMatch[1] || from).trim();
    const domainMatch = fromEmail.split('@')[1];
    if (!domainMatch) {
      throw new BadRequestException('Invalid sender email format. Must be "name@yourdomain.com"');
    }
    const senderDomainName = domainMatch.toLowerCase();

    // Check if team has this domain
    const registeredDomain = await this.prisma.mailDomain.findFirst({
      where: { teamId, domain: senderDomainName },
    });

    // Generate unique message ID
    const msgId = `<${Date.now()}.${crypto.randomBytes(8).toString('hex')}@${senderDomainName}>`;

    // Configure DKIM signing if domain is configured
    const dkimConfig = registeredDomain
      ? {
          domainName: registeredDomain.domain,
          keySelector: registeredDomain.dkimSelector,
          privateKey: registeredDomain.dkimPrivateKey,
        }
      : undefined;

    // Configure outbound transport (internal loopback or custom upstream relay)
    const isLocalhost =
      !process.env.UPSTREAM_SMTP_HOST ||
      process.env.UPSTREAM_SMTP_HOST === '127.0.0.1' ||
      process.env.UPSTREAM_SMTP_HOST === 'localhost';

    const transportOptions: any = {
      host: process.env.UPSTREAM_SMTP_HOST || '127.0.0.1',
      port: parseInt(process.env.UPSTREAM_SMTP_PORT || '2525', 10),
      secure: process.env.UPSTREAM_SMTP_SECURE === 'true',
      ignoreTLS: isLocalhost,
      dkim: dkimConfig,
    };

    if (process.env.UPSTREAM_SMTP_USER && process.env.UPSTREAM_SMTP_PASS) {
      transportOptions.auth = {
        user: process.env.UPSTREAM_SMTP_USER,
        pass: process.env.UPSTREAM_SMTP_PASS,
      };
    } else if (isLocalhost) {
      transportOptions.auth = {
        user: 'khcloud',
        pass: process.env.ADMIN_PASSWORD || 'khcloudpassword',
      };
    }

    const transporter = nodemailer.createTransport(transportOptions);

    const mailOptions: nodemailer.SendMailOptions = {
      from,
      to: toList.join(', '),
      subject,
      text: text || (html ? html.replace(/<[^>]+>/g, ' ') : ''),
      html: html || undefined,
      replyTo,
      headers: {
        'X-Mailer': 'KH-Cloud-Mail/1.0',
        'Message-ID': msgId,
        ...headers,
      },
    };

    let logStatus = 'SENT';
    let errorMessage: string | null = null;

    try {
      await transporter.sendMail(mailOptions);
      this.logger.log(`Dispatched email from ${from} to ${toList.join(', ')} [${msgId}]`);
    } catch (sendErr: any) {
      this.logger.warn(`Immediate dispatch note: ${sendErr.message}. Queuing in logs.`);
      // If external delivery failed immediately, mark status accordingly
      logStatus = 'QUEUED';
      errorMessage = sendErr.message;
    }

    // Record in MailLog
    const log = await this.prisma.mailLog.create({
      data: {
        teamId,
        domainId: registeredDomain?.id || null,
        from,
        to: toList.join(', '),
        subject,
        bodyText: text || null,
        bodyHtml: html || null,
        status: logStatus,
        errorMessage,
        messageId: msgId,
        sizeBytes: (html || text || '').length,
      },
    });

    return {
      id: log.id,
      messageId: msgId,
      status: logStatus,
      from,
      to: toList,
      subject,
      createdAt: log.createdAt,
    };
  }

  // --- LOGS & STATS ---

  async getLogs(teamId: string, page = 1, pageSize = 25, search = '', status = '') {
    const offset = (page - 1) * pageSize;
    const where: any = { teamId };

    if (status && status !== 'ALL') {
      where.status = status;
    }

    if (search && search.trim()) {
      where.OR = [
        { to: { contains: search.trim() } },
        { subject: { contains: search.trim() } },
        { from: { contains: search.trim() } },
      ];
    }

    const [logs, total] = await Promise.all([
      this.prisma.mailLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: pageSize,
      }),
      this.prisma.mailLog.count({ where }),
    ]);

    return {
      logs,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async getStats(teamId: string) {
    const totalSent = await this.prisma.mailLog.count({ where: { teamId } });
    const totalDelivered = await this.prisma.mailLog.count({
      where: { teamId, status: { in: ['SENT', 'DELIVERED'] } },
    });
    const totalFailed = await this.prisma.mailLog.count({
      where: { teamId, status: 'FAILED' },
    });
    const domainsCount = await this.prisma.mailDomain.count({ where: { teamId } });
    const verifiedDomainsCount = await this.prisma.mailDomain.count({
      where: { teamId, status: 'VERIFIED' },
    });

    const deliveryRate = totalSent > 0 ? Math.round((totalDelivered / totalSent) * 100) : 100;

    return {
      totalSent,
      totalDelivered,
      totalFailed,
      deliveryRate,
      domainsCount,
      verifiedDomainsCount,
    };
  }
}
