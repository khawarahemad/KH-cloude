import { Injectable, Logger, BadRequestException, NotFoundException, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DatabaseType } from '@prisma/client';
import { sendDiscordNotification } from '../utils/discord-webhook';
import { Client as PgClient } from 'pg';
import * as mysql from 'mysql2/promise';
import Redis from 'ioredis';

@Injectable()
export class DatabasesService implements OnModuleInit {
  private readonly logger = new Logger(DatabasesService.name);

  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    // Automatically verify and provision all registered database instances on startup
    this.syncAllPostgresDatabases().catch((err) => {
      this.logger.warn(`Postgres initial sync note: ${err.message}`);
    });
    this.syncAllMysqlDatabases().catch((err) => {
      this.logger.warn(`MySQL initial sync note: ${err.message}`);
    });
    this.syncAllRedisDatabases().catch((err) => {
      this.logger.warn(`Redis initial sync note: ${err.message}`);
    });
  }

  async syncAllPostgresDatabases() {
    try {
      const postgresDbs = await this.prisma.databaseInstance.findMany({
        where: { type: 'POSTGRESQL' },
      });
      for (const db of postgresDbs) {
        if (db.username && db.password && db.dbName) {
          await this.provisionPostgresDatabase(db.username, db.password, db.dbName);
        }
      }
      this.logger.log(`Verified and synced ${postgresDbs.length} PostgreSQL instances in kh-cloud-postgres`);
    } catch (err: any) {
      this.logger.warn(`Failed to sync PostgreSQL instances: ${err.message}`);
    }
  }

  async syncAllMysqlDatabases() {
    try {
      const mysqlDbs = await this.prisma.databaseInstance.findMany({
        where: { type: 'MYSQL' },
      });
      for (const db of mysqlDbs) {
        if (db.username && db.password && db.dbName) {
          await this.provisionMysqlDatabase(db.username, db.password, db.dbName);
        }
      }
      this.logger.log(`Verified and synced ${mysqlDbs.length} MySQL instances in kh-cloud-mysql`);
    } catch (err: any) {
      this.logger.warn(`Failed to sync MySQL instances: ${err.message}`);
    }
  }

  async syncAllRedisDatabases() {
    try {
      const redisDbs = await this.prisma.databaseInstance.findMany({
        where: { type: 'REDIS' },
      });
      for (const db of redisDbs) {
        if (db.password) {
          await this.provisionRedisDatabase(db.username || 'default', db.password);
        }
      }
      this.logger.log(`Verified and synced ${redisDbs.length} Redis instances in kh-cloud-redis`);
    } catch (err: any) {
      this.logger.warn(`Failed to sync Redis instances: ${err.message}`);
    }
  }

  async createDatabase(data: {
    name: string;
    type: DatabaseType;
    teamId: string;
    projectId?: string;
  }) {
    // Check if database with this name already exists in this team
    const existing = await this.prisma.databaseInstance.findFirst({
      where: { teamId: data.teamId, name: data.name },
    });
    if (existing) {
      throw new BadRequestException(`A database named "${data.name}" already exists in your team workspace.`);
    }

    const teamPrefix = data.teamId ? data.teamId.substring(0, 8).toLowerCase().replace(/[^a-z0-9]/g, '') : 'kh';
    const cleanDbName = data.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    const baseDomain = process.env.BASE_DOMAIN || 'khawarahemad.com';
    const host = `${cleanDbName}-${teamPrefix}-${data.type.toLowerCase()}.db.${baseDomain}`;
    const port = data.type === 'POSTGRESQL' ? 5432 : data.type === 'REDIS' ? 6379 : 3306;
    const username = data.type === 'REDIS' ? `${cleanDbName}_user` : `${cleanDbName}_user`;
    const crypto = require('crypto');
    const password = crypto.randomBytes(32).toString('hex');
    const dbName = data.type === 'REDIS' ? '0' : `${data.name.toLowerCase()}_db`;

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

    if (data.type === 'POSTGRESQL') {
      await this.provisionPostgresDatabase(username, password, dbName);
    } else if (data.type === 'MYSQL') {
      await this.provisionMysqlDatabase(username, password, dbName);
    } else if (data.type === 'REDIS') {
      await this.provisionRedisDatabase(username, password);
    }

    // Provision complete
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
    const dbs = await this.prisma.databaseInstance.findMany({
      where: { teamId },
      include: { project: true },
    });
    return dbs;
  }

  async getDatabaseCredentials(id: string, teamId: string) {
    const db = await this.prisma.databaseInstance.findFirst({
      where: { id, teamId },
    });
    if (!db) throw new NotFoundException('Database not found.');
    if (db.type === 'POSTGRESQL') {
      await this.provisionPostgresDatabase(db.username, db.password, db.dbName);
    } else if (db.type === 'MYSQL') {
      await this.provisionMysqlDatabase(db.username, db.password, db.dbName);
    } else if (db.type === 'REDIS') {
      await this.provisionRedisDatabase(db.username || 'default', db.password);
    }
    return {
      host: db.host,
      port: db.port,
      username: db.username,
      password: db.password,
    };
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
        details: JSON.stringify({ name: db.name, type: db.type }),
      },
    });

    return { success: true };
  }

  private getPgClient(db: { dbName?: string | null; username?: string | null; password?: string | null }): PgClient {
    const isProd = process.env.NODE_ENV === 'production';
    const host = isProd ? 'postgres' : (process.env.POSTGRES_HOST || 'localhost');
    const port = parseInt(process.env.POSTGRES_PORT || '5432', 10);
    const user = db.username || process.env.POSTGRES_USER || 'khclouduser';
    const password = db.password || process.env.POSTGRES_PASSWORD || 'khcloudpassword';
    const database = db.dbName || 'postgres';

    return new PgClient({
      host,
      port,
      user,
      password,
      database,
      statement_timeout: 10000,
    });
  }

  private async getMysqlConnection(db: { dbName?: string | null; username?: string | null; password?: string | null }) {
    const isProd = process.env.NODE_ENV === 'production';
    const host = isProd ? 'mysql' : (process.env.MYSQL_HOST || 'localhost');
    const port = parseInt(process.env.MYSQL_PORT || '3306', 10);
    const user = db.username || process.env.MYSQL_USER || 'khclouduser';
    const password = db.password || process.env.MYSQL_PASSWORD || 'khcloudpassword';
    const database = db.dbName || undefined;

    return await mysql.createConnection({
      host,
      port,
      user,
      password,
      database,
      connectTimeout: 8000,
      multipleStatements: true,
    });
  }

  private getRedisClient(db: { username?: string | null; password?: string | null; port?: number | null }) {
    const isProd = process.env.NODE_ENV === 'production';
    const host = isProd ? 'redis' : (process.env.REDIS_HOST || 'localhost');
    const port = parseInt(process.env.REDIS_PORT || '6379', 10);
    const username = db.username || undefined;
    const password = db.password || undefined;

    return new Redis({
      host,
      port,
      username: username && username !== 'default' ? username : undefined,
      password: password || undefined,
      connectTimeout: 5000,
      lazyConnect: false,
      maxRetriesPerRequest: 1,
    });
  }

  private validateIdentifier(name: string, label = 'Identifier') {
    if (!name || typeof name !== 'string' || !/^[a-zA-Z0-9_]{1,64}$/.test(name)) {
      throw new BadRequestException(`Invalid ${label} "${name}". Only alphanumeric characters and underscores are allowed (1-64 chars).`);
    }
    return `"${name.replace(/"/g, '""')}"`;
  }

  private validateMysqlIdentifier(name: string, label = 'Identifier') {
    if (!name || typeof name !== 'string' || !/^[a-zA-Z0-9_]{1,64}$/.test(name)) {
      throw new BadRequestException(`Invalid ${label} "${name}". Only alphanumeric characters and underscores are allowed (1-64 chars).`);
    }
    return `\`${name.replace(/`/g, '``')}\``;
  }

  private buildPgWhereClause(filterStr: string): { clause: string; params: any[] } {
    if (!filterStr || !filterStr.trim()) return { clause: '', params: [] };
    try {
      const filters = JSON.parse(filterStr);
      if (!Array.isArray(filters) || filters.length === 0) return { clause: '', params: [] };
      
      const allowedOps = ['=', '!=', '>', '<', '>=', '<=', 'LIKE', 'ILIKE'];
      const clauses: string[] = [];
      const params: any[] = [];
      
      for (const f of filters) {
        if (!f.column || typeof f.column !== 'string' || !/^[a-zA-Z0-9_]{1,64}$/.test(f.column)) {
          throw new BadRequestException('Invalid column name in filter.');
        }
        if (!f.op || typeof f.op !== 'string' || !allowedOps.includes(f.op.toUpperCase())) {
          throw new BadRequestException('Invalid operator in filter.');
        }
        params.push(f.value);
        clauses.push(`"${f.column}" ${f.op.toUpperCase()} $${params.length}`);
      }
      
      return { clause: `WHERE ${clauses.join(' AND ')}`, params };
    } catch (e: any) {
      if (e instanceof BadRequestException) throw e;
      throw new BadRequestException('Filter must be a valid JSON array of objects with column, op, and value.');
    }
  }

  private buildMysqlWhereClause(filterStr: string): { clause: string; params: any[] } {
    if (!filterStr || !filterStr.trim()) return { clause: '', params: [] };
    try {
      const filters = JSON.parse(filterStr);
      if (!Array.isArray(filters) || filters.length === 0) return { clause: '', params: [] };
      
      const allowedOps = ['=', '!=', '>', '<', '>=', '<=', 'LIKE'];
      const clauses: string[] = [];
      const params: any[] = [];
      
      for (const f of filters) {
        if (!f.column || typeof f.column !== 'string' || !/^[a-zA-Z0-9_]{1,64}$/.test(f.column)) {
          throw new BadRequestException('Invalid column name in filter.');
        }
        if (!f.op || typeof f.op !== 'string' || !allowedOps.includes(f.op.toUpperCase())) {
          throw new BadRequestException('Invalid operator in filter.');
        }
        params.push(f.value);
        clauses.push(`${this.validateMysqlIdentifier(f.column)} ${f.op.toUpperCase()} ?`);
      }
      
      return { clause: `WHERE ${clauses.join(' AND ')}`, params };
    } catch (e: any) {
      if (e instanceof BadRequestException) throw e;
      throw new BadRequestException('Filter must be a valid JSON array of objects with column, op, and value.');
    }
  }

  async getTables(dbId: string, teamId: string) {
    const db = await this.prisma.databaseInstance.findFirst({
      where: { id: dbId, teamId },
    });
    if (!db) throw new NotFoundException('Database not found.');

    if (db.type === 'POSTGRESQL') {
      const pgClient = this.getPgClient(db);
      try {
        await pgClient.connect();
        const res = await pgClient.query(`
          SELECT table_name 
          FROM information_schema.tables 
          WHERE table_schema = 'public' 
            AND table_type = 'BASE TABLE'
          ORDER BY table_name;
        `);
        return res.rows.map((r: any) => r.table_name);
      } catch (err: any) {
        this.logger.error(`Failed to get PostgreSQL tables for ${db.dbName}: ${err.message}`);
        return [];
      } finally {
        await pgClient.end().catch(() => {});
      }
    }

    if (db.type === 'MYSQL') {
      let conn: any;
      try {
        conn = await this.getMysqlConnection(db);
        const [rows]: any = await conn.query('SHOW TABLES');
        return (rows || []).map((r: any) => Object.values(r)[0]);
      } catch (err: any) {
        this.logger.error(`Failed to get MySQL tables for ${db.dbName}: ${err.message}`);
        return [];
      } finally {
        if (conn) await conn.end().catch(() => {});
      }
    }

    if (db.type === 'REDIS') {
      return ['(All Keys)'];
    }

    return [];
  }

  async runQuery(dbId: string, teamId: string, sql: string) {
    const db = await this.prisma.databaseInstance.findFirst({
      where: { id: dbId, teamId },
    });
    if (!db) throw new NotFoundException('Database not found.');

    if (db.type === 'POSTGRESQL') {
      const pgClient = this.getPgClient(db);
      try {
        await pgClient.connect();
        const result = await pgClient.query(sql);

        if (Array.isArray(result)) {
          const last = result[result.length - 1];
          return {
            success: true,
            rows: last?.rows || [],
            columns: last?.fields ? last.fields.map((f: any) => f.name) : (last?.rows?.length > 0 ? Object.keys(last.rows[0]) : []),
            message: `Executed ${result.length} statement(s).`,
          };
        }

        const isSelect = result.command === 'SELECT';
        return {
          success: true,
          rows: result.rows || [],
          columns: result.fields ? result.fields.map((f: any) => f.name) : (result.rows?.length > 0 ? Object.keys(result.rows[0]) : []),
          affectedRows: result.rowCount || 0,
          message: isSelect
            ? `Query returned ${result.rows?.length || 0} row(s).`
            : `Query executed successfully (${result.command} ${result.rowCount || 0}).`,
        };
      } catch (err: any) {
        throw new BadRequestException(err.message);
      } finally {
        await pgClient.end().catch(() => {});
      }
    }

    if (db.type === 'MYSQL') {
      let conn: any;
      try {
        conn = await this.getMysqlConnection(db);
        const [result, fields]: any = await conn.query(sql);
        if (Array.isArray(result)) {
          return {
            success: true,
            rows: result,
            columns: fields ? fields.map((f: any) => f.name) : (result.length > 0 ? Object.keys(result[0]) : []),
            message: `Query returned ${result.length} row(s).`,
          };
        } else {
          return {
            success: true,
            affectedRows: result?.affectedRows || 0,
            lastInsertRowid: result?.insertId ? String(result.insertId) : undefined,
            message: `Query executed successfully (${result?.affectedRows || 0} row(s) affected).`,
          };
        }
      } catch (err: any) {
        throw new BadRequestException(err.message);
      } finally {
        if (conn) await conn.end().catch(() => {});
      }
    }

    if (db.type === 'REDIS') {
      const redis = this.getRedisClient(db);
      try {
        const parts = sql.trim().match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || [];
        const cleanParts = parts.map(p => p.replace(/^["']|["']$/g, ''));
        if (cleanParts.length === 0) throw new BadRequestException('Empty command.');
        const cmd = cleanParts[0].toLowerCase();
        const args = cleanParts.slice(1);
        const result = await (redis as any).call(cmd, ...args);
        let rows: any[] = [];
        let columns: string[] = ['result'];
        if (Array.isArray(result)) {
          rows = result.map((item, idx) => ({ index: idx + 1, item: typeof item === 'object' ? JSON.stringify(item) : String(item) }));
          columns = ['index', 'item'];
        } else if (typeof result === 'object' && result !== null) {
          rows = [result];
          columns = Object.keys(result);
        } else {
          rows = [{ command: sql.trim(), result: String(result) }];
          columns = ['command', 'result'];
        }
        return {
          success: true,
          rows,
          columns,
          message: `Command "${cmd.toUpperCase()}" executed successfully.`,
        };
      } catch (err: any) {
        throw new BadRequestException(err.message);
      } finally {
        redis.disconnect();
      }
    }

    throw new BadRequestException(`Database type "${db.type}" is not supported.`);
  }

  // ---- TABLE EDITOR METHODS ----

  async getTableSchema(dbId: string, teamId: string, tableName: string) {
    const db = await this.prisma.databaseInstance.findFirst({ where: { id: dbId, teamId } });
    if (!db) throw new NotFoundException('Database not found.');

    if (db.type === 'POSTGRESQL') {
      const safeTable = this.validateIdentifier(tableName, 'table name');
      const rawTable = tableName.replace(/"/g, '');
      const pgClient = this.getPgClient(db);
      try {
        await pgClient.connect();
        const colsRes = await pgClient.query(`
          SELECT 
            column_name as name, 
            data_type as type, 
            is_nullable = 'NO' as notnull, 
            column_default as dflt_value,
            ordinal_position as cid
          FROM information_schema.columns 
          WHERE table_schema = 'public' AND table_name = $1
          ORDER BY ordinal_position;
        `, [rawTable]);

        const pkRes = await pgClient.query(`
          SELECT kcu.column_name
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name = kcu.constraint_name
            AND tc.table_schema = kcu.table_schema
          WHERE tc.constraint_type = 'PRIMARY KEY'
            AND tc.table_schema = 'public'
            AND tc.table_name = $1
          ORDER BY kcu.ordinal_position;
        `, [rawTable]);

        const pkCols = new Set(pkRes.rows.map((r: any) => r.column_name));
        const primaryKey = pkRes.rows[0]?.column_name || colsRes.rows[0]?.name || 'id';

        return {
          columns: colsRes.rows.map((c: any) => ({
            cid: c.cid,
            name: c.name,
            type: c.type,
            notnull: c.notnull,
            dflt_value: c.dflt_value,
            pk: pkCols.has(c.name),
          })),
          primaryKey,
        };
      } catch (err: any) {
        this.logger.error(`Failed to get PostgreSQL schema for ${rawTable}: ${err.message}`);
        throw new BadRequestException(`Failed to read schema for table "${tableName}": ${err.message}`);
      } finally {
        await pgClient.end().catch(() => {});
      }
    }

    if (db.type === 'MYSQL') {
      let conn: any;
      try {
        conn = await this.getMysqlConnection(db);
        const safeTable = this.validateMysqlIdentifier(tableName, 'table name');
        const [cols]: any = await conn.query(`DESCRIBE ${safeTable}`);
        const columns = (cols || []).map((c: any, idx: number) => ({
          cid: idx,
          name: c.Field,
          type: c.Type,
          notnull: c.Null === 'NO',
          dflt_value: c.Default,
          pk: c.Key === 'PRI',
        }));
        const pk = columns.find((c: any) => c.pk)?.name || columns[0]?.name || 'id';
        return { columns, primaryKey: pk };
      } catch (err: any) {
        this.logger.error(`Failed to get MySQL schema for ${tableName}: ${err.message}`);
        throw new BadRequestException(`Failed to read schema for table "${tableName}": ${err.message}`);
      } finally {
        if (conn) await conn.end().catch(() => {});
      }
    }

    if (db.type === 'REDIS') {
      return {
        columns: [
          { cid: 0, name: 'key', type: 'string', notnull: true, pk: true },
          { cid: 1, name: 'type', type: 'string', notnull: true, pk: false },
          { cid: 2, name: 'ttl', type: 'string', notnull: false, pk: false },
          { cid: 3, name: 'value', type: 'text', notnull: false, pk: false },
        ],
        primaryKey: 'key',
      };
    }

    return { columns: [], primaryKey: 'id' };
  }

  async getTableRows(dbId: string, teamId: string, tableName: string, page = 1, pageSize = 50, filter = '') {
    const db = await this.prisma.databaseInstance.findFirst({ where: { id: dbId, teamId } });
    if (!db) throw new NotFoundException('Database not found.');

    if (db.type === 'POSTGRESQL') {
      const safeTable = this.validateIdentifier(tableName, 'table name');
      const pgClient = this.getPgClient(db);
      try {
        await pgClient.connect();
        const { clause: whereClause, params: whereParams } = this.buildPgWhereClause(filter);
        
        const countSql = `SELECT COUNT(*) as cnt FROM ${safeTable} ${whereClause}`;
        const countRes = await pgClient.query(countSql, whereParams);
        const total = parseInt(countRes.rows[0]?.cnt || '0', 10);

        const offset = (page - 1) * pageSize;
        const limitParamIndex = whereParams.length + 1;
        const offsetParamIndex = whereParams.length + 2;
        const querySql = `SELECT * FROM ${safeTable} ${whereClause} LIMIT $${limitParamIndex} OFFSET $${offsetParamIndex}`;
        const queryParams = [...whereParams, pageSize, offset];

        const rowsRes = await pgClient.query(querySql, queryParams);
        const rows = rowsRes.rows;
        const columns = rowsRes.fields ? rowsRes.fields.map((f: any) => f.name) : (rows.length > 0 ? Object.keys(rows[0]) : []);

        return {
          rows,
          columns,
          total,
          page,
          pageSize,
        };
      } catch (err: any) {
        this.logger.error(`Failed to get PostgreSQL rows for ${safeTable}: ${err.message}`);
        throw new BadRequestException(`Failed to fetch rows for table "${tableName}": ${err.message}`);
      } finally {
        await pgClient.end().catch(() => {});
      }
    }

    if (db.type === 'MYSQL') {
      let conn: any;
      try {
        conn = await this.getMysqlConnection(db);
        const safeTable = this.validateMysqlIdentifier(tableName, 'table name');
        const { clause: whereClause, params: whereParams } = this.buildMysqlWhereClause(filter);
        const [countRes]: any = await conn.query(`SELECT COUNT(*) as cnt FROM ${safeTable} ${whereClause}`, whereParams);
        const total = countRes[0]?.cnt ? parseInt(countRes[0].cnt, 10) : 0;

        const offset = (page - 1) * pageSize;
        const [rows]: any = await conn.query(`SELECT * FROM ${safeTable} ${whereClause} LIMIT ? OFFSET ?`, [...whereParams, pageSize, offset]);
        const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

        return {
          rows,
          columns,
          total,
          page,
          pageSize,
        };
      } catch (err: any) {
        this.logger.error(`Failed to get MySQL rows for ${tableName}: ${err.message}`);
        throw new BadRequestException(`Failed to fetch rows for table "${tableName}": ${err.message}`);
      } finally {
        if (conn) await conn.end().catch(() => {});
      }
    }

    if (db.type === 'REDIS') {
      const redis = this.getRedisClient(db);
      try {
        const matchPattern = filter?.trim() ? `*${filter.trim()}*` : '*';
        const keys = await redis.keys(matchPattern);
        keys.sort();
        const total = keys.length;
        const offset = (page - 1) * pageSize;
        const pageKeys = keys.slice(offset, offset + pageSize);
        const rows = [];
        for (const k of pageKeys) {
          const type = await redis.type(k);
          const ttl = await redis.ttl(k);
          let val = '';
          try {
            if (type === 'string') val = (await redis.get(k)) || '';
            else if (type === 'hash') val = JSON.stringify(await redis.hgetall(k));
            else if (type === 'list') val = JSON.stringify(await redis.lrange(k, 0, 10));
            else if (type === 'set') val = JSON.stringify(await redis.smembers(k));
            else val = `[${type}]`;
          } catch {
            val = `[${type}]`;
          }
          rows.push({
            key: k,
            type,
            ttl: ttl >= 0 ? `${ttl}s` : (ttl === -1 ? 'None' : 'Expired'),
            value: val,
          });
        }
        return {
          rows,
          columns: ['key', 'type', 'ttl', 'value'],
          total,
          page,
          pageSize,
        };
      } catch (err: any) {
        this.logger.error(`Failed to get Redis keys for ${db.name}: ${err.message}`);
        throw new BadRequestException(`Failed to fetch Redis keys: ${err.message}`);
      } finally {
        redis.disconnect();
      }
    }

    return { rows: [], columns: [], total: 0, page, pageSize };
  }

  async insertRow(dbId: string, teamId: string, tableName: string, data: Record<string, any>) {
    const db = await this.prisma.databaseInstance.findFirst({ where: { id: dbId, teamId } });
    if (!db) throw new NotFoundException('Database not found.');

    if (db.type === 'POSTGRESQL') {
      const safeTable = this.validateIdentifier(tableName, 'table name');
      const pgClient = this.getPgClient(db);
      try {
        await pgClient.connect();
        const keys = Object.keys(data).filter(k => data[k] !== undefined && data[k] !== '');
        if (keys.length === 0) throw new BadRequestException('No data provided for insert.');
        const safeCols = keys.map(k => this.validateIdentifier(k, 'column name')).join(', ');
        const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
        const values = keys.map(k => data[k]);
        const res = await pgClient.query(
          `INSERT INTO ${safeTable} (${safeCols}) VALUES (${placeholders}) RETURNING *`,
          values
        );
        return { success: true, lastInsertRowid: res.rows[0]?.id?.toString() || '1' };
      } catch (err: any) {
        throw new BadRequestException(err.message);
      } finally {
        await pgClient.end().catch(() => {});
      }
    }

    if (db.type === 'MYSQL') {
      let conn: any;
      try {
        conn = await this.getMysqlConnection(db);
        const safeTable = this.validateMysqlIdentifier(tableName, 'table name');
        const keys = Object.keys(data).filter(k => data[k] !== undefined && data[k] !== '');
        if (keys.length === 0) throw new BadRequestException('No data provided for insert.');
        const safeCols = keys.map(k => this.validateMysqlIdentifier(k, 'column name')).join(', ');
        const placeholders = keys.map(() => '?').join(', ');
        const values = keys.map(k => data[k]);
        const [res]: any = await conn.query(`INSERT INTO ${safeTable} (${safeCols}) VALUES (${placeholders})`, values);
        return { success: true, lastInsertRowid: res.insertId?.toString() || '1' };
      } catch (err: any) {
        throw new BadRequestException(err.message);
      } finally {
        if (conn) await conn.end().catch(() => {});
      }
    }

    if (db.type === 'REDIS') {
      const redis = this.getRedisClient(db);
      try {
        const key = data.key || data.Key;
        if (!key) throw new BadRequestException('A key name is required to insert into Redis.');
        const val = data.value !== undefined ? String(data.value) : '';
        await redis.set(key, val);
        return { success: true, lastInsertRowid: key };
      } catch (err: any) {
        throw new BadRequestException(err.message);
      } finally {
        redis.disconnect();
      }
    }

    throw new BadRequestException(`Database type "${db.type}" is not supported.`);
  }

  async updateRow(dbId: string, teamId: string, tableName: string, primaryKey: string, pkValue: any, data: Record<string, any>) {
    const db = await this.prisma.databaseInstance.findFirst({ where: { id: dbId, teamId } });
    if (!db) throw new NotFoundException('Database not found.');

    if (db.type === 'POSTGRESQL') {
      const safeTable = this.validateIdentifier(tableName, 'table name');
      const safePk = this.validateIdentifier(primaryKey, 'primary key');
      const pgClient = this.getPgClient(db);
      try {
        await pgClient.connect();
        const keys = Object.keys(data).filter(k => k !== primaryKey);
        if (keys.length === 0) throw new BadRequestException('No fields to update.');
        const setClauses = keys.map((k, i) => `${this.validateIdentifier(k, 'column name')} = $${i + 1}`).join(', ');
        const values = [...keys.map(k => data[k]), pkValue];
        const res = await pgClient.query(
          `UPDATE ${safeTable} SET ${setClauses} WHERE ${safePk} = $${values.length}`,
          values
        );
        return { success: true, affectedRows: res.rowCount || 0 };
      } catch (err: any) {
        throw new BadRequestException(err.message);
      } finally {
        await pgClient.end().catch(() => {});
      }
    }

    if (db.type === 'MYSQL') {
      let conn: any;
      try {
        conn = await this.getMysqlConnection(db);
        const safeTable = this.validateMysqlIdentifier(tableName, 'table name');
        const safePk = this.validateMysqlIdentifier(primaryKey, 'primary key');
        const keys = Object.keys(data).filter(k => k !== primaryKey);
        if (keys.length === 0) throw new BadRequestException('No fields to update.');
        const setClauses = keys.map(k => `${this.validateMysqlIdentifier(k, 'column name')} = ?`).join(', ');
        const values = [...keys.map(k => data[k]), pkValue];
        const [res]: any = await conn.query(`UPDATE ${safeTable} SET ${setClauses} WHERE ${safePk} = ?`, values);
        return { success: true, affectedRows: res.affectedRows || 0 };
      } catch (err: any) {
        throw new BadRequestException(err.message);
      } finally {
        if (conn) await conn.end().catch(() => {});
      }
    }

    if (db.type === 'REDIS') {
      const redis = this.getRedisClient(db);
      try {
        const val = data.value !== undefined ? String(data.value) : '';
        await redis.set(pkValue, val);
        return { success: true, affectedRows: 1 };
      } catch (err: any) {
        throw new BadRequestException(err.message);
      } finally {
        redis.disconnect();
      }
    }

    throw new BadRequestException(`Database type "${db.type}" is not supported.`);
  }

  async deleteRow(dbId: string, teamId: string, tableName: string, primaryKey: string, pkValue: any) {
    const db = await this.prisma.databaseInstance.findFirst({ where: { id: dbId, teamId } });
    if (!db) throw new NotFoundException('Database not found.');

    if (db.type === 'POSTGRESQL') {
      const safeTable = this.validateIdentifier(tableName, 'table name');
      const safePk = this.validateIdentifier(primaryKey, 'primary key');
      const pgClient = this.getPgClient(db);
      try {
        await pgClient.connect();
        const res = await pgClient.query(
          `DELETE FROM ${safeTable} WHERE ${safePk} = $1`,
          [pkValue]
        );
        return { success: true, affectedRows: res.rowCount || 0 };
      } catch (err: any) {
        throw new BadRequestException(err.message);
      } finally {
        await pgClient.end().catch(() => {});
      }
    }

    if (db.type === 'MYSQL') {
      let conn: any;
      try {
        conn = await this.getMysqlConnection(db);
        const safeTable = this.validateMysqlIdentifier(tableName, 'table name');
        const safePk = this.validateMysqlIdentifier(primaryKey, 'primary key');
        const [res]: any = await conn.query(`DELETE FROM ${safeTable} WHERE ${safePk} = ?`, [pkValue]);
        return { success: true, affectedRows: res.affectedRows || 0 };
      } catch (err: any) {
        throw new BadRequestException(err.message);
      } finally {
        if (conn) await conn.end().catch(() => {});
      }
    }

    if (db.type === 'REDIS') {
      const redis = this.getRedisClient(db);
      try {
        const res = await redis.del(pkValue);
        return { success: true, affectedRows: res };
      } catch (err: any) {
        throw new BadRequestException(err.message);
      } finally {
        redis.disconnect();
      }
    }

    throw new BadRequestException(`Database type "${db.type}" is not supported.`);
  }

  async getDatabaseNetworkRules(dbId: string, teamId: string, clientIp?: string) {
    const db = await this.prisma.databaseInstance.findFirst({ where: { id: dbId, teamId } });
    if (!db) throw new NotFoundException('Database not found.');

    let rules: Array<{ ip: string; description: string; addedAt?: string }> = [];
    if (db.allowedIps) {
      try {
        rules = JSON.parse(db.allowedIps);
      } catch {
        rules = db.allowedIps.split(',').map((ip: string) => ({
          ip: ip.trim(),
          description: ip.trim() === '0.0.0.0/0' ? 'Allow All Traffic' : 'Allowed IP',
          addedAt: db.createdAt.toISOString(),
        })).filter(r => r.ip);
      }
    }

    if (!rules || rules.length === 0) {
      rules = [
        {
          ip: '0.0.0.0/0',
          description: 'Allow All Traffic (Default)',
          addedAt: db.createdAt.toISOString(),
        },
      ];
    }

    const isAllowAll = rules.some(r => r.ip === '0.0.0.0/0' || r.ip === '::/0');

    return {
      databaseId: db.id,
      databaseName: db.name,
      databaseType: db.type,
      port: db.port,
      host: db.host,
      isAllowAll,
      rules,
      clientIp: clientIp || '127.0.0.1',
    };
  }

  async updateDatabaseNetworkRules(
    dbId: string,
    teamId: string,
    rules: Array<{ ip: string; description?: string }>,
  ) {
    const db = await this.prisma.databaseInstance.findFirst({ where: { id: dbId, teamId } });
    if (!db) throw new NotFoundException('Database not found.');

    if (!Array.isArray(rules)) {
      throw new BadRequestException('Rules must be an array of IP specifications.');
    }

    const cleanRules = rules.map(r => {
      const ip = (r.ip || '').trim();
      if (!ip) throw new BadRequestException('IP address or CIDR cannot be empty.');
      const ipPattern = /^([0-9a-fA-F:.]+(\/[0-9]{1,3})?)$/;
      if (!ipPattern.test(ip)) {
        throw new BadRequestException(`Invalid IP or CIDR address format: ${ip}`);
      }
      return {
        ip,
        description: (r.description || '').trim() || (ip === '0.0.0.0/0' ? 'Allow All Traffic' : 'Allowed IP'),
        addedAt: new Date().toISOString(),
      };
    });

    const serialized = JSON.stringify(cleanRules);

    await this.prisma.databaseInstance.update({
      where: { id: dbId, teamId },
      data: { allowedIps: serialized },
    });

    await this.prisma.auditLog.create({
      data: {
        teamId,
        action: 'DATABASE.UPDATE_NETWORK_RULES',
        targetType: 'DATABASE',
        targetId: dbId,
        details: JSON.stringify({
          databaseName: db.name,
          ruleCount: cleanRules.length,
          rules: cleanRules.map(r => r.ip),
        }),
      },
    });

    sendDiscordNotification(teamId, 'database', {
      title: `🛡️ Database Firewall Updated: ${db.name}`,
      description: `Updated network access rules for **${db.name}** (${cleanRules.length} allowed rule${cleanRules.length === 1 ? '' : 's'}).`,
      color: 3899904,
      fields: [
        { name: 'Rules', value: cleanRules.map(r => `\`${r.ip}\``).slice(0, 5).join(', ') || 'None', inline: false }
      ]
    });

    return {
      success: true,
      rules: cleanRules,
      isAllowAll: cleanRules.some(r => r.ip === '0.0.0.0/0' || r.ip === '::/0'),
    };
  }

  async provisionPostgresDatabase(username?: string | null, password?: string | null, dbName?: string | null): Promise<boolean> {
    if (!username || !password || !dbName) return false;
    try {
      const { exec } = require('child_process');
      const util = require('util');
      const execAsync = util.promisify(exec);

      const safeUser = username.replace(/[^a-zA-Z0-9_]/g, '');
      const safeDb = dbName.replace(/[^a-zA-Z0-9_]/g, '');
      const safePass = password.replace(/'/g, "''");

      const isSuperUser = safeUser.toLowerCase() === (process.env.POSTGRES_USER || 'khclouduser').toLowerCase() || safeUser.toLowerCase() === 'postgres';
      const roleScript = isSuperUser
        ? `-- Superuser "${safeUser}" is managed by platform environment; preserve credentials`
        : `
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '${safeUser}') THEN
    CREATE ROLE "${safeUser}" WITH LOGIN PASSWORD '${safePass}' CREATEDB;
  ELSE
    ALTER ROLE "${safeUser}" WITH LOGIN PASSWORD '${safePass}' CREATEDB;
  END IF;
END
$$;`;

      const sqlScript = `
${roleScript}

SELECT 'CREATE DATABASE "${safeDb}" OWNER "${safeUser}"'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${safeDb}')\\gexec

GRANT ALL PRIVILEGES ON DATABASE "${safeDb}" TO "${safeUser}";
ALTER DATABASE "${safeDb}" OWNER TO "${safeUser}";

\\c "${safeDb}"
GRANT ALL ON SCHEMA public TO "${safeUser}";
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO "${safeUser}";
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO "${safeUser}";
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO "${safeUser}";
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO "${safeUser}";
`;

      const base64Sql = Buffer.from(sqlScript).toString('base64');

      const shellScript = `
echo '${base64Sql}' | base64 -d > /tmp/provision_${safeUser}.sql
PUSER="\${POSTGRES_USER:-khclouduser}"
PPASS="\${POSTGRES_PASSWORD:-khcloudpassword}"
PDB="\${POSTGRES_DB:-postgres}"
export PGPASSWORD="$PPASS"

psql -U "$PUSER" -d "$PDB" -f /tmp/provision_${safeUser}.sql 2>/dev/null || \\
psql -U postgres -d postgres -f /tmp/provision_${safeUser}.sql 2>/dev/null || \\
psql -U khclouduser -d khclouddb -f /tmp/provision_${safeUser}.sql 2>/dev/null || \\
psql -U "$PUSER" -d postgres -f /tmp/provision_${safeUser}.sql

rm -f /tmp/provision_${safeUser}.sql
`;

      const base64Shell = Buffer.from(shellScript).toString('base64');
      const cmd = `docker exec -i kh-cloud-postgres sh -c "echo '${base64Shell}' | base64 -d | sh"`;

      await execAsync(cmd, { timeout: 15000 });
      this.logger.log(`Provisioned PostgreSQL user "${safeUser}" and database "${safeDb}" in kh-cloud-postgres`);
      return true;
    } catch (e: any) {
      this.logger.warn(`Postgres provision note for ${username}: ${e.message}`);
      return false;
    }
  }

  async provisionMysqlDatabase(username?: string | null, password?: string | null, dbName?: string | null): Promise<boolean> {
    if (!username || !password || !dbName) return false;
    try {
      const { exec } = require('child_process');
      const util = require('util');
      const execAsync = util.promisify(exec);

      const safeUser = username.replace(/[^a-zA-Z0-9_]/g, '');
      const safeDb = dbName.replace(/[^a-zA-Z0-9_]/g, '');
      const safePass = password.replace(/'/g, "''");

      if (safeUser === 'root') return true;

      const sql = `
CREATE DATABASE IF NOT EXISTS \\\`${safeDb}\\\`;
CREATE USER IF NOT EXISTS '${safeUser}'@'%' IDENTIFIED WITH mysql_native_password BY '${safePass}';
ALTER USER '${safeUser}'@'%' IDENTIFIED WITH mysql_native_password BY '${safePass}';
GRANT ALL PRIVILEGES ON \\\`${safeDb}\\\`.* TO '${safeUser}'@'%';
FLUSH PRIVILEGES;
`;
      const rootPass = process.env.MYSQL_ROOT_PASSWORD || 'khcloudrootpassword';
      const oneLine = sql.replace(/\n/g, ' ').replace(/"/g, '\\"');
      const cmd = `docker exec -i kh-cloud-mysql mysql -uroot -p"${rootPass}" -e "${oneLine}"`;

      await execAsync(cmd, { timeout: 15000 });
      this.logger.log(`Provisioned MySQL user "${safeUser}" and database "${safeDb}" in kh-cloud-mysql`);
      return true;
    } catch (e: any) {
      this.logger.warn(`MySQL provision note for ${username}: ${e.message}`);
      return false;
    }
  }

  async provisionRedisDatabase(username?: string | null, password?: string | null): Promise<boolean> {
    if (!password) return false;
    try {
      const { exec } = require('child_process');
      const util = require('util');
      const execAsync = util.promisify(exec);

      const safeUser = (username || 'default').replace(/[^a-zA-Z0-9_]/g, '');
      const safePass = password.replace(/["\\]/g, '');

      // In Redis 7, configure ACL for this instance user
      const cmd = `docker exec -i kh-cloud-redis redis-cli ACL SETUSER ${safeUser} on >"${safePass}" ~* &* +@all`;
      await execAsync(cmd, { timeout: 10000 });
      this.logger.log(`Provisioned Redis ACL user "${safeUser}" in kh-cloud-redis`);
      return true;
    } catch (e: any) {
      this.logger.warn(`Redis provision note for ${username}: ${e.message}`);
      return false;
    }
  }
}
