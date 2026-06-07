export const supportEmail = "policyhqgh@gmail.com";

export function feedbackMailto() {
  const subject = encodeURIComponent("PolicyHQ beta feedback");
  return `mailto:${supportEmail}?subject=${subject}`;
}
