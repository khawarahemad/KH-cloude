import { Injectable, OnModuleInit, Logger, BadRequestException } from '@nestjs/common';
import { S3Client, CreateBucketCommand, DeleteBucketCommand, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PrismaService } from '../prisma/prisma.service';
import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private s3Client: S3Client | null = null;
  private useMock = true;
  private mockStoragePath = path.join(__dirname, '..', '..', 'storage-mock');

  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    // Ensure mock path exists
    if (!fs.existsSync(this.mockStoragePath)) {
      fs.mkdirSync(this.mockStoragePath, { recursive: true });
    }

    try {
      this.s3Client = new S3Client({
        endpoint: process.env.MINIO_ENDPOINT || 'http://localhost:9000',
        region: process.env.MINIO_REGION || 'us-east-1',
        credentials: {
          accessKeyId: process.env.MINIO_ACCESS_KEY || 'khcloudroot',
          secretAccessKey: process.env.MINIO_SECRET_KEY || 'khcloudrootpassword',
        },
        forcePathStyle: true,
      });

      // Simple connectivity check - try listing objects with a timeout
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2000);
      
      await this.s3Client.send(
        new ListObjectsV2Command({
          Bucket: 'connectivity-test-bucket',
          MaxKeys: 1,
        }),
        { abortSignal: controller.signal }
      ).then(() => {
        this.useMock = false;
        this.logger.log('Successfully connected to MinIO cluster. S3 compatible Object Storage active.');
      }).catch((err) => {
        // If it fails with NoSuchBucket, AccessDenied, etc., the server is active!
        if (err.name === 'NoSuchBucket' || err.name === 'AccessDenied' || err.$metadata?.httpStatusCode) {
          this.useMock = false;
          this.logger.log('Successfully connected to MinIO cluster. S3 compatible Object Storage active.');
        } else {
          this.useMock = true;
          this.logger.warn('Failed to connect to MinIO (network error). Using local mock storage.');
        }
      });

      clearTimeout(timeout);
    } catch (err) {
      this.useMock = true;
      this.logger.warn('Failed to connect to MinIO. Using local mock storage.');
    }
  }

  async createBucket(name: string, isPublic: boolean, teamId: string) {
    // Validate bucket name
    if (!/^[a-z0-9.-]{3,63}$/.test(name)) {
      throw new BadRequestException('Bucket name must be 3-63 characters, lowercase letters, numbers, dots, or hyphens.');
    }

    // Check if bucket exists
    const existing = await this.prisma.bucket.findUnique({ where: { name } });
    if (existing) {
      throw new BadRequestException('Bucket with this name already exists.');
    }

    // Create in SQLite
    const bucket = await this.prisma.bucket.create({
      data: {
        name,
        isPublic,
        teamId,
        sizeUsed: BigInt(0),
        status: 'ACTIVE',
      },
    });

    if (this.useMock) {
      const bucketDir = path.join(this.mockStoragePath, name);
      if (!fs.existsSync(bucketDir)) {
        fs.mkdirSync(bucketDir, { recursive: true });
      }
    } else {
      try {
        await this.s3Client!.send(new CreateBucketCommand({ Bucket: name }));
      } catch (err) {
        this.logger.error(`MinIO createBucket error for ${name}:`, err);
      }
    }

    // Create Audit Log
    await this.prisma.auditLog.create({
      data: {
        teamId,
        action: 'BUCKET.CREATE',
        targetType: 'BUCKET',
        targetId: bucket.id,
        details: JSON.stringify({ name, isPublic }),
      },
    });

    return bucket;
  }

  async getBuckets(teamId: string) {
    const buckets = await this.prisma.bucket.findMany({
      where: { teamId },
      include: {
        _count: {
          select: { objects: { where: { isFolder: false } } }
        }
      }
    });

    // Format BigInt for JSON safety
    return buckets.map(b => ({
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

    // Check if bucket is empty
    const fileCount = await this.prisma.objectMetadata.count({
      where: { bucketId: id, isFolder: false },
    });

    if (fileCount > 0) {
      throw new BadRequestException('Bucket must be empty before deleting.');
    }

    await this.prisma.bucket.delete({ where: { id } });

    if (this.useMock) {
      const bucketDir = path.join(this.mockStoragePath, bucket.name);
      if (fs.existsSync(bucketDir)) {
        fs.rmSync(bucketDir, { recursive: true, force: true });
      }
    } else {
      try {
        await this.s3Client!.send(new DeleteBucketCommand({ Bucket: bucket.name }));
      } catch (err) {
        this.logger.error(`MinIO deleteBucket error for ${bucket.name}:`, err);
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
    originalName: string,
    teamId: string
  ) {
    const bucket = await this.prisma.bucket.findUnique({
      where: { id: bucketId },
    });

    if (!bucket) {
      throw new BadRequestException('Bucket not found.');
    }

    let processedBuffer = fileBuffer;
    let finalContentType = contentType;

    // Process image optimizations if image
    if (contentType.startsWith('image/') && !contentType.includes('svg')) {
      try {
        processedBuffer = await sharp(fileBuffer)
          .resize({ width: 1200, withoutEnlargement: true })
          .webp({ quality: 80 })
          .toBuffer();
        finalContentType = 'image/webp';
        // Adjust extension in key to webp
        const ext = path.extname(key);
        if (ext) {
          key = key.substring(0, key.length - ext.length) + '.webp';
        } else {
          key = key + '.webp';
        }
      } catch (err) {
        this.logger.warn(`Image compression failed: ${err}`);
      }
    }

    const fileSize = processedBuffer.length;

    // Save binary
    if (this.useMock) {
      const bucketDir = path.join(this.mockStoragePath, bucket.name);
      const filePath = path.join(bucketDir, key.replace(/\//g, '_')); // flatten folder keys locally
      
      // Ensure directory structure locally
      fs.writeFileSync(filePath, processedBuffer);
    } else {
      try {
        await this.s3Client!.send(new PutObjectCommand({
          Bucket: bucket.name,
          Key: key,
          Body: processedBuffer,
          ContentType: finalContentType,
        }));
      } catch (err) {
        this.logger.error(`MinIO putObject error for ${key}:`, err);
      }
    }

    // Save metadata in SQLite
    const etag = Math.random().toString(36).substring(2, 15);
    const objectMeta = await this.prisma.objectMetadata.upsert({
      where: {
        bucketId_key: { bucketId, key }
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
        isFolder: false,
        parentKey: this.getParentKey(key),
      },
    });

    // Update bucket size used
    const totalSize = await this.prisma.objectMetadata.aggregate({
      where: { bucketId },
      _sum: { size: true }
    });
    
    await this.prisma.bucket.update({
      where: { id: bucketId },
      data: { sizeUsed: totalSize._sum.size || BigInt(0) }
    });

    await this.prisma.auditLog.create({
      data: {
        teamId,
        action: 'BUCKET.FILE_UPLOAD',
        targetType: 'BUCKET',
        targetId: bucketId,
        details: JSON.stringify({ key, size: fileSize }),
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

    if (this.useMock) {
      const filePath = path.join(this.mockStoragePath, bucket.name, key.replace(/\//g, '_'));
      if (!fs.existsSync(filePath)) {
        throw new BadRequestException('File not found in mock storage.');
      }
      return fs.readFileSync(filePath);
    } else {
      const response = await this.s3Client!.send(new GetObjectCommand({
        Bucket: bucket.name,
        Key: key,
      }));
      const streamToBuffer = (stream: any): Promise<Buffer> =>
        new Promise((resolve, reject) => {
          const chunks: any[] = [];
          stream.on('data', (chunk: any) => chunks.push(chunk));
          stream.on('error', reject);
          stream.on('end', () => resolve(Buffer.concat(chunks)));
        });
      return streamToBuffer(response.Body);
    }
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

    // Delete metadata
    await this.prisma.objectMetadata.delete({
      where: { bucketId_key: { bucketId, key } }
    });

    // Delete binary
    if (this.useMock) {
      const filePath = path.join(this.mockStoragePath, bucket.name, key.replace(/\//g, '_'));
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } else {
      try {
        await this.s3Client!.send(new DeleteObjectCommand({
          Bucket: bucket.name,
          Key: key,
        }));
      } catch (err) {
        this.logger.error(`MinIO deleteObject error for ${key}:`, err);
      }
    }

    // Update bucket size used
    const totalSize = await this.prisma.objectMetadata.aggregate({
      where: { bucketId },
      _sum: { size: true }
    });
    
    await this.prisma.bucket.update({
      where: { id: bucketId },
      data: { sizeUsed: totalSize._sum.size || BigInt(0) }
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

    return files.map(f => ({
      ...f,
      size: f.size.toString(),
    }));
  }

  async generatePresignedUrl(bucketId: string, key: string, expiresIn = 3600) {
    const bucket = await this.prisma.bucket.findUnique({ where: { id: bucketId } });
    if (!bucket) throw new BadRequestException('Bucket not found.');

    if (bucket.isPublic) {
      // Return public direct URL (in mock mode we expose an API endpoint that handles download)
      return `/api/storage/buckets/${bucketId}/download?key=${encodeURIComponent(key)}`;
    }

    if (this.useMock) {
      // Mock signed URL
      return `/api/storage/buckets/${bucketId}/download?key=${encodeURIComponent(key)}&token=mock-signed-${Math.random().toString(36).substring(2)}`;
    } else {
      try {
        const command = new GetObjectCommand({ Bucket: bucket.name, Key: key });
        return await getSignedUrl(this.s3Client!, command, { expiresIn });
      } catch (err) {
        return `/api/storage/buckets/${bucketId}/download?key=${encodeURIComponent(key)}`;
      }
    }
  }

  private getParentKey(key: string): string | null {
    const parts = key.split('/');
    if (parts.length <= 1) return null;
    return parts.slice(0, -1).join('/') + '/';
  }
}
