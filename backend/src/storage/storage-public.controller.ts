import {
  Controller,
  Get,
  Param,
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

@Controller()
export class StoragePublicController {
  constructor(
    private readonly storage: StorageService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  root(@Req() req: express.Request) {
    return {
      service: 'KH Cloud S3-Compatible Object Storage',
      status: 'online',
      host: req.headers.host || 'storage.khawarahemad.com',
      docs: 'https://cloud.khawarahemad.com',
      timestamp: new Date().toISOString(),
    };
  }

  // 1. Team-scoped URL: /:teamId/:bucketName/*
  @Get(':teamId/:bucketName/*')
  async serveTeamScopedObject(
    @Param('teamId') teamId: string,
    @Param('bucketName') bucketName: string,
    @Req() req: express.Request,
    @Res() res: express.Response,
    @Query('token') token?: string,
    @Query('apikey') queryApiKey?: string,
    @Headers() headers?: any,
  ) {
    const key = (req.params as any)[0];
    if (!key) throw new BadRequestException('Object key is required.');

    const bucket = await this.prisma.bucket.findFirst({
      where: {
        OR: [
          { teamId, name: bucketName },
          { team: { slug: teamId }, name: bucketName },
        ],
      },
    });

    if (!bucket) {
      throw new NotFoundException(`Bucket "${bucketName}" not found in workspace "${teamId}".`);
    }

    return this.deliverObject(bucket, key, req, res, token, queryApiKey, headers);
  }

  // 2. Direct bucket or legacy URL: /:bucketIdentifier/*
  @Get(':bucketIdentifier/*')
  async serveDirectObject(
    @Param('bucketIdentifier') bucketIdentifier: string,
    @Req() req: express.Request,
    @Res() res: express.Response,
    @Query('token') token?: string,
    @Query('apikey') queryApiKey?: string,
    @Headers() headers?: any,
  ) {
    const key = (req.params as any)[0];
    if (!key) throw new BadRequestException('Object key is required.');

    const bucket = await this.prisma.bucket.findFirst({
      where: {
        OR: [
          { id: bucketIdentifier },
          { name: bucketIdentifier },
        ],
      },
    });

    if (!bucket) {
      throw new NotFoundException(`Bucket "${bucketIdentifier}" not found.`);
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
        const keyMatch = await this.prisma.apiKey.findFirst({
          where: { teamId: bucket.teamId, key: passedKey },
        });
        if (keyMatch) isAuthorized = true;
      }

      if (!isAuthorized && token) {
        const expectedToken = this.storage.generateMockToken(bucket.id, key);
        if (token === expectedToken) isAuthorized = true;
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
      res.setHeader('Cache-Control', 'public, max-age=86400');
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
