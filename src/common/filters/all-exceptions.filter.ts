import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();
    const isProd = process.env.NODE_ENV === 'production';

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';
    let errorName = 'InternalServerError';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const r = exception.getResponse();
      if (typeof r === 'string') {
        message = r;
      } else if (typeof r === 'object' && r !== null) {
        const rec = r as Record<string, unknown>;
        message = (rec.message as string | string[]) ?? exception.message;
        errorName = (rec.error as string) ?? exception.name;
      }
    } else if (exception instanceof Error) {
      errorName = exception.name;
      if (!isProd) message = exception.message;
    }

    if (status >= 500) {
      this.logger.error({
        event: 'exception',
        path: req.url,
        method: req.method,
        err:
          exception instanceof Error
            ? { name: exception.name, message: exception.message, stack: exception.stack }
            : exception,
      });
    }

    res.status(status).json({
      statusCode: status,
      error: errorName,
      message,
      path: req.url,
      timestamp: new Date().toISOString(),
    });
  }
}
