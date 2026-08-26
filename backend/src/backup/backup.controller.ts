import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Res,
  NotFoundException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import * as express from 'express';
import { BackupService } from './backup.service';

@Controller('api/backups')
export class BackupController {
  constructor(private readonly backupService: BackupService) {}

  @Get('list')
  async listBackups() {
    const backups = await this.backupService.listBackups();
    return { success: true, backups };
  }

  @Get('config')
  getConfig() {
    const config = this.backupService.getConfig();
    return { success: true, config };
  }

  @Post('create')
  @HttpCode(HttpStatus.OK)
  async triggerBackup() {
    const result = await this.backupService.createBackup();
    return result;
  }

  @Get('download/:filename')
  downloadBackup(@Param('filename') filename: string, @Res() res: express.Response) {
    const filePath = this.backupService.getBackupPath(filename);
    if (!filePath) {
      throw new NotFoundException(`Backup file "${filename}" not found.`);
    }

    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.sendFile(filePath);
  }

  @Delete(':filename')
  async deleteBackup(@Param('filename') filename: string) {
    const success = await this.backupService.deleteBackup(filename);
    if (!success) {
      throw new NotFoundException(`Backup file "${filename}" not found.`);
    }
    return { success: true, message: `Backup "${filename}" deleted successfully.` };
  }
}
