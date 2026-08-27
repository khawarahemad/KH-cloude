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

  /**
   * Resolve which GitHub App installation can access a repo, regardless of
   * which account/org the team currently has linked. Uses the App JWT so
   * installs on personal accounts and other orgs are discovered automatically.
   */
  async getRepoInstallation(repoFullName: string): Promise<{
    installationId: string;
    accountLogin: string;
    accountType: string;
  } | null> {
    const clean = repoFullName
      .replace(/https?:\/\/github\.com\//i, '')
      .replace(/\.git$/i, '')
      .replace(/^\/+|\/+$/g, '')
      .trim();
    const [owner, repo] = clean.split('/');
    if (!owner || !repo) return null;

    const jwt = this.generateAppJwt();
    const res = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/installation`,
      {
        headers: {
          Authorization: `Bearer ${jwt}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'KH-Cloud-Backend',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      },
    );
    if (!res.ok) {
      if (res.status !== 404) {
        const err = await res.text();
        this.logger.warn(`getRepoInstallation(${clean}) failed: ${res.status} ${err}`);
      }
      return null;
    }
    const data: any = await res.json();
    return {
      installationId: String(data.id),
      accountLogin: data.account?.login || owner,
      accountType: data.account?.type || 'User',
    };
  }

  /**
   * Find an app installation whose account login matches the repo owner
   * (fallback when /repos/.../installation is unavailable).
   */
  async findInstallationByOwner(owner: string): Promise<{
    installationId: string;
    accountLogin: string;
    accountType: string;
  } | null> {
    if (!owner) return null;
    const jwt = this.generateAppJwt();
    let page = 1;
    const target = owner.toLowerCase();

    while (page <= 10) {
      const res = await fetch(
        `https://api.github.com/app/installations?per_page=100&page=${page}`,
        {
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
        this.logger.warn(`findInstallationByOwner(${owner}) failed: ${res.status} ${err}`);
        return null;
      }
      const batch: any[] = await res.json();
      if (!Array.isArray(batch) || batch.length === 0) break;

      const match = batch.find(
        (inst) => (inst.account?.login || '').toLowerCase() === target,
      );
      if (match) {
        return {
          installationId: String(match.id),
          accountLogin: match.account?.login || owner,
          accountType: match.account?.type || 'User',
        };
      }
      if (batch.length < 100) break;
      page += 1;
    }
    return null;
  }

  async listAllInstallations(): Promise<{
    installationId: string;
    accountLogin: string;
    accountType: string;
    avatarUrl?: string;
    repositorySelection?: string;
  }[]> {
    try {
      const jwt = this.generateAppJwt();
      let page = 1;
      const all: any[] = [];
      while (page <= 10) {
        const res = await fetch(
          `https://api.github.com/app/installations?per_page=100&page=${page}`,
          {
            headers: {
              Authorization: `Bearer ${jwt}`,
              Accept: 'application/vnd.github+json',
              'User-Agent': 'KH-Cloud-Backend',
              'X-GitHub-Api-Version': '2022-11-28',
            },
          },
        );
        if (!res.ok) break;
        const batch: any[] = await res.json();
        if (!Array.isArray(batch) || batch.length === 0) break;
        all.push(...batch);
        if (batch.length < 100) break;
        page += 1;
      }
      return all.map((inst) => ({
        installationId: String(inst.id),
        accountLogin: inst.account?.login || 'unknown',
        accountType: inst.account?.type || 'User',
        avatarUrl: inst.account?.avatar_url || null,
        repositorySelection: inst.repository_selection || 'selected',
      }));
    } catch (err: any) {
      this.logger.warn(`listAllInstallations failed: ${err.message}`);
      return [];
    }
  }

  async listInstallationRepos(installationId: string): Promise<{
    repos: any[];
    repositorySelection: 'all' | 'selected' | string;
    totalCount: number;
  }> {
    const token = await this.getInstallationToken(installationId);
    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'KH-Cloud-Backend',
      'X-GitHub-Api-Version': '2022-11-28',
    };

    // Paginate: GitHub returns at most 100 per page; "all" installs can exceed that.
    const allRepos: any[] = [];
    let repositorySelection: 'all' | 'selected' | string = 'selected';
    let totalCount = 0;
    let page = 1;

    while (true) {
      const res = await fetch(
        `https://api.github.com/installation/repositories?per_page=100&page=${page}`,
        { headers },
      );
      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Failed to list installation repos: ${err}`);
      }
      const data: any = await res.json();
      repositorySelection = data.repository_selection || repositorySelection;
      totalCount = typeof data.total_count === 'number' ? data.total_count : totalCount;
      const batch: any[] = data.repositories || [];
      allRepos.push(...batch);
      if (batch.length < 100 || allRepos.length >= totalCount) break;
      page += 1;
      // Safety cap to avoid runaway loops
      if (page > 20) break;
    }

    return {
      repositorySelection,
      totalCount: totalCount || allRepos.length,
      repos: allRepos.map((repo: any) => ({
        name: repo.name,
        fullName: repo.full_name,
        defaultBranch: repo.default_branch || 'main',
        cloneUrl: repo.clone_url,
        private: repo.private,
      })),
    };
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
    // Root listing must not use a trailing slash — some org repos 404 on /contents/
    const url = cleanPath
      ? `https://api.github.com/repos/${repo}/contents/${cleanPath}${ref}`
      : `https://api.github.com/repos/${repo}/contents${ref}`;
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
      this.logger.error('GITHUB_APP_WEBHOOK_SECRET not set - rejecting webhook payload.');
      return false;
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
    // Keep default in sync with manage-url / README (GITHUB_APP_SLUG=kh-cloud-app)
    const appSlug = process.env.GITHUB_APP_SLUG || 'kh-cloud-app';
    const state = Buffer.from(JSON.stringify({ teamId })).toString('base64url');
    return `https://github.com/apps/${appSlug}/installations/new?state=${state}`;
  }
}
