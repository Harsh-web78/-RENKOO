import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';

const SAFE_ERROR_CODES = new Set([
  'LIMIT_REACHED',
  'ENTITLEMENT_REQUIRED',
  'PROVIDER_NOT_CONFIGURED',
  'INVALID_PROVIDER_KEY',
  'RATE_LIMITED',
  'QUOTA_EXCEEDED',
  'PROVIDER_TIMEOUT',
  'PROVIDER_ERROR',
  'SENDER_NOT_VERIFIED',
  'SEND_FAILED',
  'TOKEN_REVOKED',
  'GOOGLE_FORBIDDEN',
  'GOOGLE_NOT_FOUND',
  'BILLING_PROVIDER_NOT_CONFIGURED',
  'BILLING_PROVIDER_UNAVAILABLE',
  'PLAN_NOT_AVAILABLE',
  'CURRENCY_NOT_SUPPORTED',
  'SUBSCRIPTION_ALREADY_ACTIVE',
  'PAYMENT_VERIFICATION_FAILED',
  'WEBHOOK_SIGNATURE_INVALID',
  'WEBHOOK_ALREADY_PROCESSED',
  'PAYMENT_FAILED',
  'SUBSCRIPTION_UPDATE_FAILED',
  'ENTITLEMENT_LIMIT_REACHED',
  'BILLING_OPERATION_UNSUPPORTED',
]);

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

    const requestId: string | undefined =
      request?.id;

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const exceptionResponse =
      exception instanceof HttpException ? exception.getResponse() : null;

    const body =
      typeof exceptionResponse === 'object' &&
      exceptionResponse !== null
        ? (exceptionResponse as Record<
            string,
            unknown
          >)
        : null;

    const message =
      body !== null && 'message' in body
        ? body.message
        : exceptionResponse;

    this.logger.error(
      `${request.method} ${request.url} -> ${status}${requestId ? ` [${requestId}]` : ''}`,
      exception instanceof Error ? exception.stack : String(exception),
    );

    /*
     * Structured commercial errors (limits, entitlements,
     * provider state) pass through with their safe code
     * and details. Everything else stays sanitized.
     * These payloads never contain secrets by
     * construction — only codes, counts and plan names.
     */
    if (
      body !== null &&
      typeof body.code === 'string' &&
      SAFE_ERROR_CODES.has(body.code)
    ) {
      const payload = body;

      response.status(status).json({
        statusCode: status,
        code: payload.code,
        message: payload.message,
        details: {
          metric: payload.metric,
          used: payload.used,
          limit: payload.limit,
          planCode: payload.planCode,
          feature: payload.feature,
          requiredPlans:
            payload.requiredPlans,
          provider: payload.provider,
          observationType:
            payload.observationType,
        },
        timestamp: new Date().toISOString(),
        path: request.url,
        ...(requestId
          ? { requestId }
          : {}),
      });

      return;
    }

    const safeMessage =
      status >= 500
        ? 'Internal server error'
        : typeof message === 'string' || Array.isArray(message)
          ? message
          : 'Request failed';

    response.status(status).json({
      statusCode: status,
      message: safeMessage,
      timestamp: new Date().toISOString(),
      path: request.url,
      ...(requestId ? { requestId } : {}),
    });
  }
}
