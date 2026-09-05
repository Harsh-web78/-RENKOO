/*
 * RENKOO transactional email templates.
 *
 * Visual language: professional, clean, premium,
 * restrained. No fake links — every URL passed in
 * must be a real application URL built from
 * APP_PUBLIC_URL / FRONTEND_URL configuration.
 */

function escapeHtml(
  value: string,
): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function layout(params: {
  preheader: string;
  heading: string;
  intro: string;
  bodyHtml?: string;
  actionUrl?: string;
  actionLabel?: string;
  footnote?: string;
}): string {
  const action =
    params.actionUrl && params.actionLabel
      ? `
        <p style="margin:28px 0 8px">
          <a
            href="${escapeHtml(params.actionUrl)}"
            style="
              display:inline-block;
              padding:12px 24px;
              background:#0f172a;
              color:#ffffff;
              text-decoration:none;
              border-radius:8px;
              font-weight:600;
              font-size:14px;
            "
          >
            ${escapeHtml(params.actionLabel)}
          </a>
        </p>
        <p style="color:#94a3b8;font-size:12px;word-break:break-all">
          ${escapeHtml(params.actionUrl)}
        </p>
      `
      : '';

  const body = params.bodyHtml
    ? `<div style="margin:16px 0;color:#334155;font-size:14px;line-height:1.65">${params.bodyHtml}</div>`
    : '';

  const footnote = params.footnote
    ? `<p style="color:#94a3b8;font-size:12px;line-height:1.6">${escapeHtml(params.footnote)}</p>`
    : '';

  return `
    <div style="display:none;max-height:0;overflow:hidden;opacity:0">
      ${escapeHtml(params.preheader)}
    </div>
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;background:#f1f5f9;padding:32px 16px">
      <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden">
        <div style="padding:24px 32px;border-bottom:1px solid #f1f5f9">
          <div style="font-size:13px;font-weight:700;letter-spacing:0.22em;color:#0f172a">RENKOO</div>
          <div style="font-size:12px;color:#64748b;margin-top:2px">AI Growth Operating System</div>
        </div>
        <div style="padding:32px">
          <h1 style="margin:0 0 12px;font-size:20px;line-height:1.4;color:#0f172a">${escapeHtml(params.heading)}</h1>
          <p style="margin:0;color:#334155;font-size:14px;line-height:1.65">${escapeHtml(params.intro)}</p>
          ${body}
          ${action}
          ${footnote}
        </div>
        <div style="padding:20px 32px;background:#f8fafc;border-top:1px solid #f1f5f9">
          <p style="margin:0;color:#94a3b8;font-size:12px;line-height:1.6">
            This is an automated message from RENKOO. If you were not expecting it, you can safely ignore it.
          </p>
        </div>
      </div>
    </div>
  `;
}

export function buildVerificationEmail(params: {
  name?: string | null;
  verifyUrl: string;
  expiresHours: number;
}): { subject: string; html: string; text: string } {
  const greeting = params.name?.trim()
    ? `Hi ${params.name.trim()},`
    : 'Hi,';

  return {
    subject: 'Verify your RENKOO account',
    html: layout({
      preheader:
        'Confirm your email address to activate your RENKOO account.',
      heading: 'Verify your email address',
      intro: `${greeting} thanks for creating your RENKOO account. Please confirm your email address to finish setting up your workspace.`,
      actionUrl: params.verifyUrl,
      actionLabel: 'Verify email address',
      footnote: `This verification link expires in ${params.expiresHours} hours.`,
    }),
    text: [
      'Verify your email address',
      '',
      `${greeting} thanks for creating your RENKOO account. Please confirm your email address to finish setting up your workspace:`,
      params.verifyUrl,
      '',
      `This verification link expires in ${params.expiresHours} hours. If you were not expecting this email, you can safely ignore it.`,
    ].join('\n'),
  };
}

