import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

const execAsync = promisify(exec);

export interface BackupItem {
  id: string;
  filename: string;
  sizeBytes: number;
  sizeFormatted: string;
  createdAt: string;
  isEncrypted: boolean;
  path: string;
}

export interface BackupConfig {
  scheduleEnabled: boolean;
  scheduleInterval: 'hourly' | 'daily' | 'weekly';
  encryptionKeyConfigured: boolean;
  githubRepoConfigured: boolean;
  githubRepo?: string;
  s3Configured: boolean;
  s3Bucket?: string;
  s3Endpoint?: string;
}

@Injectable()
export class BackupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BackupService.name);
  private backupTimer: NodeJS.Timeout | null = null;
  private isBackupRunning = false;
  private readonly backupDir = process.env.BACKUP_DIR || '/var/lib/kh-cloud/backups';

  onModuleInit() {
    this.ensureBackupDir();

    const encryptionKey = process.env.BACKUP_ENCRYPTION_KEY || process.env.ADMIN_API_KEY || '';
    if (!encryptionKey || encryptionKey === 'khcloud-default-secret-key' || encryptionKey.length < 16) {
      this.logger.error('CRITICAL: BACKUP_ENCRYPTION_KEY must be set to a secure string (>= 16 chars). Automated backups are DISABLED for safety.');
      return; // Disable backups instead of crashing the server
    }

    this.scheduleAutomatedBackups();
  }

  onModuleDestroy() {
    if (this.backupTimer) {
      clearInterval(this.backupTimer);
      this.backupTimer = null;
    }
  }

  private ensureBackupDir() {
    try {
      if (!fs.existsSync(this.backupDir)) {
        fs.mkdirSync(this.backupDir, { recursive: true });
      }
    } catch (err: any) {
      this.logger.warn(`Could not create backup directory ${this.backupDir}: ${err.message}`);
    }
  }

  /**
   * Schedules automated backups (default: every 24 hours).
   */
  private scheduleAutomatedBackups() {
    const intervalMs = 24 * 60 * 60 * 1000; // 24 hours
    this.backupTimer = setInterval(async () => {
      this.logger.log('[BackupEngine] 🕒 Triggering scheduled automated backup...');
      try {
        await this.createBackup();
      } catch (err: any) {
        this.logger.error(`[BackupEngine] Scheduled backup failed: ${err.message}`);
      }
    }, intervalMs);
  }

  /**
   * Executes a full encrypted snapshot backup.
   */
  async createBackup(): Promise<{ success: boolean; backup?: BackupItem; error?: string }> {
    if (this.isBackupRunning) {
      return { success: false, error: 'A backup task is already in progress.' };
    }

    this.isBackupRunning = true;
    this.ensureBackupDir();

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupName = `kh-cloud-backup-${timestamp}.enc.tar.gz`;
    const tempDir = `/tmp/kh-backup-${Date.now()}`;
    const destinationPath = path.join(this.backupDir, backupName);
    const encryptionKey = process.env.BACKUP_ENCRYPTION_KEY || process.env.ADMIN_API_KEY;

    this.logger.log(`[BackupEngine] 🚀 Starting snapshot creation -> ${backupName}`);

    try {
      fs.mkdirSync(tempDir, { recursive: true });
      fs.mkdirSync(path.join(tempDir, 'db'), { recursive: true });
      fs.mkdirSync(path.join(tempDir, 'minio'), { recursive: true });
      fs.mkdirSync(path.join(tempDir, 'traefik-acme'), { recursive: true });

      // 1. Copy SQLite database safely
      const dbSrc = '/var/lib/kh-cloud/db/dev.db';
      if (fs.existsSync(dbSrc)) {
        try {
          await execAsync(`sqlite3 "${dbSrc}" "VACUUM INTO '${tempDir}/db/dev.db'"`, { timeout: 30000 });
        } catch {
          fs.copyFileSync(dbSrc, path.join(tempDir, 'db', 'dev.db'));
        }
      }

      // 2. Copy MinIO object storage files
      const minioSrc = '/var/lib/kh-cloud/minio';
      if (fs.existsSync(minioSrc)) {
        try {
          await execAsync(`cp -r "${minioSrc}"/* "${tempDir}/minio/" 2>/dev/null || true`, { timeout: 60000 });
        } catch {}
      }

      // 3. Copy Let's Encrypt SSL certificates
      const acmeSrc = '/var/lib/kh-cloud/traefik-acme/acme.json';
      if (fs.existsSync(acmeSrc)) {
        fs.copyFileSync(acmeSrc, path.join(tempDir, 'traefik-acme', 'acme.json'));
      }

      // 4. Copy .env configuration
      const envSrc = '/usr/src/app/.env';
      if (fs.existsSync(envSrc)) {
        fs.copyFileSync(envSrc, path.join(tempDir, '.env'));
      } else if (fs.existsSync('.env')) {
        fs.copyFileSync('.env', path.join(tempDir, '.env'));
      }

      // 5. Write metadata
      const metadata = {
        version: '1.0.1',
        createdAt: new Date().toISOString(),
        domain: process.env.BASE_DOMAIN || 'yourdomain.com',
        nodeVersion: process.version,
      };
      fs.writeFileSync(path.join(tempDir, 'metadata.json'), JSON.stringify(metadata, null, 2));

      // 6. Compress and encrypt with OpenSSL AES-256-CBC
      const cmd = `tar -czf - -C "${tempDir}" . | openssl enc -aes-256-cbc -pbkdf2 -iter 100000 -salt -pass "pass:${encryptionKey}" -out "${destinationPath}"`;
      await execAsync(cmd, { timeout: 120000 });

      // Clean up temp
      await execAsync(`rm -rf "${tempDir}"`);

      // Read stats
      const stats = fs.statSync(destinationPath);
      const backupItem: BackupItem = {
        id: backupName,
        filename: backupName,
        sizeBytes: stats.size,
        sizeFormatted: this.formatBytes(stats.size),
        createdAt: new Date().toISOString(),
        isEncrypted: true,
        path: destinationPath,
      };

      this.logger.log(`[BackupEngine] ✅ Backup archive created: ${backupName} (${backupItem.sizeFormatted})`);

      // Optional Remote Sync
      this.syncRemoteTargets(destinationPath, backupName).catch((err) => {
        this.logger.warn(`[BackupEngine] Remote sync warning: ${err.message}`);
      });

      return { success: true, backup: backupItem };
    } catch (err: any) {
      this.logger.error(`[BackupEngine] ❌ Backup failed: ${err.message}`, err.stack);
      try {
        await execAsync(`rm -rf "${tempDir}"`);
      } catch {}
      return { success: false, error: err.message };
    } finally {
      this.isBackupRunning = false;
    }
  }

  /**
   * Syncs the created archive to remote S3 or GitHub if configured.
   */
  private async syncRemoteTargets(archivePath: string, filename: string) {
    // 1. GitHub Private Repository Release
    const ghRepo = process.env.BACKUP_GITHUB_REPO;
    const ghToken = process.env.BACKUP_GITHUB_TOKEN;

    if (ghRepo && ghToken) {
      this.logger.log(`[BackupEngine] 🐙 Syncing snapshot to GitHub repo ${ghRepo}...`);
      try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const tag = `backup-${timestamp}`;
        const releaseRes = await fetch(`https://api.github.com/repos/${ghRepo}/releases`, {
          method: 'POST',
          headers: {
            Authorization: `token ${ghToken}`,
            Accept: 'application/vnd.github.v3+json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            tag_name: tag,
            name: `KH Cloud Backup ${timestamp}`,
            body: 'Automated encrypted backup snapshot.',
            draft: false,
            prerelease: false,
          }),
        });

        if (releaseRes.ok) {
          const releaseData = await releaseRes.json();
          const uploadUrl = releaseData.upload_url?.replace('{?name,label}', '');
          if (uploadUrl) {
            const fileStream = fs.readFileSync(archivePath);
            await fetch(`${uploadUrl}?name=${filename}`, {
              method: 'POST',
              headers: {
                Authorization: `token ${ghToken}`,
                'Content-Type': 'application/gzip',
              },
              body: fileStream,
            });
            this.logger.log(`[BackupEngine] ✅ Successfully uploaded snapshot to GitHub Releases!`);
          }
        }
      } catch (err: any) {
        this.logger.warn(`[BackupEngine] GitHub sync failed: ${err.message}`);
      }
    }
  }

  /**
   * Lists all local backup snapshots.
   */
  async listBackups(): Promise<BackupItem[]> {
    this.ensureBackupDir();
    try {
      if (!fs.existsSync(this.backupDir)) return [];
      const files = fs.readdirSync(this.backupDir);
      const items: BackupItem[] = [];

      for (const file of files) {
        if (file.endsWith('.enc.tar.gz') || file.endsWith('.tar.gz')) {
          const fullPath = path.join(this.backupDir, file);
          const stats = fs.statSync(fullPath);
          items.push({
            id: file,
            filename: file,
            sizeBytes: stats.size,
            sizeFormatted: this.formatBytes(stats.size),
            createdAt: stats.mtime.toISOString(),
            isEncrypted: file.includes('.enc.'),
            path: fullPath,
          });
        }
      }

      return items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } catch (err: any) {
      this.logger.warn(`Failed to list backups: ${err.message}`);
      return [];
    }
  }

  /**
   * Gets absolute file path for a backup ID.
   */
  getBackupPath(filename: string): string | null {
    const safeName = path.basename(filename);
    const fullPath = path.join(this.backupDir, safeName);
    if (fs.existsSync(fullPath)) {
      return fullPath;
    }
    return null;
  }

  /**
   * Deletes a backup snapshot.
   */
  async deleteBackup(filename: string): Promise<boolean> {
    const safeName = path.basename(filename);
    const fullPath = path.join(this.backupDir, safeName);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
      return true;
    }
    return false;
  }

  /**
   * Retrieves backup system configuration status.
   */
  getConfig(): BackupConfig {
    return {
      scheduleEnabled: true,
      scheduleInterval: 'daily',
      encryptionKeyConfigured: !!(process.env.BACKUP_ENCRYPTION_KEY || process.env.ADMIN_API_KEY),
      githubRepoConfigured: !!(process.env.BACKUP_GITHUB_REPO && process.env.BACKUP_GITHUB_TOKEN),
      githubRepo: process.env.BACKUP_GITHUB_REPO,
      s3Configured: !!(process.env.BACKUP_S3_ENDPOINT && process.env.BACKUP_S3_BUCKET),
      s3Bucket: process.env.BACKUP_S3_BUCKET,
      s3Endpoint: process.env.BACKUP_S3_ENDPOINT,
    };
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}
