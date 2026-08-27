import {
  Controller,
  Get,
  Query,
  Headers,
  Req,
  Res,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import * as express from 'express';
import { StorageService } from './storage.service';
import { PrismaService } from '../prisma/prisma.service';

function pathName(key: string): string {
  const parts = key.split('/');
  return parts[parts.length - 1] || 'file';
}

import { Public } from '../auth/public.decorator';

@Controller()
export class StoragePublicController {
  constructor(
    private readonly storage: StorageService,
    private readonly prisma: PrismaService,
  ) {}

  @Public()
  @Get()
  root(@Req() req: express.Request) {
    const baseDomain = process.env.BASE_DOMAIN || 'khawarahemad.com';
    return {
      service: 'KH Cloud S3-Compatible Object Storage',
      status: 'online',
      host: req.headers.host || `storage.${baseDomain}`,
      docs: `https://cloud.${baseDomain}`,
      timestamp: new Date().toISOString(),
    };
  }

  @Public()
  @Get('*')
  async serveObject(
    @Req() req: express.Request,
    @Res() res: express.Response,
    @Query('token') token?: string,
    @Query('apikey') queryApiKey?: string,
    @Headers() headers?: any,
  ) {
    const rawPath = decodeURIComponent(req.path).replace(/^\/+|\/+$/g, '');
    if (!rawPath) {
      return this.root(req);
    }

    const segments = rawPath.split('/');
    if (segments.length < 2) {
      throw new BadRequestException(
        'Invalid storage path. Expected /:teamId/:bucketName/:key or /:bucketName/:key',
      );
    }

    let bucket = null;
    let key = '';

    // 1. Try matching segments[0] as teamId/slug AND segments[1] as bucketName
    if (segments.length >= 3) {
      const teamIdOrSlug = segments[0];
      const candidateBucketName = segments[1];

      bucket = await this.prisma.bucket.findFirst({
        where: {
          OR: [
            { teamId: teamIdOrSlug, name: candidateBucketName },
            { team: { slug: teamIdOrSlug }, name: candidateBucketName },
          ],
        },
      });

      if (bucket) {
        key = segments.slice(2).join('/');
      }
    }

    // 2. If not matched, try matching segments[0] as direct bucketName or bucketId
    if (!bucket) {
      const bucketIdentifier = segments[0];
      bucket = await this.prisma.bucket.findFirst({
        where: {
          OR: [
            { id: bucketIdentifier },
            { name: bucketIdentifier },
          ],
        },
      });

      if (bucket) {
        key = segments.slice(1).join('/');
      }
    }

    if (!bucket) {
      throw new NotFoundException(`Storage bucket not found for path: /${rawPath}`);
    }

    if (!key) {
      throw new BadRequestException('Object key is required.');
    }

    return this.deliverObject(bucket, key, req, res, token, queryApiKey, headers);
  }

  private async deliverObject(
    bucket: any,
    key: string,
    req: express.Request,
    res: express.Response,
    token?: string,
    queryApiKey?: string,
    headers?: any,
  ) {
    if (!bucket.isPublic) {
      const passedKey =
        queryApiKey ||
        headers?.['apikey'] ||
        headers?.['x-api-key'] ||
        (headers?.['authorization']?.startsWith('Bearer ')
          ? headers['authorization'].substring(7)
          : null);
      let isAuthorized = false;

      if (passedKey) {
        const crypto = require('crypto');
        const hashedKey = crypto.createHash('sha256').update(passedKey).digest('hex');
        const keyMatch = await this.prisma.apiKey.findFirst({
          where: { teamId: bucket.teamId, key: hashedKey },
        });
        if (keyMatch) isAuthorized = true;
      }

      if (!isAuthorized && token) {
        if (this.storage.verifyMockToken(bucket.id, key, token as string)) isAuthorized = true;
      }

      if (!isAuthorized) {
        throw new BadRequestException(
          'Unauthorized access. Private buckets require a valid API Key or presigned token.',
        );
      }
    }

    try {
      const fileBuffer = await this.storage.getFile(bucket.id, key);

      const meta = await this.prisma.objectMetadata.findFirst({
        where: { bucketId: bucket.id, key },
      });

      res.setHeader(
        'Content-Type',
        meta?.contentType || 'application/octet-stream',
      );
      res.setHeader(
        'Content-Disposition',
        `inline; filename="${pathName(key)}"`,
      );
      if (bucket.isPublic) {
        res.setHeader('Cache-Control', 'public, max-age=86400');
      } else {
        res.setHeader('Cache-Control', 'private, no-store');
      }
      return res.send(fileBuffer);
    } catch (err: any) {
      if (err.name === 'AccessDenied' || err.message?.includes('AccessDenied')) {
        throw new BadRequestException(
          'Cloud Storage Error: Access Denied to backend. Please check MinIO credentials.',
        );
      }
      throw new BadRequestException(`Failed to read file: ${err.message}`);
    }
  }
}
