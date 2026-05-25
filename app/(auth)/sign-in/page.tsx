import { AuthCard } from "@/components/auth-card";
import { SignInForm } from "@/components/auth/sign-in-form";

export default async function SignIn({ searchParams }: { searchParams: Promise<{ error?: string; success?: string }> }) {
  const params = await searchParams;
  return (
    <AuthCard title="Welcome back" subtitle="Sign in to manage your clients, policies, commissions, and renewals." message={params.error ?? params.success}>
      <SignInForm />
    </AuthCard>
  );
}
