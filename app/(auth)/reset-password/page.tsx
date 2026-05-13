import { AuthCard } from "@/components/auth-card";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export default function ResetPassword({ searchParams }: { searchParams: { error?: string } }) {
  return (
    <AuthCard title="Choose a new password" subtitle="Enter and confirm your new PolicyHQ password." message={searchParams.error}>
      <ResetPasswordForm />
    </AuthCard>
  );
}
