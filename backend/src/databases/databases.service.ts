import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DatabaseType } from '@prisma/client';
import { sendDiscordNotification } from '../utils/discord-webhook';

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
      sendDiscordNotification(data.teamId, 'database', {
        title: `⚡ Database Online: ${db.name}`,
        description: `The **${db.type}** database **${db.name}** is now up and running!`,
        color: 2278750, // Green
        fields: [
          { name: 'Host', value: `\`${host}\``, inline: true },
          { name: 'Port', value: String(port), inline: true }
        ]
      });
    }, 5000);

    sendDiscordNotification(data.teamId, 'database', {
      title: `🗄️ Database Provisioning: ${db.name}`,
      description: `A new **${db.type}** database instance is being created.`,
      color: 3899904, // Blue
      fields: [
        { name: 'Name', value: db.name, inline: true },
        { name: 'Type', value: db.type, inline: true },
        { name: 'Host', value: `\`${host}\``, inline: false }
      ]
    });

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

    sendDiscordNotification(teamId, 'database', {
      title: `🗑️ Database Deleted: ${db.name}`,
      description: `The **${db.type}** database **${db.name}** has been deleted.`,
      color: 16096779, // Orange/Yellow
      fields: [
        { name: 'Name', value: db.name, inline: true },
        { name: 'Type', value: db.type, inline: true }
      ]
    });

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

  async syncStorageTables(dbId: string, teamId: string) {
    const buckets = await this.prisma.bucket.findMany({
      where: { teamId },
      include: { objects: true },
    });

    const { client } = this.openDb(dbId);
    try {
      client.prepare(`
        CREATE TABLE IF NOT EXISTS storage_buckets (
          id TEXT PRIMARY KEY,
          name TEXT UNIQUE NOT NULL,
          is_public INTEGER DEFAULT 0,
          size_limit INTEGER,
          size_used INTEGER,
          status TEXT,
          created_at TEXT
        );
      `).run();

      client.prepare(`
        CREATE TABLE IF NOT EXISTS storage_objects (
          id TEXT PRIMARY KEY,
          bucket_id TEXT,
          name TEXT,
          size INTEGER,
          content_type TEXT,
          etag TEXT,
          is_folder INTEGER DEFAULT 0,
          created_at TEXT,
          FOREIGN KEY(bucket_id) REFERENCES storage_buckets(id) ON DELETE CASCADE
        );
      `).run();

      // Clear existing records first to avoid stale entries
      client.prepare('DELETE FROM storage_objects').run();
      client.prepare('DELETE FROM storage_buckets').run();

      const insertBucket = client.prepare(`
        INSERT OR REPLACE INTO storage_buckets (id, name, is_public, size_limit, size_used, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      const insertObject = client.prepare(`
        INSERT OR REPLACE INTO storage_objects (id, bucket_id, name, size, content_type, etag, is_folder, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const transaction = client.transaction(() => {
        for (const bucket of buckets) {
          insertBucket.run(
            bucket.id,
            bucket.name,
            bucket.isPublic ? 1 : 0,
            Number(bucket.sizeLimit),
            Number(bucket.sizeUsed),
            bucket.status,
            bucket.createdAt.toISOString()
          );

          for (const obj of bucket.objects) {
            insertObject.run(
              obj.id,
              obj.bucketId,
              obj.key,
              Number(obj.size),
              obj.contentType,
              obj.etag,
              obj.isFolder ? 1 : 0,
              obj.createdAt.toISOString()
            );
          }
        }
      });

      transaction();
    } catch (err) {
      console.error('Failed to sync storage tables into virtual database:', err);
    } finally {
      client.close();
    }
  }

  async getTables(dbId: string, teamId: string) {
    const db = await this.prisma.databaseInstance.findFirst({
      where: { id: dbId, teamId },
    });
    if (!db) throw new NotFoundException('Database not found.');

    await this.syncStorageTables(dbId, teamId);

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

    await this.syncStorageTables(dbId, teamId);

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

  // ---- TABLE EDITOR METHODS ----

  private openDb(dbId: string) {
    const fs = require('fs');
    const path = require('path');
    const dbPath = `./data/virtual_db_${dbId}.db`;
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const Database = require('better-sqlite3');
    return { client: new Database(dbPath), dbPath };
  }

  async getTableSchema(dbId: string, teamId: string, tableName: string) {
    const db = await this.prisma.databaseInstance.findFirst({ where: { id: dbId, teamId } });
    if (!db) throw new NotFoundException('Database not found.');

    await this.syncStorageTables(dbId, teamId);

    const { client } = this.openDb(dbId);
    try {
      const cols = client.prepare(`PRAGMA table_info(${tableName});`).all();
      const pkCols = client.prepare(`PRAGMA table_info(${tableName});`).all()
        .filter((c: any) => c.pk > 0)
        .map((c: any) => c.name);
      return {
        columns: cols.map((c: any) => ({
          cid: c.cid,
          name: c.name,
          type: c.type,
          notnull: c.notnull === 1,
          dflt_value: c.dflt_value,
          pk: c.pk > 0,
        })),
        primaryKey: pkCols[0] || 'id',
      };
    } finally {
      client.close();
    }
  }

  async getTableRows(dbId: string, teamId: string, tableName: string, page = 1, pageSize = 50, filter = '') {
    const db = await this.prisma.databaseInstance.findFirst({ where: { id: dbId, teamId } });
    if (!db) throw new NotFoundException('Database not found.');

    await this.syncStorageTables(dbId, teamId);

    const { client } = this.openDb(dbId);
    try {
      const offset = (page - 1) * pageSize;
      const whereClause = filter ? `WHERE ${filter}` : '';
      const rows = client.prepare(`SELECT * FROM ${tableName} ${whereClause} LIMIT ? OFFSET ?`).all(pageSize, offset);
      const total = (client.prepare(`SELECT COUNT(*) as cnt FROM ${tableName} ${whereClause}`).get() as any).cnt;
      return {
        rows,
        columns: rows.length > 0 ? Object.keys(rows[0]) : [],
        total,
        page,
        pageSize,
      };
    } finally {
      client.close();
    }
  }

  async insertRow(dbId: string, teamId: string, tableName: string, data: Record<string, any>) {
    const db = await this.prisma.databaseInstance.findFirst({ where: { id: dbId, teamId } });
    if (!db) throw new NotFoundException('Database not found.');

    await this.syncStorageTables(dbId, teamId);

    const { client } = this.openDb(dbId);
    try {
      const keys = Object.keys(data).filter(k => data[k] !== undefined && data[k] !== '');
      if (keys.length === 0) throw new BadRequestException('No data provided for insert.');
      const placeholders = keys.map(() => '?').join(', ');
      const values = keys.map(k => data[k]);
      const info = client.prepare(`INSERT INTO ${tableName} (${keys.join(', ')}) VALUES (${placeholders})`).run(...values);
      return { success: true, lastInsertRowid: info.lastInsertRowid.toString() };
    } finally {
      client.close();
    }
  }

  async updateRow(dbId: string, teamId: string, tableName: string, primaryKey: string, pkValue: any, data: Record<string, any>) {
    const db = await this.prisma.databaseInstance.findFirst({ where: { id: dbId, teamId } });
    if (!db) throw new NotFoundException('Database not found.');

    await this.syncStorageTables(dbId, teamId);

    const { client } = this.openDb(dbId);
    try {
      const keys = Object.keys(data).filter(k => k !== primaryKey);
      if (keys.length === 0) throw new BadRequestException('No fields to update.');
      const setClauses = keys.map(k => `${k} = ?`).join(', ');
      const values = [...keys.map(k => data[k]), pkValue];
      const info = client.prepare(`UPDATE ${tableName} SET ${setClauses} WHERE ${primaryKey} = ?`).run(...values);
      return { success: true, affectedRows: info.changes };
    } finally {
      client.close();
    }
  }

  async deleteRow(dbId: string, teamId: string, tableName: string, primaryKey: string, pkValue: any) {
    const db = await this.prisma.databaseInstance.findFirst({ where: { id: dbId, teamId } });
    if (!db) throw new NotFoundException('Database not found.');

    await this.syncStorageTables(dbId, teamId);

    const { client } = this.openDb(dbId);
    try {
      const info = client.prepare(`DELETE FROM ${tableName} WHERE ${primaryKey} = ?`).run(pkValue);
      return { success: true, affectedRows: info.changes };
    } finally {
      client.close();
    }
  }
}

