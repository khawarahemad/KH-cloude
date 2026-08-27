import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  S3Client,
  CreateBucketCommand,
  DeleteBucketCommand,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import sharp from 'sharp';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

function inferContentType(key: string, fallback = 'application/octet-stream'): string {
  const ext = path.extname(key).toLowerCase();
  const map: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.avif': 'image/avif',
    '.ico': 'image/x-icon',
    '.bmp': 'image/bmp',
    '.pdf': 'application/pdf',
    '.txt': 'text/plain; charset=utf-8',
    '.md': 'text/markdown; charset=utf-8',
    '.csv': 'text/csv; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.xml': 'application/xml',
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.ts': 'application/typescript; charset=utf-8',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.zip': 'application/zip',
    '.gz': 'application/gzip',
    '.tar': 'application/x-tar',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };
  return map[ext] || fallback;
}

@Injectable()
export class StorageService {
  private s3Client: S3Client | null = null;
  private readonly logger = new Logger(StorageService.name);
  private useMock = false;
  private mockStoragePath = path.join(process.cwd(), 'local-storage');

  constructor(private prisma: PrismaService) {
    this.initS3();
  }

  private async initS3() {
    let endpoint =
      process.env.MINIO_INTERNAL_ENDPOINT ||
      process.env.STORAGE_ENDPOINT ||
      process.env.MINIO_ENDPOINT ||
      'http://minio:9000';

    // If endpoint points to external domain in production Docker, route internally to minio container
    const baseDomain = process.env.BASE_DOMAIN || 'khawarahemad.com';
    if ((endpoint.includes(`storage.${baseDomain}`) || endpoint.includes('storage.khawarahemad.com')) && process.env.NODE_ENV === 'production') {
      endpoint = 'http://minio:9000';
    }

    const accessKey =
      process.env.STORAGE_ACCESS_KEY ||
      process.env.MINIO_ACCESS_KEY ||
      process.env.MINIO_ROOT_USER ||
      'khcloudroot';

    const secretKey =
      process.env.STORAGE_SECRET_KEY ||
      process.env.MINIO_SECRET_KEY ||
      process.env.MINIO_ROOT_PASSWORD ||
      'khcloudrootpassword';

    const region =
      process.env.STORAGE_REGION ||
      process.env.MINIO_REGION ||
      'us-east-1';

    try {
      this.s3Client = new S3Client({
        endpoint,
        region,
        credentials: {
          accessKeyId: accessKey,
          secretAccessKey: secretKey,
        },
        forcePathStyle: true,
      });

      if (!fs.existsSync(this.mockStoragePath)) {
        fs.mkdirSync(this.mockStoragePath, { recursive: true });
      }

      // Quick healthcheck to verify S3 connection
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2000);
      await this.s3Client.send(new ListObjectsV2Command({ Bucket: 'healthcheck' }), {
        abortSignal: controller.signal,
      }).catch((e) => {
        if (e.name !== 'NoSuchBucket' && !e.message?.includes('NoSuchBucket')) {
          this.logger.warn(`MinIO connection note: ${e.message}`);
        }
      });
      clearTimeout(timeout);
    } catch (err) {
      this.useMock = true;
      this.logger.warn('Failed to connect to MinIO. Using local mock storage.');
    }
  }

  getPhysicalBucketName(bucket: { id: string; teamId: string; name: string }): string {
    const cleanName = bucket.name.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    const prefix = bucket.teamId ? bucket.teamId.substring(0, 8).toLowerCase().replace(/[^a-z0-9]/g, '') : 'kh';
    return `kh-${prefix}-${cleanName}`.substring(0, 63);
  }

  async createBucket(name: string, isPublic: boolean, teamId: string) {
    if (!/^[a-z0-9.-]{3,63}$/.test(name)) {
      throw new BadRequestException('Bucket name must be 3-63 characters, lowercase letters, numbers, dots, or hyphens.');
    }

    const existing = await this.prisma.bucket.findFirst({
      where: { teamId, name },
    });
    if (existing) {
      throw new BadRequestException('A bucket with this name already exists in your workspace.');
    }

    const bucket = await this.prisma.bucket.create({
      data: {
        name,
        isPublic,
        teamId,
        sizeUsed: BigInt(0),
        status: 'ACTIVE',
      },
    });

    const physicalName = this.getPhysicalBucketName(bucket);

    if (this.useMock) {
      const bucketDir = path.join(this.mockStoragePath, `${teamId}_${name}`);
      if (!fs.existsSync(bucketDir)) {
        fs.mkdirSync(bucketDir, { recursive: true });
      }
    } else {
      try {
        await this.s3Client!.send(new CreateBucketCommand({ Bucket: physicalName }));
      } catch (err) {
        this.logger.error(`MinIO createBucket error for ${physicalName}:`, err);
      }
    }

    await this.prisma.auditLog.create({
      data: {
        teamId,
        action: 'BUCKET.CREATE',
        targetType: 'BUCKET',
        targetId: bucket.id,
        details: JSON.stringify({ name, isPublic }),
      },
    });

    return {
      ...bucket,
      sizeLimit: bucket.sizeLimit.toString(),
      sizeUsed: bucket.sizeUsed.toString(),
    };
  }

  async getBuckets(teamId: string) {
    const buckets = await this.prisma.bucket.findMany({
      where: { teamId },
      include: {
        _count: {
          select: { objects: { where: { isFolder: false } } },
        },
      },
    });

    return buckets.map((b) => ({
      ...b,
      sizeLimit: b.sizeLimit.toString(),
      sizeUsed: b.sizeUsed.toString(),
      fileCount: b._count.objects,
    }));
  }

  async deleteBucket(id: string, teamId: string) {
    const bucket = await this.prisma.bucket.findFirst({
      where: { id, teamId },
    });

    if (!bucket) {
      throw new BadRequestException('Bucket not found.');
    }

    const fileCount = await this.prisma.objectMetadata.count({
      where: { bucketId: id, isFolder: false },
    });

    if (fileCount > 0) {
      throw new BadRequestException('Bucket must be empty before deleting.');
    }

    await this.prisma.bucket.delete({ where: { id } });

    const physicalName = this.getPhysicalBucketName(bucket);

    if (this.useMock) {
      const dir1 = path.join(this.mockStoragePath, `${bucket.teamId}_${bucket.name}`);
      const dir2 = path.join(this.mockStoragePath, bucket.name);
      if (fs.existsSync(dir1)) fs.rmSync(dir1, { recursive: true, force: true });
      if (fs.existsSync(dir2)) fs.rmSync(dir2, { recursive: true, force: true });
    } else {
      try {
        await this.s3Client!.send(new DeleteBucketCommand({ Bucket: physicalName }));
      } catch (err) {
        this.logger.error(`MinIO deleteBucket error for ${physicalName}:`, err);
      }
    }

    await this.prisma.auditLog.create({
      data: {
        teamId,
        action: 'BUCKET.DELETE',
        targetType: 'BUCKET',
        targetId: id,
        details: JSON.stringify({ name: bucket.name }),
      },
    });

    return { success: true };
  }

  async uploadFile(
    bucketId: string,
    key: string,
    fileBuffer: Buffer,
    contentType: string,
    fileName: string,
    teamId: string,
  ) {
    const bucket = await this.prisma.bucket.findUnique({
      where: { id: bucketId },
    });

    if (!bucket) {
      throw new BadRequestException('Bucket not found.');
    }

    let finalContentType = contentType;
    if (!finalContentType || finalContentType === 'application/octet-stream') {
      finalContentType = inferContentType(key || fileName);
    }

    const isFolderPlaceholder = key.endsWith('/') || fileName === '.placeholder';
    const fileSize = fileBuffer.length;

    const existingFile = await this.prisma.objectMetadata.findUnique({
      where: { bucketId_key: { bucketId, key } },
    });
    const oldSize = existingFile ? existingFile.size : BigInt(0);

    const projectedSize = bucket.sizeUsed - oldSize + BigInt(fileSize);
    if (projectedSize > bucket.sizeLimit) {
      throw new BadRequestException(
        `Upload exceeds bucket storage limit. Limit: ${(Number(bucket.sizeLimit) / (1024 * 1024)).toFixed(2)}MB, Projected: ${(Number(projectedSize) / (1024 * 1024)).toFixed(2)}MB.`,
      );
    }

    const physicalName = this.getPhysicalBucketName(bucket);

    // Save binary into S3 / MinIO or local fallback
    if (this.useMock) {
      const bucketDir = path.join(this.mockStoragePath, `${bucket.teamId}_${bucket.name}`);
      if (!fs.existsSync(bucketDir)) {
        fs.mkdirSync(bucketDir, { recursive: true });
      }
      const filePath = path.join(bucketDir, key.replace(/\//g, '_'));
      fs.writeFileSync(filePath, fileBuffer);
    } else {
      try {
        await this.s3Client!.send(
          new PutObjectCommand({
            Bucket: physicalName,
            Key: key,
            Body: fileBuffer,
            ContentType: finalContentType,
          }),
        );
      } catch (err: any) {
        this.logger.error(`MinIO putObject error for ${key}:`, err);
        // Fallback write to local storage to guarantee 0 data loss
        const bucketDir = path.join(this.mockStoragePath, `${bucket.teamId}_${bucket.name}`);
        if (!fs.existsSync(bucketDir)) {
          fs.mkdirSync(bucketDir, { recursive: true });
        }
        const filePath = path.join(bucketDir, key.replace(/\//g, '_'));
        fs.writeFileSync(filePath, fileBuffer);
      }
    }

    // Save metadata in SQLite
    const etag = Math.random().toString(36).substring(2, 15);
    const objectMeta = await this.prisma.objectMetadata.upsert({
      where: {
        bucketId_key: { bucketId, key },
      },
      update: {
        size: BigInt(fileSize),
        contentType: finalContentType,
        etag,
        updatedAt: new Date(),
      },
      create: {
        bucketId,
        key,
        size: BigInt(fileSize),
        contentType: finalContentType,
        etag,
        isFolder: isFolderPlaceholder,
        parentKey: this.getParentKey(key),
      },
    });

    // Update bucket size used
    const totalSize = await this.prisma.objectMetadata.aggregate({
      where: { bucketId },
      _sum: { size: true },
    });

    await this.prisma.bucket.update({
      where: { id: bucketId },
      data: { sizeUsed: totalSize._sum.size || BigInt(0) },
    });

    await this.prisma.auditLog.create({
      data: {
        teamId,
        action: 'BUCKET.FILE_UPLOAD',
        targetType: 'BUCKET',
        targetId: bucketId,
        details: JSON.stringify({ key, size: fileSize, contentType: finalContentType }),
      },
    });

    return {
      ...objectMeta,
      size: objectMeta.size.toString(),
    };
  }

  async getFile(bucketId: string, key: string) {
    const bucket = await this.prisma.bucket.findUnique({ where: { id: bucketId } });
    if (!bucket) throw new BadRequestException('Bucket not found.');

    const physicalName = this.getPhysicalBucketName(bucket);

    // 1. Try S3 / MinIO if not forced mock
    if (!this.useMock && this.s3Client) {
      try {
        const response = await this.s3Client.send(
          new GetObjectCommand({
            Bucket: physicalName,
            Key: key,
          }),
        );
        const streamToBuffer = (stream: any): Promise<Buffer> =>
          new Promise((resolve, reject) => {
            const chunks: any[] = [];
            stream.on('data', (chunk: any) => chunks.push(chunk));
            stream.on('error', reject);
            stream.on('end', () => resolve(Buffer.concat(chunks)));
          });
        return await streamToBuffer(response.Body);
      } catch (err: any) {
        // Fallback to check legacy bucket name in MinIO
        try {
          const legacyResponse = await this.s3Client.send(
            new GetObjectCommand({
              Bucket: bucket.name,
              Key: key,
            }),
          );
          const streamToBuffer = (stream: any): Promise<Buffer> =>
            new Promise((resolve, reject) => {
              const chunks: any[] = [];
              stream.on('data', (chunk: any) => chunks.push(chunk));
              stream.on('error', reject);
              stream.on('end', () => resolve(Buffer.concat(chunks)));
            });
          return await streamToBuffer(legacyResponse.Body);
        } catch {
          // Continue to local storage fallback
        }
      }
    }

    // 2. Check local storage
    const file1 = path.join(this.mockStoragePath, `${bucket.teamId}_${bucket.name}`, key.replace(/\//g, '_'));
    const file2 = path.join(this.mockStoragePath, bucket.name, key.replace(/\//g, '_'));
    if (fs.existsSync(file1)) return fs.readFileSync(file1);
    if (fs.existsSync(file2)) return fs.readFileSync(file2);

    throw new BadRequestException(`File "${key}" not found in storage.`);
  }

  async getFileByBucketName(bucketName: string, key: string, teamId?: string) {
    let bucket = null;
    if (teamId) {
      bucket = await this.prisma.bucket.findFirst({ where: { teamId, name: bucketName } });
    }
    if (!bucket) {
      bucket = await this.prisma.bucket.findFirst({ where: { name: bucketName } });
    }
    if (!bucket) throw new BadRequestException(`Bucket "${bucketName}" not found.`);
    const buffer = await this.getFile(bucket.id, key);
    return { bucket, buffer };
  }

  async deleteFile(bucketId: string, key: string, teamId: string) {
    const bucket = await this.prisma.bucket.findUnique({ where: { id: bucketId } });
    if (!bucket) throw new BadRequestException('Bucket not found.');

    const metadata = await this.prisma.objectMetadata.findUnique({
      where: { bucketId_key: { bucketId, key } },
    });

    if (!metadata) {
      throw new BadRequestException('File metadata not found.');
    }

    await this.prisma.objectMetadata.delete({
      where: { bucketId_key: { bucketId, key } },
    });

    const physicalName = this.getPhysicalBucketName(bucket);

    if (this.s3Client) {
      try {
        await this.s3Client.send(
          new DeleteObjectCommand({
            Bucket: physicalName,
            Key: key,
          }),
        );
      } catch (err) {
        this.logger.error(`MinIO deleteObject error for ${key}:`, err);
      }
    }

    const file1 = path.join(this.mockStoragePath, `${bucket.teamId}_${bucket.name}`, key.replace(/\//g, '_'));
    const file2 = path.join(this.mockStoragePath, bucket.name, key.replace(/\//g, '_'));
    if (fs.existsSync(file1)) fs.unlinkSync(file1);
    if (fs.existsSync(file2)) fs.unlinkSync(file2);

    // Update bucket size used
    const totalSize = await this.prisma.objectMetadata.aggregate({
      where: { bucketId },
      _sum: { size: true },
    });

    await this.prisma.bucket.update({
      where: { id: bucketId },
      data: { sizeUsed: totalSize._sum.size || BigInt(0) },
    });

    await this.prisma.auditLog.create({
      data: {
        teamId,
        action: 'BUCKET.FILE_DELETE',
        targetType: 'BUCKET',
        targetId: bucketId,
        details: JSON.stringify({ key }),
      },
    });

    return { success: true };
  }

  async listFiles(bucketId: string, prefix = '') {
    const files = await this.prisma.objectMetadata.findMany({
      where: {
        bucketId,
        key: prefix ? { startsWith: prefix } : undefined,
      },
      orderBy: { key: 'asc' },
    });

    return files.map((f) => ({
      ...f,
      size: f.size.toString(),
    }));
  }

  async generatePresignedUrl(bucketId: string, key: string, expiresIn = 3600) {
    const bucket = await this.prisma.bucket.findUnique({ where: { id: bucketId } });
    if (!bucket) throw new BadRequestException('Bucket not found.');

    const baseDomain = process.env.BASE_DOMAIN || 'khawarahemad.com';
    const host =
      process.env.NODE_ENV === 'production'
        ? `https://storage.${baseDomain}`
        : 'http://localhost:5000';

    if (bucket.isPublic) {
      return `${host}/${bucket.teamId}/${bucket.name}/${encodeURIComponent(key)}`;
    }

    const token = this.generateMockToken(bucketId, key, expiresIn);
    return `${host}/${bucket.teamId}/${bucket.name}/${encodeURIComponent(key)}?token=${token}`;
  }

  generateMockToken(bucketId: string, key: string, expiresIn = 3600): string {
    const secret = process.env.JWT_SECRET || 'khcloud-storage-super-secret-key-123';
    const exp = Date.now() + expiresIn * 1000;
    const payload = `${bucketId}:${key}:${exp}`;
    const hmac = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex')
      .substring(0, 16);
    return Buffer.from(`${exp}:${hmac}`).toString('base64url');
  }

  verifyMockToken(bucketId: string, key: string, token: string): boolean {
    try {
      const decoded = Buffer.from(token, 'base64url').toString('utf-8');
      const [expStr, hmac] = decoded.split(':');
      const exp = parseInt(expStr, 10);
      if (Date.now() > exp) return false;
      const secret = process.env.JWT_SECRET || 'khcloud-storage-super-secret-key-123';
      const payload = `${bucketId}:${key}:${exp}`;
      const expectedHmac = crypto.createHmac('sha256', secret).update(payload).digest('hex').substring(0, 16);
      return hmac === expectedHmac;
    } catch {
      return false;
    }
  }

  private getParentKey(key: string): string | null {
    const parts = key.split('/');
    if (parts.length <= 1) return null;
    return parts.slice(0, -1).join('/') + '/';
  }
}
