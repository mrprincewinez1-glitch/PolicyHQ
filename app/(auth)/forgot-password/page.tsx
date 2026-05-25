import { AuthCard } from "@/components/auth-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { forgotPassword } from "../actions";

export default async function ForgotPassword({ searchParams }: { searchParams: Promise<{ error?: string; success?: string }> }) {
  const params = await searchParams;
  return (
    <AuthCard title="Reset password" subtitle="Enter your email and we will send a secure reset link." message={params.error ?? params.success}>
      <form action={forgotPassword} className="space-y-4">
        <label className="block text-sm font-semibold">Email<Input name="email" type="email" required className="mt-1" /></label>
        <Button className="w-full" type="submit">Send Reset Link</Button>
      </form>
    </AuthCard>
  );
}
