import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { PolicyHqLogo } from "@/components/brand/policyhq-logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { feedbackMailto, supportEmail } from "@/lib/site";

export default function FeedbackPage() {
  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <Link href="/" className="inline-flex rounded-lg focus:outline-none focus:ring-2 focus:ring-accent">
          <PolicyHqLogo className="h-12 w-auto" />
        </Link>
        <Card className="mt-10">
          <CardContent className="p-6 sm:p-8">
            <MessageCircle className="h-10 w-10 text-accent" />
            <p className="mt-5 text-sm font-bold text-accent">Private beta feedback</p>
            <h1 className="mt-2 text-3xl font-extrabold text-primary">Help improve PolicyHQ</h1>
            <p className="mt-4 leading-7 text-slate-700">
              If something feels confusing, slow, missing, or broken, send a short note. Include the page you were on and what you expected to happen.
            </p>
            <div className="mt-6 rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-700">
              <p className="font-bold text-primary">Useful feedback examples</p>
              <p className="mt-2">“I tried to add a motor policy and got stuck at insurer.”</p>
              <p>“The commission total did not match what I expected.”</p>
              <p>“This screen is hard to use on my phone.”</p>
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button asChild>
                <a href={feedbackMailto()}>Email Feedback</a>
              </Button>
              <Button asChild variant="outline">
                <Link href="/demo">Return to Demo</Link>
              </Button>
            </div>
            <p className="mt-5 text-sm text-slate-500">Beta support: {supportEmail}</p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
