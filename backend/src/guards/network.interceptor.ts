import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { NetworkService } from './network.service';

function getClientIp(req: any): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const first = (forwarded as string).split(',')[0].trim();
    if (first) return first;
  }
  return req.ip ?? req.socket?.remoteAddress ?? '0.0.0.0';
}

@Injectable()
export class NetworkInterceptor implements NestInterceptor {
  constructor(private readonly networkService: NetworkService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const req = context.switchToHttp().getRequest();
    const startTime = Date.now();
    const ip = getClientIp(req);
    const method = req.method;
    const path = req.originalUrl || req.url;
    const userAgent = req.headers['user-agent'];

    return next.handle().pipe(
      tap({
        next: () => {
          const res = context.switchToHttp().getResponse();
          const responseTimeMs = Date.now() - startTime;
          const statusCode = res.statusCode || 200;

          // Non-blocking asynchronous log call
          void this.networkService.logRequest({
            ip,
            method,
            path,
            statusCode,
            userAgent,
            responseTimeMs,
          });
        },
        error: (err: any) => {
          const responseTimeMs = Date.now() - startTime;
          const statusCode = err.status || err.statusCode || 500;

          void this.networkService.logRequest({
            ip,
            method,
            path,
            statusCode,
            userAgent,
            responseTimeMs,
          });
        },
      }),
    );
  }
}
