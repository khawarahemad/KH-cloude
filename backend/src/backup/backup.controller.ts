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
  Req,
  ForbiddenException,
} from '@nestjs/common';
import * as express from 'express';
import { BackupService } from './backup.service';
import { PrismaService } from '../prisma/prisma.service';

@Controller('api/backups')
export class BackupController {
  constructor(
    private readonly backupService: BackupService,
    private readonly prisma: PrismaService,
  ) {}

  private async enforceAdmin(req: any) {
    if (!req.user?.id) throw new ForbiddenException('Authentication required.');
    const user = await this.prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user || user.role !== 'ADMIN') {
      throw new ForbiddenException('Platform admin access required.');
    }
  }

  @Get('list')
  async listBackups(@Req() req: any) {
    await this.enforceAdmin(req);
    const backups = await this.backupService.listBackups();
    return { success: true, backups };
  }

  @Get('config')
  async getConfig(@Req() req: any) {
    await this.enforceAdmin(req);
    const config = this.backupService.getConfig();
    return { success: true, config };
  }

  @Post('create')
  @HttpCode(HttpStatus.OK)
  async triggerBackup(@Req() req: any) {
    await this.enforceAdmin(req);
    const result = await this.backupService.createBackup();
    return result;
  }

  @Get('download/:filename')
  async downloadBackup(@Param('filename') filename: string, @Res() res: express.Response, @Req() req: any) {
    await this.enforceAdmin(req);
    const filePath = this.backupService.getBackupPath(filename);
    if (!filePath) {
      throw new NotFoundException(`Backup file "${filename}" not found.`);
    }

    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.sendFile(filePath);
  }

  @Delete(':filename')
  async deleteBackup(@Param('filename') filename: string, @Req() req: any) {
    await this.enforceAdmin(req);
    const success = await this.backupService.deleteBackup(filename);
    if (!success) {
      throw new NotFoundException(`Backup file "${filename}" not found.`);
    }
    return { success: true, message: `Backup "${filename}" deleted successfully.` };
  }
}
