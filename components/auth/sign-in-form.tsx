import Link from "next/link";
import { signIn } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function SignInForm() {
  return (
    <>
      <form action={signIn} className="space-y-4">
        <label className="block text-sm font-semibold">Email<Input name="email" type="email" required className="mt-1" /></label>
        <label className="block text-sm font-semibold">Password<Input name="password" type="password" required className="mt-1" /></label>
        <Button className="w-full" type="submit">Sign In</Button>
      </form>
      <div className="mt-5 flex justify-between text-sm font-semibold">
        <Link className="text-accent" href="/forgot-password">Forgot Password?</Link>
        <Link href="/sign-up">Create account</Link>
      </div>
    </>
  );
}
