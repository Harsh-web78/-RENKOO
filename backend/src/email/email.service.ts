import {
  Injectable,
  Logger,
} from '@nestjs/common';
import { Resend } from 'resend';

import { EmailProviderError } from './email.errors';
import {
  buildNotificationEmail,
  buildPasswordResetEmail,
  buildReportEmail,
  buildTeamInviteEmail,
  buildVerificationEmail,
} from './email.templates';

export type EmailProviderState =
  | 'CONFIGURED'
  | 'NOT_CONFIGURED';

/*
 * Resend test sender. Resend permits sending from
 * onboarding@resend.dev on accounts without a
 * verified custom domain, but delivery is limited
 * (typically to the account owner address). A real
 * sender domain must be configured via EMAIL_FROM
 * once RENKOO owns a custom domain.
 */
const TEST_SENDER =
  'RENKOO <onboarding@resend.dev>';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(
    EmailService.name,
  );
  private readonly resend: Resend | null;

  constructor() {
    /*
     * The key is held in memory only. It is never
     * logged, never returned from any API, and
     * never exposed to the frontend.
     */
    const apiKey =
      process.env.RESEND_API_KEY?.trim();

    this.resend = apiKey
      ? new Resend(apiKey)
      : null;

    /*
     * Render-safe visibility: missing optional
     * email configuration warns but never
     * crashes the application. Email operations
     * then report PROVIDER_NOT_CONFIGURED
     * honestly instead of fake success.
     */
    if (!this.resend) {
      this.logger.warn(
        'RESEND_API_KEY is not set: transactional email is disabled and email operations will report PROVIDER_NOT_CONFIGURED.',
      );
    }

    if (
      !process.env.APP_PUBLIC_URL?.trim() &&
      !process.env.FRONTEND_URL?.trim() &&
      process.env.NODE_ENV === 'production'
    ) {
      this.logger.warn(
        'APP_PUBLIC_URL is not set in production: emailed links (verification, reset, invites, reports) will fall back to localhost URLs.',
      );
    }
  }

  isConfigured(): boolean {
    return this.resend !== null;
  }

  resolveSender(): {
    from: string;
    senderConfigured: boolean;
  } {
    const configured = (
      process.env.EMAIL_FROM?.trim() ||
      process.env.RESEND_FROM_EMAIL?.trim() ||
      ''
    );

    if (configured) {
      return {
        from: configured,
        senderConfigured: true,
      };
    }

    return {
      from: TEST_SENDER,
      senderConfigured: false,
    };
  }

  resolveAppUrl(): string {
    const raw =
      process.env.APP_PUBLIC_URL?.trim() ||
      process.env.FRONTEND_URL?.trim() ||
      'http://localhost:3000';

    return raw.replace(/\/+$/, '');
  }

  /*
   * Safe status snapshot. Contains presence flags
   * and the sender address only — never secrets.
   */
  getStatus(): {
    provider: 'resend';
    status: EmailProviderState;
    senderConfigured: boolean;
    from: string;
    appUrl: string;
  } {
    const { from, senderConfigured } =
      this.resolveSender();

    return {
      provider: 'resend',
      status: this.isConfigured()
        ? 'CONFIGURED'
        : 'NOT_CONFIGURED',
      senderConfigured,
      from,
      appUrl: this.resolveAppUrl(),
    };
  }

  private async deliver(params: {
    to: string;
    subject: string;
    html: string;
    text?: string;
  }): Promise<{ id?: string }> {
    if (!this.resend) {
      throw new EmailProviderError(
        'PROVIDER_NOT_CONFIGURED',
        'Email provider is not configured. Set RESEND_API_KEY on the backend.',
      );
    }

    const { from } = this.resolveSender();

    let result: Awaited<
      ReturnType<Resend['emails']['send']>
    >;

    try {
      result =
        await this.resend.emails.send({
          from,
          to: params.to,
          subject: params.subject,
          html: params.html,
          ...(params.text
            ? { text: params.text }
            : {}),
        });
    } catch (error: any) {
      throw this.mapError(error);
    }

    if (result.error) {
      throw this.mapError(result.error);
    }

    return { id: result.data?.id };
  }

  private mapError(
    error: any,
  ): EmailProviderError {
    const message = String(
      error?.message ??
        error?.error ??
        'Unknown email error',
    );
    const statusCode = Number(
      error?.statusCode ?? error?.status ?? 0,
    );
    const haystack =
      `${statusCode} ${message}`.toLowerCase();

    /*
     * Never log recipients, subjects, tokens, or
     * keys — only the failure class.
     */
    this.logger.warn(
      `Email send failed (provider=resend status=${statusCode || 'unknown'})`,
    );

    if (
      haystack.includes('domain') ||
      haystack.includes('verify') ||
      haystack.includes('sender') ||
      haystack.includes('authorized') ||
      haystack.includes('authorised') ||
      statusCode === 403
    ) {
      return new EmailProviderError(
        'SENDER_NOT_VERIFIED',
        'Email sender is not verified for this Resend account. Set EMAIL_FROM to a verified sender domain once available.',
      );
    }

    return new EmailProviderError(
      'SEND_FAILED',
      `Email send failed: ${message.slice(0, 200)}`,
    );
  }

  async sendVerificationEmail(params: {
    to: string;
    name?: string | null;
    verifyUrl: string;
    expiresHours: number;
  }) {
    const template =
      buildVerificationEmail(params);

    await this.deliver({
      to: params.to,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });

    return { success: true };
  }

  async sendPasswordResetEmail(params: {
    to: string;
    name?: string | null;
    resetUrl: string;
    expiresMinutes: number;
  }) {
    const template =
      buildPasswordResetEmail(params);

    await this.deliver({
      to: params.to,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });

    return { success: true };
  }

  async sendReportEmail(params: {
    to: string;
    reportTitle: string;
    websiteName: string;
    websiteUrl: string;
    shareUrl: string;
    senderOrgName?: string | null;
    message?: string | null;
  }) {
    const template = buildReportEmail(params);

    const result = await this.deliver({
      to: params.to,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });

    return { success: true, id: result.id };
  }

  async sendNotificationEmail(params: {
    to: string;
    subject: string;
    title: string;
    message: string;
    actionUrl?: string;
    actionLabel?: string;
  }) {
    const template =
      buildNotificationEmail(params);

    const result = await this.deliver({
      to: params.to,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });

    return { success: true, id: result.id };
  }

  async sendTeamInvite(params: {
    to: string;
    organizationName: string;
    inviterName?: string | null;
    role: string;
    inviteUrl: string;
    expiresAt: Date;
  }) {
    const template =
      buildTeamInviteEmail(params);

    await this.deliver({
      to: params.to,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });

    return { success: true };
  }
}
