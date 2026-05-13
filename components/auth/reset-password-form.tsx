"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";

type ResetState = "checking" | "ready" | "invalid" | "saving" | "saved";

export function ResetPasswordForm() {
  const [state, setState] = useState<ResetState>("checking");
  const [message, setMessage] = useState("Checking your reset link...");

  useEffect(() => {
    let isMounted = true;
    const supabase = createClient();

    async function prepareResetSession() {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (!isMounted) return;

        if (error) {
          setState("invalid");
          setMessage("This password reset link is invalid or has expired. Please request a new one.");
          return;
        }

        window.history.replaceState({}, document.title, "/reset-password");
        setState("ready");
        setMessage("Enter your new password.");
        return;
      }

      const { data } = await supabase.auth.getSession();
      if (!isMounted) return;

      if (data.session) {
        setState("ready");
        setMessage("Enter your new password.");
        return;
      }

      setState("invalid");
      setMessage("Open the password reset link from your email, or request a new reset link.");
    }

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" && isMounted) {
        setState("ready");
        setMessage("Enter your new password.");
      }
    });

    void prepareResetSession();

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state !== "ready") return;

    const formData = new FormData(event.currentTarget);
    const password = String(formData.get("password") ?? "");
    const confirm = String(formData.get("confirm_password") ?? "");

    if (password.length < 8 || password !== confirm) {
      setMessage("Use matching passwords of at least 8 characters.");
      return;
    }

    setState("saving");
    setMessage("Updating your password...");

    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setState("ready");
      setMessage("We could not update your password. Please request a new reset link and try again.");
      return;
    }

    await supabase.auth.signOut();
    setState("saved");
    setMessage("Password updated. You can now sign in with your new password.");
  }

  if (state === "invalid") {
    return (
      <div className="space-y-4">
        <p className="rounded-xl bg-orange-50 p-3 text-sm font-semibold text-orange-700">{message}</p>
        <Button asChild className="w-full">
          <Link href="/forgot-password">Request New Link</Link>
        </Button>
      </div>
    );
  }

  if (state === "saved") {
    return (
      <div className="space-y-4">
        <p className="rounded-xl bg-green-50 p-3 text-sm font-semibold text-green-700">{message}</p>
        <Button asChild className="w-full">
          <Link href="/sign-in">Go to Sign In</Link>
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="rounded-xl bg-slate-50 p-3 text-sm font-semibold text-slate-700">{message}</p>
      <label className="block text-sm font-semibold">
        New Password
        <Input name="password" type="password" minLength={8} required disabled={state !== "ready"} className="mt-1" />
      </label>
      <label className="block text-sm font-semibold">
        Confirm New Password
        <Input name="confirm_password" type="password" minLength={8} required disabled={state !== "ready"} className="mt-1" />
      </label>
      <Button className="w-full" type="submit" disabled={state !== "ready"}>
        {state === "saving" ? "Updating Password..." : "Update Password"}
      </Button>
    </form>
  );
}
