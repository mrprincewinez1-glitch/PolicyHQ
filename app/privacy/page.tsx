import Link from "next/link";
import { PolicyHqLogo } from "@/components/brand/policyhq-logo";

const sections = [
  {
    title: "Information We Collect",
    body: "PolicyHQ stores account details, client contact information, policy records, renewal activity, commission records, and notification preferences needed to operate the platform."
  },
  {
    title: "How We Use Information",
    body: "We use this information to help agents manage client relationships, track policies, calculate commissions, and send renewal or relationship-management reminders where enabled."
  },
  {
    title: "Data Access",
    body: "Each agent can only access the clients, policies, commissions, and notifications that belong to their own account. PolicyHQ uses Supabase Row Level Security to enforce this separation."
  },
  {
    title: "Third-Party Services",
    body: "PolicyHQ uses Supabase for authentication, database, storage, and scheduled functions; Vercel for hosting; Resend for email; and WhatsApp Business Cloud API for WhatsApp messaging."
  },
  {
    title: "Retention And Deletion",
    body: "Client records may be archived instead of immediately deleted so policy and commission history remains consistent. Agents can request help reviewing or removing account data."
  }
];

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <Link href="/" className="inline-flex rounded-lg focus:outline-none focus:ring-2 focus:ring-accent">
          <PolicyHqLogo className="h-12 w-auto" />
        </Link>
        <div className="mt-10 rounded-xl border border-slate-200 bg-white p-6 shadow-soft sm:p-8">
          <p className="text-sm font-bold text-accent">PolicyHQ</p>
          <h1 className="mt-2 text-3xl font-extrabold text-primary">Privacy Policy</h1>
          <p className="mt-4 text-sm leading-6 text-slate-600">Last updated: 17 May 2026</p>
          <p className="mt-6 leading-7 text-slate-700">
            PolicyHQ is built for insurance agents and small insurance teams in Ghana and West Africa. This policy explains the practical way we handle account, client, policy, and messaging data.
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
            This beta privacy policy is not a substitute for formal legal advice. It should be reviewed before a full commercial launch.
          </p>
        </div>
      </div>
    </main>
  );
}
