import { Resend } from "resend";

const FROM = "CIA Feeds <noreply@ciafeed.com>";

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
      html: `<p>Hi ${dealerName},</p><p>Your CIA Feeds account is ready. Log in at any time to manage your vehicle inventory feed.</p><p>Thanks for signing up!</p>`,
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
      html: `<p>A new dealer just signed up:</p><ul><li><strong>Name:</strong> ${dealerName}</li><li><strong>Email:</strong> ${dealerEmail}</li></ul>`,
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
      html: `<p>You have a new lead on <strong>${vehicleInfo}</strong>:</p><ul><li><strong>Name:</strong> ${leadName}</li><li><strong>Contact:</strong> ${contact}</li></ul>`,
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
      html: `<p>Hi,</p><p><strong>${dealerName}</strong> has invited you to join their team on CIA Feeds as <strong>${role}</strong>.</p><p>Click the link below to accept the invitation (valid for 7 days):</p><p><a href="${inviteUrl}">${inviteUrl}</a></p><p>If you did not expect this invitation, you can ignore this email.</p>`,
    });
  } catch (err) {
    console.error("[email] sendTeamInviteEmail failed:", err);
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
      html: `<p>You requested a password reset. Click the link below to set a new password (valid for 1 hour):</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>If you did not request this, you can ignore this email.</p>`,
    });
  } catch (err) {
    console.error("[email] sendPasswordResetEmail failed:", err);
  }
}
