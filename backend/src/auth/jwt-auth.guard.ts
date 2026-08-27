import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from './public.decorator';
import { TokenService } from './token.service';
import type { Request } from 'express';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Skip guard for routes decorated with @Public()
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<Request & { user?: { id: string } }>();

    // Extract token from HttpOnly cookie first, then Authorization header as fallback
    const cookieToken: string | undefined = (req.cookies as any)?.['kh_session'];
    const bearerToken = this.extractBearer(req);
    const token = cookieToken ?? bearerToken;

    if (!token) {
      throw new UnauthorizedException('Authentication required.');
    }

    let payload: { sub: string; type: string };
    try {
      payload = await this.tokens.verifyToken(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired session. Please log in again.');
    }

    if (payload.type !== 'access') {
      throw new UnauthorizedException('Invalid token type.');
    }

    // Attach verified identity to request — downstream code reads req.user.id only
    req.user = { id: payload.sub };
    return true;
  }

  private extractBearer(req: Request): string | null {
    const authHeader = req.headers?.['authorization'] as string | undefined;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const candidate = authHeader.substring(7).trim();
      // Only accept tokens that look like JWTs (3 base64url segments), not bare UUIDs
      if (candidate.split('.').length === 3) {
        return candidate;
      }
    }
    return null;
  }
}
