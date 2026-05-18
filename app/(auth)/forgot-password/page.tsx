import { AuthCard } from "@/components/auth-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { forgotPassword } from "../actions";

export default function ForgotPassword({ searchParams }: { searchParams: { error?: string; success?: string } }) {
  return (
    <AuthCard title="Reset password" subtitle="Enter your email and we will send a secure reset link." message={searchParams.error ?? searchParams.success}>
      <form action={forgotPassword} className="space-y-4">
        <label className="block text-sm font-semibold">Email<Input name="email" type="email" required className="mt-1" /></label>
        <Button className="w-full" type="submit">Send Reset Link</Button>
      </form>
    </AuthCard>
  );
}
