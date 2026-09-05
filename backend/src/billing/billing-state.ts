/*
 * =========================================================
 * PROVIDER-NEUTRAL BILLING STATE (pure, unit-tested)
 *
 * Central translation of provider states into RENKOO
 * subscription states. No I/O, no secrets — safe to
 * test exhaustively.
 * =========================================================
 */

export type RenkooBillingState =
  | 'PENDING'
  | 'TRIALING'
  | 'ACTIVE'
  | 'PAST_DUE'
  | 'PAUSED'
  | 'CANCEL_AT_PERIOD_END'
  | 'CANCELLED'
  | 'COMPLETED'
  | 'EXPIRED'
  | 'INCOMPLETE'
  | 'FREE';

/*
 * Razorpay subscription lifecycle (documented
 * states: created, authenticated, active, pending,
 * halted, paused, cancelled, completed, expired).
 */
export function mapRazorpayStatus(
  status: string,
): RenkooBillingState {
  switch (String(status).toLowerCase()) {
    case 'active':
    case 'charged':
      return 'ACTIVE';
    case 'authenticated':
    case 'created':
    case 'pending':
      return 'PENDING';
    case 'halted':
      return 'PAST_DUE';
    case 'paused':
      return 'PAUSED';
    case 'cancelled':
      return 'CANCELLED';
    case 'completed':
      return 'COMPLETED';
    case 'expired':
      return 'EXPIRED';
    default:
      return 'PENDING';
  }
}

export function mapRazorpayPaymentStatus(
  status: string,
): string {
  switch (String(status).toLowerCase()) {
    case 'captured':
      return 'CAPTURED';
    case 'authorized':
      return 'AUTHORIZED';
    case 'failed':
      return 'FAILED';
    case 'refunded':
      return 'REFUNDED';
    default:
      return 'CREATED';
  }
}

/*
 * Effective entitlement state for a stored
 * subscription row. Expired trials and ended
 * subscriptions fall back to FREE; pending
 * subscriptions never grant paid access.
 */
export function effectiveEntitlementState(input: {
  status: string;
  trialEnd?: Date | null;
  currentPeriodEnd?: Date | null;
  cancelAtPeriodEnd?: boolean | null;
  now?: Date;
}): RenkooBillingState {
  const now = input.now ?? new Date();
  const status = String(
    input.status,
  ).toUpperCase();

  if (status === 'TRIALING') {
    if (
      input.trialEnd &&
      input.trialEnd < now
    ) {
      return 'EXPIRED';
    }

    return 'TRIALING';
  }

  if (
    status === 'ACTIVE' &&
    input.cancelAtPeriodEnd
  ) {
    if (
      input.currentPeriodEnd &&
      input.currentPeriodEnd < now
    ) {
      return 'EXPIRED';
    }

    return 'CANCEL_AT_PERIOD_END';
  }

  if (
    status === 'ACTIVE' &&
    input.currentPeriodEnd &&
    input.currentPeriodEnd < now
  ) {
    return 'EXPIRED';
  }

  if (
    status === 'PENDING' ||
    status === 'INCOMPLETE' ||
    status === 'INCOMPLETE_EXPIRED'
  ) {
    return 'FREE';
  }

  if (
    status === 'CANCELED' ||
    status === 'CANCELLED' ||
    status === 'COMPLETED' ||
    status === 'EXPIRED' ||
    status === 'UNPAID'
  ) {
    return 'FREE';
  }

  if (status === 'PAST_DUE') {
    return 'PAST_DUE';
  }

  if (status === 'PAUSED') {
    return 'PAUSED';
  }

  if (status === 'ACTIVE') {
    return 'ACTIVE';
  }

  return 'FREE';
}

/*
 * Whether the effective state carries paid plan
 * limits (grace kept for PAST_DUE/PAUSED so a
 * failed charge or pause never nukes access
 * instantly; metered paths stay gated).
 */
export function hasPaidLimits(
  state: RenkooBillingState,
): boolean {
  return (
    state === 'ACTIVE' ||
    state === 'TRIALING' ||
    state === 'PAST_DUE' ||
    state === 'PAUSED' ||
    state === 'CANCEL_AT_PERIOD_END'
  );
}
