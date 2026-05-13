import { AuthCard } from "@/components/auth-card";
import { SignUpForm } from "@/components/auth/sign-up-form";

export default function SignUp({ searchParams }: { searchParams: { error?: string } }) {
  return (
    <AuthCard title="Start free" subtitle="Create your PolicyHQ workspace for your insurance book." message={searchParams.error}>
      <SignUpForm />
    </AuthCard>
  );
}
