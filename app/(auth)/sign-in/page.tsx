import { AuthCard } from "@/components/auth-card";
import { SignInForm } from "@/components/auth/sign-in-form";

export default function SignIn({ searchParams }: { searchParams: { error?: string; success?: string } }) {
  return (
    <AuthCard title="Welcome back" subtitle="Sign in to manage your clients, policies, commissions, and renewals." message={searchParams.error ?? searchParams.success}>
      <SignInForm />
    </AuthCard>
  );
}
