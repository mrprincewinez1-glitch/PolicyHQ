export const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || "support@policyhq.app";

export function feedbackMailto() {
  const subject = encodeURIComponent("PolicyHQ beta feedback");
  return `mailto:${supportEmail}?subject=${subject}`;
}
