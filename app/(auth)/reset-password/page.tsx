import { AuthCard } from "@/components/auth-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { resetPassword } from "../actions";

export default function ResetPassword({ searchParams }: { searchParams: { error?: string } }) {
  return (
    <AuthCard title="Choose a new password" subtitle="Enter and confirm your new PolicyHQ password." message={searchParams.error}>
      <form action={resetPassword} className="space-y-4">
        <label className="block text-sm font-semibold">New Password<Input name="password" type="password" minLength={8} required className="mt-1" /></label>
        <label className="block text-sm font-semibold">Confirm New Password<Input name="confirm_password" type="password" minLength={8} required className="mt-1" /></label>
        <Button className="w-full" type="submit">Update Password</Button>
      </form>
    </AuthCard>
  );
}
