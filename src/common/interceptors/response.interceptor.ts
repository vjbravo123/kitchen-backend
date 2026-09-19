import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface ApiResponse<T> {
  success: true;
  statusCode: number;
  message: string;
  data: T;
  timestamp: string;
}

/**
 * Wraps every successful controller result in one consistent envelope.
 * A service/controller may return { message, data } to override the message.
 */
@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<ApiResponse<T>> {
    const response = context.switchToHttp().getResponse();
    return next.handle().pipe(
      map((payload: any) => {
        const hasCustomMessage =
          payload && typeof payload === 'object' && 'message' in payload && 'data' in payload;
        return {
          success: true as const,
          statusCode: response.statusCode,
          message: hasCustomMessage ? payload.message : 'Success',
          data: hasCustomMessage ? payload.data : payload,
          timestamp: new Date().toISOString(),
        };
      }),
    );
  }
}
