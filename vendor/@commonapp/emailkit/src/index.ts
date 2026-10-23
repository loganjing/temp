export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/**
 * Sends an email via SMTP. SMTP configuration is read from environment variables:
 * - SMTP_HOST: SMTP server host
 * - SMTP_PORT: SMTP server port (default 587)
 * - SMTP_USER: SMTP auth username
 * - SMTP_PASS: SMTP auth password
 * - SMTP_FROM: From address (defaults to SMTP_USER)
 *
 * If SMTP_HOST is not set, the email content is logged instead of sent,
 * and the function resolves successfully (best-effort, no-op).
 */
export async function sendEmail(options: SendEmailOptions): Promise<void> {
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = process.env.SMTP_PORT || '587';
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpFrom = process.env.SMTP_FROM || smtpUser;

  if (!smtpHost) {
    console.log(
      `[emailkit] SMTP not configured — skipping email\n  To: ${options.to}\n  Subject: ${options.subject}\n  Body: ${options.text || options.html}`
    );
    return;
  }

  try {
    const nodemailer = await import('nodemailer');
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: parseInt(smtpPort, 10),
      secure: parseInt(smtpPort, 10) === 465,
      auth: smtpUser ? { user: smtpUser, pass: smtpPass } : undefined,
    });
    await transporter.sendMail({
      from: smtpFrom,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
    });
    console.log(`[emailkit] Email sent to ${options.to}: ${options.subject}`);
  } catch (err) {
    console.error(
      `[emailkit] Failed to send email to ${options.to}:`,
      err instanceof Error ? err.message : String(err)
    );
    throw err;
  }
}
