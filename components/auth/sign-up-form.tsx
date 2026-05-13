"use client";

import Link from "next/link";
import { useState } from "react";
import type { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";

export function SignUpForm() {
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    const formData = new FormData(event.currentTarget);
    const fullName = String(formData.get("full_name") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim();
    const phoneNumber = normalizePhone(String(formData.get("phone_number") ?? ""));
    const companyName = String(formData.get("company_name") ?? "").trim();
    const password = String(formData.get("password") ?? "");
    const confirm = String(formData.get("confirm_password") ?? "");

    if (!fullName || !email || !phoneNumber || password.length < 8 || password !== confirm) {
      setLoading(false);
      setMessage("Please enter your name, email, phone number, and matching passwords of at least 8 characters.");
      return;
    }

    const supabase = createClient();
    const profileData = { full_name: fullName, company_name: companyName, phone_number: phoneNumber || null };
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/dashboard`,
        data: profileData
      }
    });
    setLoading(false);

    if (error) {
      setMessage(`We could not create your account. Setup detail: ${error.message}`);
      return;
    }

    if (!data.session) {
      setMessage("Account created. Now sign in with the same email and password.");
      window.location.assign("/sign-in");
      return;
    }

    await supabase.auth.getSession();
    window.location.assign("/dashboard");
  }

  return (
    <>
      {message ? <p className="mb-4 rounded-xl bg-orange-50 p-3 text-sm font-semibold text-orange-700">{message}</p> : null}
      <form onSubmit={submit} className="space-y-4">
        <label className="block text-sm font-semibold">Full name<Input name="full_name" required className="mt-1" /></label>
        <label className="block text-sm font-semibold">Email<Input name="email" type="email" required className="mt-1" /></label>
        <label className="block text-sm font-semibold">
          Phone / WhatsApp number
          <Input name="phone_number" type="tel" required placeholder="024 000 0000 or +233 24 000 0000" className="mt-1" />
        </label>
        <label className="block text-sm font-semibold">Company name<Input name="company_name" className="mt-1" /></label>
        <label className="block text-sm font-semibold">Password<Input name="password" type="password" minLength={8} required className="mt-1" /></label>
        <label className="block text-sm font-semibold">Confirm password<Input name="confirm_password" type="password" minLength={8} required className="mt-1" /></label>
        <Button className="w-full" type="submit" disabled={loading}>{loading ? "Creating account..." : "Get Started Free"}</Button>
      </form>
      <p className="mt-5 text-center text-sm text-slate-600">Already have an account? <Link className="font-bold text-accent" href="/sign-in">Sign In</Link></p>
    </>
  );
}

function normalizePhone(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("+")) return `+${trimmed.replace(/\D/g, "")}`;

  const digits = trimmed.replace(/\D/g, "");
  if (digits.startsWith("0")) return `+233${digits.slice(1)}`;
  if (digits.startsWith("233")) return `+${digits}`;
  return `+233${digits}`;
}
