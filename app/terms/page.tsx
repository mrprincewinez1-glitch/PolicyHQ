import Link from "next/link";
import { PolicyHqLogo } from "@/components/brand/policyhq-logo";

const sections = [
  {
    title: "Use Of PolicyHQ",
    body: "PolicyHQ helps agents manage clients, policies, renewals, commissions, and related reminders. You are responsible for entering accurate client and policy information."
  },
  {
    title: "Client Consent",
    body: "Agents must have the right permission to store client contact details and send WhatsApp or email messages to clients."
  },
  {
    title: "No Insurance Advice",
    body: "PolicyHQ is a management tool. It does not underwrite insurance, sell policies, determine claims, or replace professional insurance advice."
  },
  {
    title: "Availability",
    body: "During beta, some features may change, pause, or improve quickly as we learn from agent feedback. We aim to keep the service reliable but cannot guarantee uninterrupted access."
  },
  {
    title: "Accounts And Security",
    body: "You are responsible for protecting your login credentials. PolicyHQ may restrict access if account activity appears unsafe or abusive."
  }
];

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <Link href="/" className="inline-flex rounded-lg focus:outline-none focus:ring-2 focus:ring-accent">
          <PolicyHqLogo className="h-12 w-auto" />
        </Link>
        <div className="mt-10 rounded-xl border border-slate-200 bg-white p-6 shadow-soft sm:p-8">
          <p className="text-sm font-bold text-accent">PolicyHQ</p>
          <h1 className="mt-2 text-3xl font-extrabold text-primary">Terms of Service</h1>
          <p className="mt-4 text-sm leading-6 text-slate-600">Last updated: 17 May 2026</p>
          <p className="mt-6 leading-7 text-slate-700">
            These terms describe the basic rules for using PolicyHQ during beta. They are intentionally plain-English and should be reviewed legally before full commercial launch.
          </p>
          <div className="mt-8 space-y-6">
            {sections.map((section) => (
              <section key={section.title}>
                <h2 className="text-lg font-bold text-primary">{section.title}</h2>
                <p className="mt-2 leading-7 text-slate-700">{section.body}</p>
              </section>
            ))}
          </div>
          <p className="mt-8 text-sm leading-6 text-slate-500">
            Continued use of PolicyHQ means you accept these beta terms.
          </p>
        </div>
      </div>
    </main>
  );
}
