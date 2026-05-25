import { AuthCard } from "@/components/auth-card";
import { ResetPasswordFormLoader } from "@/components/auth/reset-password-form-loader";

export default async function ResetPassword({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  return (
    <AuthCard title="Choose a new password" subtitle="Enter and confirm your new PolicyHQ password." message={params.error}>
      <ResetPasswordFormLoader />
    </AuthCard>
  );
}
