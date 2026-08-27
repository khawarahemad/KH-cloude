import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { SignJWT, jwtVerify } from 'jose';

export interface TokenPayload {
  sub: string;
  type: 'access' | 'refresh';
}

@Injectable()
export class TokenService implements OnModuleInit {
  private readonly logger = new Logger(TokenService.name);
  private secret!: Uint8Array;

  onModuleInit() {
    let raw = process.env.JWT_SECRET ?? '';
    if (!raw || raw.length < 32) {
      this.logger.warn(
        '⚠️ WARNING: JWT_SECRET is missing or too short. Generating an ephemeral random secret for this session. ' +
          'All users will be logged out when the server restarts. Please set a strong 32+ char JWT_SECRET in .env.',
      );
      // Generate a random 32-byte hex string
      raw = require('crypto').randomBytes(32).toString('hex');
    }
    this.secret = new TextEncoder().encode(raw);
    this.logger.log('TokenService initialized — JWT_SECRET loaded.');
  }

  async signAccessToken(userId: string): Promise<string> {
    return new SignJWT({ type: 'access' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(userId)
      .setIssuedAt()
      .setExpirationTime('15m')
      .sign(this.secret);
  }

  async signRefreshToken(userId: string): Promise<string> {
    return new SignJWT({ type: 'refresh' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(userId)
      .setIssuedAt()
      .setExpirationTime('7d')
      .sign(this.secret);
  }

  async verifyToken(token: string): Promise<TokenPayload> {
    const { payload } = await jwtVerify(token, this.secret);
    return {
      sub: payload.sub as string,
      type: payload['type'] as 'access' | 'refresh',
    };
  }
}
