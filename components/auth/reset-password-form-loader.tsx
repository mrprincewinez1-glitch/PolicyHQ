"use client";

import dynamic from "next/dynamic";

const ResetPasswordForm = dynamic(
  () => import("@/components/auth/reset-password-form").then((module) => module.ResetPasswordForm),
  {
    ssr: false,
    loading: () => (
      <div className="space-y-4">
        <div className="skeleton h-12 rounded-xl" />
        <div className="skeleton h-11 rounded-xl" />
        <div className="skeleton h-11 rounded-xl" />
        <div className="skeleton h-11 rounded-xl" />
      </div>
    )
  }
);

export function ResetPasswordFormLoader() {
  return <ResetPasswordForm />;
}
