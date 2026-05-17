import { AuthCard } from "@/components/auth-card";
import { ResetPasswordFormLoader } from "@/components/auth/reset-password-form-loader";

export default function ResetPassword({ searchParams }: { searchParams: { error?: string } }) {
  return (
    <AuthCard title="Choose a new password" subtitle="Enter and confirm your new PolicyHQ password." message={searchParams.error}>
      <ResetPasswordFormLoader />
    </AuthCard>
  );
}