export function buildPasswordResetEmail(params: {
  name?: string | null;
  resetUrl: string;
  expiresMinutes: number;
}): { subject: string; html: string; text: string } {
  const greeting = params.name?.trim()
    ? `Hi ${params.name.trim()},`
    : 'Hi,';

  return {
    subject: 'Reset your RENKOO password',
    html: layout({
      preheader:
        'Use this link to reset your RENKOO password.',
      heading: 'Reset your password',
      intro: `${greeting} we received a request to reset the password for your RENKOO account. Use the button below to choose a new password.`,
      actionUrl: params.resetUrl,
      actionLabel: 'Reset password',
      footnote: `This reset link is single-use and expires in ${params.expiresMinutes} minutes. If you did not request this, no action is needed.`,
    }),
    text: [
      'Reset your password',
      '',
      `${greeting} we received a request to reset the password for your RENKOO account. Choose a new password here:`,
      params.resetUrl,
      '',
      `This reset link is single-use and expires in ${params.expiresMinutes} minutes. If you did not request this, no action is needed.`,
    ].join('\n'),
  };
}

export function buildReportEmail(params: {
  reportTitle: string;
  websiteName: string;
  websiteUrl: string;
  shareUrl: string;
  senderOrgName?: string | null;
  message?: string | null;
}): { subject: string; html: string; text: string } {
  const fromLine = params.senderOrgName?.trim()
    ? ` shared by ${params.senderOrgName.trim()}`
    : '';

  const customMessage =
    params.message?.trim() &&
    params.message.trim().length > 0
      ? `<p style="margin:0 0 4px;padding:12px 16px;background:#f8fafc;border-left:3px solid #0f172a;border-radius:0 8px 8px 0">${escapeHtml(params.message.trim().slice(0, 1000))}</p>`
      : '';

  return {
    subject: `RENKOO report: ${params.reportTitle}`,
    html: layout({
      preheader: `Your RENKOO growth report for ${params.websiteName} is ready.`,
      heading: params.reportTitle,
      intro: `Your growth report for ${params.websiteName} (${params.websiteUrl}) is ready${fromLine}. Open the secure link below to view it.`,
      bodyHtml: customMessage,
      actionUrl: params.shareUrl,
      actionLabel: 'View report',
      footnote:
        'This is a secure read-only link. It may expire or be revoked by the sender.',
    }),
    text: [
      params.reportTitle,
      '',
      `Your growth report for ${params.websiteName} (${params.websiteUrl}) is ready${fromLine}. Open the secure link below to view it:`,
      params.shareUrl,
      ...(params.message?.trim()
        ? ['', `Message from the sender: ${params.message.trim().slice(0, 1000)}`]
        : []),
      '',
      'This is a secure read-only link. It may expire or be revoked by the sender.',
    ].join('\n'),
  };
}

export function buildNotificationEmail(params: {
  subject: string;
  title: string;
  message: string;
  actionUrl?: string;
  actionLabel?: string;
}): { subject: string; html: string; text: string } {
  return {
    subject: params.subject,
    html: layout({
      preheader: params.title,
      heading: params.title,
      intro: params.message,
      actionUrl: params.actionUrl,
      actionLabel: params.actionLabel,
    }),
    text: [
      params.title,
      '',
      params.message,
      ...(params.actionUrl
        ? ['', params.actionUrl]
        : []),
    ].join('\n'),
  };
}

export function buildTeamInviteEmail(params: {
  organizationName: string;
  inviterName?: string | null;
  role: string;
  inviteUrl: string;
  expiresAt: Date;
}): { subject: string; html: string; text: string } {
  const inviter =
    params.inviterName?.trim() ||
    'Your organization admin';

  return {
    subject: `You're invited to join ${params.organizationName} on RENKOO`,
    html: layout({
      preheader: `${inviter} invited you to join ${params.organizationName} on RENKOO.`,
      heading: "You're invited to RENKOO",
      intro: `${inviter} invited you to join ${params.organizationName} as ${params.role}.`,
      actionUrl: params.inviteUrl,
      actionLabel: 'Accept invitation',
      footnote: `This invitation expires on ${params.expiresAt.toISOString()}.`,
    }),
    text: [
      "You're invited to RENKOO",
      '',
      `${inviter} invited you to join ${params.organizationName} as ${params.role}. Accept the invitation here:`,
      params.inviteUrl,
      '',
      `This invitation expires on ${params.expiresAt.toISOString()}.`,
    ].join('\n'),
  };
}
