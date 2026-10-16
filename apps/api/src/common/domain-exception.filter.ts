import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  DependencyUnavailableError,
  DomainError,
  InvalidStateError,
  NotFoundError,
  ValidationError,
} from './domain-errors';

type DomainErrorClass = abstract new (...args: never[]) => DomainError;

const STATUS_BY_ERROR = new Map<DomainErrorClass, HttpStatus>([
  [NotFoundError, HttpStatus.NOT_FOUND],
  [ValidationError, HttpStatus.BAD_REQUEST],
  [InvalidStateError, HttpStatus.CONFLICT],
  [DependencyUnavailableError, HttpStatus.SERVICE_UNAVAILABLE],
]);

@Catch()
export class DomainExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(DomainExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof DomainError) {
      const status =
        STATUS_BY_ERROR.get(exception.constructor as DomainErrorClass) ??
        HttpStatus.INTERNAL_SERVER_ERROR;
      response.status(status).json({ error: exception.code, message: exception.message });
      return;
    }

    if (exception instanceof HttpException) {
      response
        .status(exception.getStatus())
        .json({ error: 'HTTP_ERROR', message: exception.message });
      return;
    }

    this.logger.error(exception);
    response
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .json({ error: 'INTERNAL', message: 'Unexpected error' });
  }
}
