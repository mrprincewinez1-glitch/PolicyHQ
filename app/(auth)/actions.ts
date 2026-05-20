"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { normalizeGhanaPhoneNumber } from "@/lib/utils";

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function authRedirect(path: string, key: "error" | "success", message: string): never {
  redirect(`${path}?${key}=${encodeURIComponent(message)}`);
}

function normalizePhone(input: string) {
  return normalizeGhanaPhoneNumber(input);
}

function ensureSupabase(path: string) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    authRedirect(path, "error", "Sign up is not connected yet. Please set up Supabase first, or use the live demo.");
  }
}

function siteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "https://policy-hq-beta.vercel.app").replace(/\/$/, "");
}

export async function signUp(formData: FormData) {
  const fullName = value(formData, "full_name");
  const email = value(formData, "email");
  const phoneNumber = normalizePhone(value(formData, "phone_number"));
  const password = value(formData, "password");
  const confirm = value(formData, "confirm_password");
  const companyName = value(formData, "company_name");
  if (!fullName || !email || !phoneNumber || password.length < 8 || password !== confirm) {
    authRedirect("/sign-up", "error", "Please enter your name, email, phone number, and matching passwords of at least 8 characters.");
  }
  ensureSupabase("/sign-up");
  const supabase = createClient();
  const profileData = { full_name: fullName, company_name: companyName, phone_number: phoneNumber || null };
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${siteUrl()}/dashboard`,
      data: profileData
    }
  });
  if (error) authRedirect("/sign-up", "error", "We could not create your account. Please try again.");
  if (!data.session) authRedirect("/sign-in", "success", "Account created. Please check your email to confirm your account, then sign in.");
  redirect("/dashboard");
}

export async function signIn(formData: FormData) {
  const email = value(formData, "email");
  const password = value(formData, "password");
  ensureSupabase("/sign-in");
  const supabase = createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    const message = error.message.toLowerCase().includes("confirm")
      ? "Please confirm your email first, or turn off email confirmation in Supabase for testing."
      : "Supabase rejected this login. Check the email and password, or create a fresh account after turning email confirmation off.";
    authRedirect("/sign-in", "error", message);
  }
  redirect("/dashboard");
}

export async function signOut() {
  ensureSupabase("/sign-in");
  const supabase = createClient();
  await supabase.auth.signOut();
  redirect("/sign-in");
}

export async function forgotPassword(formData: FormData) {
  const email = value(formData, "email");
  if (!email) {
    authRedirect("/forgot-password", "error", "Enter the email address on your PolicyHQ account.");
  }
  ensureSupabase("/forgot-password");
  const supabase = createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl()}/reset-password`
  });
  if (error) {
    authRedirect("/forgot-password", "error", "We could not send the reset email. Please check the address and try again.");
  }
  authRedirect("/forgot-password", "success", "Check your email for a password reset link.");
}

export async function resetPassword(formData: FormData) {
  const password = value(formData, "password");
  const confirm = value(formData, "confirm_password");
  if (password.length < 8 || password !== confirm) {
    authRedirect("/reset-password", "error", "Use matching passwords of at least 8 characters.");
  }
  ensureSupabase("/reset-password");
  const supabase = createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) authRedirect("/reset-password", "error", "We could not update your password.");
  redirect("/dashboard");
}
