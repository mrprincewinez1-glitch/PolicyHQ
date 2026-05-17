import Link from "next/link";
import { signUp } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function SignUpForm() {
  return (
    <>
      <form action={signUp} className="space-y-4">
        <label className="block text-sm font-semibold">Full name<Input name="full_name" required className="mt-1" /></label>
        <label className="block text-sm font-semibold">Email<Input name="email" type="email" required className="mt-1" /></label>
        <label className="block text-sm font-semibold">
          Phone / WhatsApp number
          <Input name="phone_number" type="tel" required placeholder="024 000 0000" className="mt-1" />
        </label>
        <label className="block text-sm font-semibold">Company name<Input name="company_name" className="mt-1" /></label>
        <label className="block text-sm font-semibold">Password<Input name="password" type="password" minLength={8} required className="mt-1" /></label>
        <label className="block text-sm font-semibold">Confirm password<Input name="confirm_password" type="password" minLength={8} required className="mt-1" /></label>
        <Button className="w-full" type="submit">Get Started Free</Button>
      </form>
      <p className="mt-5 text-center text-sm text-slate-600">Already have an account? <Link className="font-bold text-accent" href="/sign-in">Sign In</Link></p>
    </>
  );
}
