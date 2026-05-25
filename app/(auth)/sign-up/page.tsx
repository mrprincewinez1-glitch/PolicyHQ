import { AuthCard } from "@/components/auth-card";
import { SignUpForm } from "@/components/auth/sign-up-form";

export default async function SignUp({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  return (
    <AuthCard title="Start free" subtitle="Create your PolicyHQ workspace for your insurance book." message={params.error}>
      <SignUpForm />
    </AuthCard>
  );
}
