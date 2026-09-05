import {
  HttpException,
  HttpStatus,
} from '@nestjs/common';

/*
 * Structured commercial billing errors. Codes are
 * allowlisted in the global exception filter and
 * carry no provider internals or secrets.
 */
export type BillingErrorCode =
  | 'BILLING_PROVIDER_NOT_CONFIGURED'
  | 'BILLING_PROVIDER_UNAVAILABLE'
  | 'PLAN_NOT_AVAILABLE'
  | 'CURRENCY_NOT_SUPPORTED'
  | 'SUBSCRIPTION_ALREADY_ACTIVE'
  | 'PAYMENT_VERIFICATION_FAILED'
  | 'WEBHOOK_SIGNATURE_INVALID'
  | 'WEBHOOK_ALREADY_PROCESSED'
  | 'PAYMENT_FAILED'
  | 'SUBSCRIPTION_UPDATE_FAILED'
  | 'ENTITLEMENT_LIMIT_REACHED'
  | 'BILLING_OPERATION_UNSUPPORTED';

const STATUS: Record<
  BillingErrorCode,
  HttpStatus
> = {
  BILLING_PROVIDER_NOT_CONFIGURED:
    HttpStatus.SERVICE_UNAVAILABLE,
  BILLING_PROVIDER_UNAVAILABLE:
    HttpStatus.BAD_GATEWAY,
  PLAN_NOT_AVAILABLE:
    HttpStatus.BAD_REQUEST,
  CURRENCY_NOT_SUPPORTED:
    HttpStatus.BAD_REQUEST,
  SUBSCRIPTION_ALREADY_ACTIVE:
    HttpStatus.CONFLICT,
  PAYMENT_VERIFICATION_FAILED:
    HttpStatus.UNPROCESSABLE_ENTITY,
  WEBHOOK_SIGNATURE_INVALID:
    HttpStatus.UNAUTHORIZED,
  WEBHOOK_ALREADY_PROCESSED:
    HttpStatus.OK,
  PAYMENT_FAILED:
    HttpStatus.PAYMENT_REQUIRED,
  SUBSCRIPTION_UPDATE_FAILED:
    HttpStatus.BAD_GATEWAY,
  ENTITLEMENT_LIMIT_REACHED:
    HttpStatus.FORBIDDEN,
  BILLING_OPERATION_UNSUPPORTED:
    HttpStatus.NOT_IMPLEMENTED,
};

export function billingError(
  code: BillingErrorCode,
  message: string,
  details?: Record<string, unknown>,
): HttpException {
  return new HttpException(
    {
      code,
      message,
      ...(details
        ? { details }
        : {}),
    },
    STATUS[code],
  );
}
