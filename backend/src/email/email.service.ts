import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { Resend } from 'resend';

@Injectable()
export class EmailService {
  private readonly resend: Resend | null;

  constructor() {
    const apiKey = process.env.RESEND_API_KEY;

    this.resend = apiKey ? new Resend(apiKey) : null;
  }

  async sendTeamInvite(params: {
    to: string;
    organizationName: string;
    inviterName?: string | null;
    role: string;
    inviteUrl: string;
    expiresAt: Date;
  }) {
    if (!this.resend) {
      throw new InternalServerErrorException(
        'Email service is not configured. Please add RESEND_API_KEY.',
      );
    }

    const from =
      process.env.RESEND_FROM_EMAIL ||
      'onboarding@resend.dev';

    const inviter =
      params.inviterName?.trim() || 'Your organization admin';

    const { error } = await this.resend.emails.send({
      from,
      to: params.to,
      subject: `You're invited to join ${params.organizationName} on RENKOO`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:32px">
          <h1 style="margin-bottom:8px">You're invited to RENKOO</h1>

          <p>
            ${inviter} invited you to join
            <strong>${params.organizationName}</strong>
            as a <strong>${params.role}</strong>.
          </p>

          <p>
            <a
              href="${params.inviteUrl}"
              style="
                display:inline-block;
                padding:12px 20px;
                background:#111827;
                color:#fff;
                text-decoration:none;
                border-radius:8px;
                font-weight:600;
              "
            >
              Accept Invitation
            </a>
          </p>

          <p style="color:#6b7280;font-size:14px">
            This invitation expires on
            ${params.expiresAt.toISOString()}.
          </p>

          <p style="color:#6b7280;font-size:13px">
            If you weren't expecting this invitation, you can safely ignore this email.
          </p>
        </div>
      `,
    });

    if (error) {
      throw new InternalServerErrorException(
        `Failed to send invitation email: ${error.message}`,
      );
    }

    return { success: true };
  }
}
