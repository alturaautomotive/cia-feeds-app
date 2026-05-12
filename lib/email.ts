import { Resend } from "resend";

const FROM = "CIA Feeds <noreply@ciafeed.com>";

/**
 * HTML-escape user-controlled strings before interpolating into email HTML
 * (SECURITY_AUDIT.md F-5.6).
 *
 * Threat: dealer names, lead names, lead messages, etc. are stored verbatim
 * and rendered into outgoing email HTML. Without escaping, a malicious
 * dealer could set their display name to a phishing payload and have it
 * delivered (from our verified sender domain) to any user whose email
 * mentions them \u2014 e.g. team invitees or admins receiving new-lead alerts.
 *
 * Most email clients sandbox script tags, but injected `<a>` tags, styled
 * `<span>` overlays, and form elements still render and can be used to
 * trick the recipient into clicking attacker-controlled links from a
 * trusted sender.
 */
export function esc(value: string | null | undefined): string {
  if (value == null) return "";
  return String(value).replace(/[&<>"']/g, (c) => HTML_ENTITY_MAP[c] ?? c);
}

const HTML_ENTITY_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/**
 * Lighter escape for URL strings that are interpolated into href attributes.
 * The URL is also HTML-escaped (handles &, <, > inside the path/query) and
 * the scheme is forced to http(s)/mailto. Any other scheme is replaced with
 * "#" to prevent javascript:/data:/file: smuggling.
 */
export function escUrl(value: string | null | undefined): string {
  if (value == null) return "#";
  const v = String(value).trim();
  if (!/^(https?:|mailto:)/i.test(v)) return "#";
  return esc(v);
}

function getResend(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  return new Resend(apiKey);
}

export async function sendWelcomeEmail(
  dealerName: string,
  dealerEmail: string
): Promise<void> {
  const resend = getResend();
  if (!resend) return;
  try {
    await resend.emails.send({
      from: FROM,
      to: dealerEmail,
      subject: "Welcome to CIA Feeds!",
      html: `<p>Hi ${esc(dealerName)},</p><p>Your CIA Feeds account is ready. Log in at any time to manage your vehicle inventory feed.</p><p>Thanks for signing up!</p>`,
    });
  } catch (err) {
    console.error("[email] sendWelcomeEmail failed:", err);
  }
}

export async function sendAdminNewSignupEmail(
  dealerName: string,
  dealerEmail: string
): Promise<void> {
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) return;
  const resend = getResend();
  if (!resend) return;
  try {
    await resend.emails.send({
      from: FROM,
      to: adminEmail,
      subject: "New CIA Feeds signup",
      html: `<p>A new dealer just signed up:</p><ul><li><strong>Name:</strong> ${esc(dealerName)}</li><li><strong>Email:</strong> ${esc(dealerEmail)}</li></ul>`,
    });
  } catch (err) {
    console.error("[email] sendAdminNewSignupEmail failed:", err);
  }
}

export async function sendNewLeadEmail(
  dealerEmail: string,
  leadName: string,
  leadEmail: string | undefined,
  leadPhone: string | undefined,
  vehicleInfo: string
): Promise<void> {
  const resend = getResend();
  if (!resend) return;
  const contact = [leadEmail, leadPhone].filter(Boolean).join(", ") || "No contact info";
  try {
    await resend.emails.send({
      from: FROM,
      to: dealerEmail,
      subject: `New lead on ${vehicleInfo}`,
      html: `<p>You have a new lead on <strong>${esc(vehicleInfo)}</strong>:</p><ul><li><strong>Name:</strong> ${esc(leadName)}</li><li><strong>Contact:</strong> ${esc(contact)}</li></ul>`,
    });
  } catch (err) {
    console.error("[email] sendNewLeadEmail failed:", err);
  }
}

export async function sendTeamInviteEmail(
  toEmail: string,
  dealerName: string,
  role: string,
  inviteUrl: string
): Promise<void> {
  const resend = getResend();
  if (!resend) return;
  try {
    await resend.emails.send({
      from: FROM,
      to: toEmail,
      subject: `You're invited to join ${dealerName} on CIA Feeds`,
      html: `<p>Hi,</p><p><strong>${esc(dealerName)}</strong> has invited you to join their team on CIA Feeds as <strong>${esc(role)}</strong>.</p><p>On the next screen you'll create your name and password to access <strong>${esc(dealerName)}</strong>'s account.</p><p>Click the link below to get started (valid for 7 days):</p><p><a href="${escUrl(inviteUrl)}">${esc(inviteUrl)}</a></p><p>If you did not expect this invitation, you can ignore this email.</p>`,
    });
  } catch (err) {
    console.error("[email] sendTeamInviteEmail failed:", err);
  }
}

export async function sendTeamPasswordSetEmail(
  toEmail: string,
  dealerName: string
): Promise<void> {
  const resend = getResend();
  if (!resend) return;
  const loginUrl = `${process.env.NEXTAUTH_URL || "https://www.ciafeed.com"}/login`;
  try {
    await resend.emails.send({
      from: FROM,
      to: toEmail,
      subject: `You've joined ${dealerName} on CIA Feeds`,
      html: `<p>Hi,</p><p>Your password has been set and you now have access to <strong>${esc(dealerName)}</strong>'s account on CIA Feeds.</p><p>You can log in anytime at: <a href="${escUrl(loginUrl)}">${esc(loginUrl)}</a></p>`,
    });
  } catch (err) {
    console.error("[email] sendTeamPasswordSetEmail failed:", err);
  }
}

export async function sendPasswordResetEmail(
  toEmail: string,
  resetUrl: string
): Promise<void> {
  const resend = getResend();
  if (!resend) return;
  try {
    await resend.emails.send({
      from: FROM,
      to: toEmail,
      subject: "Reset your CIA Feeds password",
      html: `<p>You requested a password reset. Click the link below to set a new password (valid for 1 hour):</p><p><a href="${escUrl(resetUrl)}">${esc(resetUrl)}</a></p><p>If you did not request this, you can ignore this email.</p>`,
    });
  } catch (err) {
    console.error("[email] sendPasswordResetEmail failed:", err);
  }
}

/**
 * Trial-ending notification (SECURITY_AUDIT.md F-4.2).
 * Sent when Stripe fires `customer.subscription.trial_will_end`, ~3 days
 * before billing kicks in. Dedupe-protected by Dealer.trialEndingNotifiedAt.
 */
export async function sendTrialEndingEmail(
  toEmail: string,
  dealerName: string,
  trialEndDate: Date
): Promise<void> {
  const resend = getResend();
  if (!resend) return;
  const billingUrl = `${process.env.NEXTAUTH_URL || "https://www.ciafeed.com"}/dashboard/billing`;
  const dateStr = trialEndDate.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  try {
    await resend.emails.send({
      from: FROM,
      to: toEmail,
      subject: "Your CIA Feeds trial ends soon",
      html: `<p>Hi ${esc(dealerName)},</p><p>Your CIA Feeds trial ends on <strong>${esc(dateStr)}</strong>. Your saved payment method will be charged automatically to continue service.</p><p>If you'd like to make any changes, visit your <a href="${escUrl(billingUrl)}">billing settings</a>.</p><p>Thanks for trying CIA Feeds!</p>`,
    });
  } catch (err) {
    console.error("[email] sendTrialEndingEmail failed:", err);
  }
}

/**
 * Meta-disconnected notification (SECURITY_AUDIT.md F-2.7).
 * Sent when the refresh-meta-tokens cron exhausts a dealer's refresh path,
 * so they reconnect before their CSV feed becomes the only fallback.
 */
export async function sendMetaTokenInvalidEmail(
  toEmail: string,
  dealerName: string
): Promise<void> {
  const resend = getResend();
  if (!resend) return;
  const connectUrl = `${process.env.NEXTAUTH_URL || "https://www.ciafeed.com"}/dashboard/integrations`;
  try {
    await resend.emails.send({
      from: FROM,
      to: toEmail,
      subject: "Your Meta connection on CIA Feeds needs attention",
      html: `<p>Hi ${esc(dealerName)},</p><p>We weren't able to refresh your Meta (Facebook/Instagram) connection on CIA Feeds. Until you reconnect, your inventory will be delivered to Meta via CSV feed instead of the live API.</p><p>It only takes a moment to reconnect: <a href="${escUrl(connectUrl)}">go to your integrations settings</a>.</p>`,
    });
  } catch (err) {
    console.error("[email] sendMetaTokenInvalidEmail failed:", err);
  }
}
