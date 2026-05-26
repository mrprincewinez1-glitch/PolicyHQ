import Link from "next/link";
import { Bell, Calculator, FileDown, MessageCircle, ShieldCheck, Users, Workflow } from "lucide-react";
import { PolicyHqLogo } from "@/components/brand/policyhq-logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { feedbackMailto, supportEmail } from "@/lib/site";

const features = [
  [Bell, "Renewal Alerts", "Never lose a client to an expired policy again"],
  [Users, "Client Management", "Keep all your client information organised and searchable"],
  [ShieldCheck, "Policy Tracker", "Track every policy across all insurers in one dashboard"],
  [Calculator, "Commission Tracker", "Know exactly what you've earned and what's pending"],
  [MessageCircle, "WhatsApp-Ready Follow-Up", "Prepare renewal follow-ups for WhatsApp workflows as your agency grows"],
  [FileDown, "Reports & Exports", "Review renewal, policy, and commission activity in one place"]
];

export default function LandingPage() {
  return (
    <main className="bg-white">
      <header className="sticky top-0 z-30 border-b border-slate-100 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-3 py-3 sm:px-6 sm:py-4 lg:px-8">
          <Link href="/" className="flex items-center">
            <PolicyHqLogo className="h-9 w-auto max-w-[118px] sm:h-14 sm:max-w-none" />
          </Link>
          <nav className="hidden items-center gap-6 text-sm font-semibold text-slate-600 lg:flex">
            <a href="#features">Features</a>
            <a href="#how">How It Works</a>
            <Link href="/demo">Try Live Demo</Link>
            <Link href="/feedback">Feedback</Link>
          </nav>
          <div className="flex shrink-0 items-center gap-2">
            <Button asChild size="sm" variant="outline" className="whitespace-nowrap border-primary px-3 text-primary hover:border-accent hover:text-accent sm:px-4">
              <Link href="/sign-in">Sign In</Link>
            </Button>
            <Button asChild size="sm" className="whitespace-nowrap px-3 sm:px-5">
              <Link href="/sign-up">Sign Up</Link>
            </Button>
          </div>
        </div>
      </header>

      <section className="mx-auto grid min-h-[calc(100vh-73px)] max-w-7xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[1fr_0.95fr] lg:px-8">
        <div>
          <h1 className="max-w-3xl text-4xl font-extrabold tracking-normal text-primary sm:text-5xl md:text-6xl">Manage Every Policy. Never Miss a Renewal.</h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">
            PolicyHQ is the all-in-one platform built for insurance agents in Ghana and West Africa. Track policies, manage clients, prepare renewal reminders, and monitor your commissions — all in one place.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild><Link href="/sign-up">Start For Free</Link></Button>
            <Button asChild variant="outline"><Link href="/demo">Try Live Demo</Link></Button>
            <Button asChild variant="ghost"><a href="#how">See How It Works</a></Button>
          </div>
        </div>
        <div className="dashboard-mockup rounded-[1.5rem] border border-slate-200 p-4 shadow-soft">
          <div className="rounded-2xl bg-primary p-4 text-white">
            <div className="mb-5 flex items-center justify-between">
              <PolicyHqLogo variant="dark" className="h-9 w-auto" />
              <span className="rounded-full bg-accent px-3 py-1 text-xs font-bold">Live renewals</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {["This Week", "Next Week", "This Month"].map((item, index) => (
                <div key={item} className="rounded-xl bg-white/10 p-4">
                  <span className="text-xs text-white/70">{item}</span>
                  <strong className="mt-3 block text-3xl">{[3, 4, 9][index]}</strong>
                </div>
              ))}
            </div>
            <div className="mt-4 space-y-2 rounded-xl bg-white p-3 text-primary">
              {["Kwame Mensah", "Abena Asante", "Kofi Boateng"].map((name) => (
                <div key={name} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-3 text-sm">
                  <span>{name}</span>
                  <span className="font-bold text-accent">Renewal due</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="bg-slate-50 py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-extrabold text-primary">Everything an Insurance Agent Needs</h2>
          <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {features.map(([Icon, title, body]) => (
              <Card key={title as string}>
                <CardContent className="p-6">
                  <Icon className="h-8 w-8 text-accent" />
                  <h3 className="mt-5 text-lg font-bold">{title as string}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{body as string}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section id="how" className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <h2 className="text-3xl font-extrabold text-primary">How It Works</h2>
        <div className="mt-8 grid gap-6 md:grid-cols-3">
          {[
            ["Add Your Clients & Policies", "Manually add your book of business and keep every client-policy relationship organised"],
            ["Set Up Renewal Reminders", "PolicyHQ helps you track 30, 14, and 7 day renewal windows for WhatsApp and email follow-up"],
            ["Track Renewals & Commissions", "Monitor every renewal in real time and know exactly what commissions you are owed"]
          ].map(([title, body], index) => (
            <div key={title} className="border-l-4 border-accent pl-5">
              <Workflow className="mb-4 h-7 w-7 text-primary" />
              <span className="text-sm font-bold text-accent">Step {index + 1}</span>
              <h3 className="mt-2 text-xl font-bold">{title}</h3>
              <p className="mt-2 text-slate-600">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-primary py-20 text-white">
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
          <h2 className="text-3xl font-extrabold">See PolicyHQ in Action</h2>
          <p className="mt-3 text-slate-300">Explore a live interactive demo — no sign up required</p>
          <Button asChild className="mt-8"><Link href="/demo">Try Live Demo</Link></Button>
        </div>
      </section>

      <footer className="bg-primary px-4 py-10 text-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <PolicyHqLogo variant="dark" className="h-11 w-auto" />
            <p className="mt-3 text-sm text-slate-300">Built for insurance agents across West Africa</p>
            <p className="mt-2 text-sm text-slate-300">Beta support: <a className="font-semibold text-white" href={feedbackMailto()}>{supportEmail}</a></p>
          </div>
          <div className="flex flex-wrap gap-5 text-sm text-slate-300"><Link href="/privacy">Privacy Policy</Link><Link href="/terms">Terms of Service</Link><Link href="/feedback">Feedback</Link></div>
          <p className="text-sm text-slate-300">© 2026 PolicyHQ. All rights reserved.</p>
        </div>
      </footer>
    </main>
  );
}
