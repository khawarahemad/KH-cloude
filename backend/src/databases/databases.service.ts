import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DatabaseType } from '@prisma/client';

@Injectable()
export class DatabasesService {
  constructor(private prisma: PrismaService) {}

  async createDatabase(data: {
    name: string;
    type: DatabaseType;
    teamId: string;
    projectId?: string;
  }) {
    const host = `${data.name.toLowerCase().replace(/[^a-z0-9]/g, '')}-${data.type.toLowerCase()}.db.khawarahemad.com`;
    const port = data.type === 'POSTGRESQL' ? 5432 : data.type === 'REDIS' ? 6379 : 3306;
    const username = data.type === 'REDIS' ? undefined : 'khclouduser';
    const password = Math.random().toString(36).substring(2, 16);
    const dbName = data.type === 'REDIS' ? undefined : `${data.name.toLowerCase()}_db`;

    const db = await this.prisma.databaseInstance.create({
      data: {
        name: data.name,
        type: data.type,
        host,
        port,
        dbName,
        username,
        password,
        status: 'CREATING',
        teamId: data.teamId,
        projectId: data.projectId || null,
      },
    });

    // Simulate provisioning complete in 5 seconds
    setTimeout(async () => {
      await this.prisma.databaseInstance.update({
        where: { id: db.id },
        data: { status: 'RUNNING' },
      });
    }, 5000);

    await this.prisma.auditLog.create({
      data: {
        teamId: data.teamId,
        action: 'DATABASE.CREATE',
        targetType: 'DATABASE',
        targetId: db.id,
        details: JSON.stringify({ name: db.name, type: db.type }),
      },
    });

    return db;
  }

  async getDatabases(teamId: string) {
    return this.prisma.databaseInstance.findMany({
      where: { teamId },
      include: { project: true },
    });
  }

  async deleteDatabase(id: string, teamId: string) {
    const db = await this.prisma.databaseInstance.findFirst({
      where: { id, teamId },
    });
    if (!db) throw new NotFoundException('Database not found.');

    await this.prisma.databaseInstance.delete({ where: { id } });

    await this.prisma.auditLog.create({
      data: {
        teamId,
        action: 'DATABASE.DELETE',
        targetType: 'DATABASE',
        targetId: id,
        details: JSON.stringify({ name: db.name }),
      },
    });

    return { success: true };
  }

  async getTables(dbId: string, teamId: string) {
    const db = await this.prisma.databaseInstance.findFirst({
      where: { id: dbId, teamId },
    });
    if (!db) throw new NotFoundException('Database not found.');

    const dbPath = `./data/virtual_db_${dbId}.db`;
    const fs = require('fs');
    if (!fs.existsSync(dbPath)) {
      return [];
    }

    const Database = require('better-sqlite3');
    const client = new Database(dbPath);

    try {
      const rows = client.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';").all();
      return rows.map((r: any) => r.name);
    } catch (err) {
      return [];
    } finally {
      client.close();
    }
  }

  async runQuery(dbId: string, teamId: string, sql: string) {
    const db = await this.prisma.databaseInstance.findFirst({
      where: { id: dbId, teamId },
    });
    if (!db) throw new NotFoundException('Database not found.');

    const dbPath = `./data/virtual_db_${dbId}.db`;
    
    const fs = require('fs');
    const path = require('path');
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const Database = require('better-sqlite3');
    const client = new Database(dbPath);

    try {
      const stmt = client.prepare(sql);
      if (stmt.reader) {
        const rows = stmt.all();
        return { 
          success: true, 
          rows, 
          columns: rows.length > 0 ? Object.keys(rows[0]) : [],
          message: `Query returned ${rows.length} row(s).`
        };
      } else {
        const info = stmt.run();
        return { 
          success: true, 
          affectedRows: info.changes, 
          lastInsertRowid: info.lastInsertRowid.toString(),
          message: `Query executed successfully. ${info.changes} row(s) affected.`
        };
      }
    } catch (err: any) {
      try {
        client.exec(sql);
        return { success: true, message: 'Command executed successfully.' };
      } catch (execErr: any) {
        throw new BadRequestException(execErr.message);
      }
    } finally {
      client.close();
    }
  }
}
