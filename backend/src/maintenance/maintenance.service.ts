import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

@Injectable()
export class MaintenanceService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MaintenanceService.name);
  private maintenanceTimer: NodeJS.Timeout | null = null;
  private isRunning = false;

  onModuleInit() {
    this.scheduleNextDailyPrune();
  }

  onModuleDestroy() {
    if (this.maintenanceTimer) {
      clearTimeout(this.maintenanceTimer);
      this.maintenanceTimer = null;
    }
  }

  /**
   * Schedules the next Docker prune task at 3:00 AM local time.
   */
  private scheduleNextDailyPrune() {
    const now = new Date();
    const nextRun = new Date();

    // Set target to 03:00:00
    nextRun.setHours(3, 0, 0, 0);

    // If 3:00 AM has already passed today, schedule for tomorrow 3:00 AM
    if (now.getTime() >= nextRun.getTime()) {
      nextRun.setDate(nextRun.getDate() + 1);
    }

    const delayMs = nextRun.getTime() - now.getTime();
    const delayHours = (delayMs / (1000 * 60 * 60)).toFixed(2);

    this.logger.log(
      `[Maintenance] Next daily Docker prune scheduled at ${nextRun.toLocaleString()} (in ${delayHours} hours).`,
    );

    this.maintenanceTimer = setTimeout(async () => {
      await this.runDockerPrune();
      // Re-schedule for the next day
      this.scheduleNextDailyPrune();
    }, delayMs);
  }

  /**
   * Executes Docker builder and image prune to keep VPS disk space clean.
   */
  async runDockerPrune(): Promise<{ success: boolean; details: string[]; error?: string }> {
    if (this.isRunning) {
      this.logger.warn('[Maintenance] Prune is already in progress, skipping duplicate execution.');
      return { success: false, details: ['Prune already running'] };
    }

    this.isRunning = true;
    this.logger.log('[Maintenance] 🧹 Starting automated Docker cleanup (builder prune -a & image prune -a)...');

    const logs: string[] = [];

    try {
      // 1. Prune all unused build cache
      try {
        const { stdout: builderOut } = await execAsync('docker builder prune -a -f', { timeout: 120000 });
        const trimmed = builderOut.trim();
        logs.push(`Builder Prune: ${trimmed || 'No cache to remove'}`);
        this.logger.log(`[Maintenance] Docker builder prune complete: ${trimmed.replace(/\n/g, ' ')}`);
      } catch (err: any) {
        logs.push(`Builder Prune Warning: ${err.message}`);
        this.logger.warn(`[Maintenance] Builder prune warning: ${err.message}`);
      }

      // 2. Prune unused images older than 24h (avoids deleting base images in immediate active builds)
      try {
        const { stdout: imageOut } = await execAsync('docker image prune -a -f --filter "until=24h"', { timeout: 120000 });
        const trimmed = imageOut.trim();
        logs.push(`Image Prune: ${trimmed || 'No images to remove'}`);
        this.logger.log(`[Maintenance] Docker image prune complete: ${trimmed.replace(/\n/g, ' ')}`);
      } catch (err: any) {
        logs.push(`Image Prune Warning: ${err.message}`);
        this.logger.warn(`[Maintenance] Image prune warning: ${err.message}`);
      }

      this.logger.log('[Maintenance] ✅ Automated Docker cleanup completed successfully.');
      return { success: true, details: logs };
    } catch (err: any) {
      this.logger.error(`[Maintenance] ❌ Docker cleanup encountered an error: ${err.message}`, err.stack);
      return { success: false, details: logs, error: err.message };
    } finally {
      this.isRunning = false;
    }
  }
}
