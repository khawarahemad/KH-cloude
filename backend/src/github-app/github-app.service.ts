import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';

@Injectable()
export class GithubAppService {
  private readonly logger = new Logger(GithubAppService.name);

  private get appId(): string {
    return process.env.GITHUB_APP_ID || '';
  }

  private get privateKey(): string {
    const raw = process.env.GITHUB_APP_PRIVATE_KEY || '';
    return raw.replace(/\\n/g, '\n');
  }

  private get webhookSecret(): string {
    return process.env.GITHUB_APP_WEBHOOK_SECRET || '';
  }

  generateAppJwt(): string {
    if (!this.appId || !this.privateKey) {
      throw new Error('GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY must be set.');
    }

    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iat: now - 60,
      exp: now + (9 * 60),
      iss: this.appId,
    };

    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signingInput = `${header}.${body}`;

    const sign = crypto.createSign('RSA-SHA256');
    sign.update(signingInput);
    const signature = sign.sign(this.privateKey, 'base64url');

    return `${signingInput}.${signature}`;
  }

  async getInstallationToken(installationId: string): Promise<string> {
    const jwt = this.generateAppJwt();
    const res = await fetch(
      `https://api.github.com/app/installations/${installationId}/access_tokens`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${jwt}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'KH-Cloud-Backend',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      },
    );
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Failed to get installation token: ${err}`);
    }
    const data: any = await res.json();
    return data.token;
  }

  async listInstallationRepos(installationId: string): Promise<any[]> {
    const token = await this.getInstallationToken(installationId);
    const res = await fetch(
      'https://api.github.com/installation/repositories?per_page=100',
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'KH-Cloud-Backend',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      },
    );
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Failed to list installation repos: ${err}`);
    }
    const data: any = await res.json();
    const repos: any[] = data.repositories || [];
    return repos.map((repo: any) => ({
      name: repo.name,
      fullName: repo.full_name,
      defaultBranch: repo.default_branch || 'main',
      cloneUrl: repo.clone_url,
      private: repo.private,
    }));
  }

  async fetchRepoContents(
    installationId: string,
    repo: string,
    path: string,
    branch?: string,
  ): Promise<any[]> {
    const token = await this.getInstallationToken(installationId);
    const ref = branch ? `?ref=${branch}` : '';
    const cleanPath = path ? path.replace(/^\/|\/$/g, '') : '';
    const url = `https://api.github.com/repos/${repo}/contents/${cleanPath}${ref}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'KH-Cloud-Backend',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  }

  async fetchFileContent(
    installationId: string,
    downloadUrl: string,
  ): Promise<string | null> {
    const token = await this.getInstallationToken(installationId);
    try {
      const res = await fetch(downloadUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return null;
      return await res.text();
    } catch {
      return null;
    }
  }

  verifyWebhookSignature(rawBody: Buffer | string, signatureHeader: string): boolean {
    if (!this.webhookSecret) {
      this.logger.warn('GITHUB_APP_WEBHOOK_SECRET not set — skipping verification!');
      return true;
    }
    const sig = signatureHeader.startsWith('sha256=')
      ? signatureHeader.slice(7)
      : signatureHeader;
    const hmac = crypto.createHmac('sha256', this.webhookSecret);
    hmac.update(rawBody);
    const digest = hmac.digest('hex');
    try {
      return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(digest, 'hex'));
    } catch {
      return false;
    }
  }

  getInstallUrl(teamId: string): string {
    const appSlug = process.env.GITHUB_APP_SLUG || 'kh-cloud';
    const state = Buffer.from(JSON.stringify({ teamId })).toString('base64url');
    return `https://github.com/apps/${appSlug}/installations/new?state=${state}`;
  }
}
