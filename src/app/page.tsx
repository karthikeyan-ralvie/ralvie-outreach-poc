import Link from "next/link";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function HomePage() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <span className="serif text-2xl">Switchboard</span>
        <div className="flex gap-3">
          <Link href="/login" className="rounded-full px-4 py-2 text-sm text-ink-soft hover:text-ink">
            Sign in
          </Link>
          <Link href="/signup" className="rounded-full bg-clay px-4 py-2 text-sm text-white hover:bg-clay-dark">
            Create workspace
          </Link>
        </div>
      </header>
      <section className="mx-auto max-w-6xl px-6 pb-20 pt-10">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-clay">Outbound calling, without a war room</p>
        <h1 className="serif mt-4 max-w-3xl text-6xl leading-[1.05] tracking-tight">
          Voice agents that know your product, ask the right questions, and follow up.
        </h1>
        <p className="mt-6 max-w-xl text-lg text-ink-soft">
          Load a knowledge base, upload a contact list, and let DeepSeek + ElevenLabs run the conversation over Twilio.
          After the call, workflows send the email that matches the outcome.
        </p>
        <div className="mt-8 flex gap-3">
          <Link href="/signup" className="rounded-full bg-ink px-5 py-3 text-sm text-paper hover:bg-black">
            Start a workspace
          </Link>
          <Link href="/login" className="rounded-full border border-line bg-white px-5 py-3 text-sm">
            Sign in
          </Link>
        </div>
        <div className="mt-16 grid gap-4 md:grid-cols-3">
          {[
            ["Knowledge", "FAQs, notes, and website sync so the agent stays on-message."],
            ["Campaigns", "CSV/Excel contacts, auto-mapped columns, start and pause dialing."],
            ["Workflows", "If they book a demo — or say no — send the matching email."],
          ].map(([title, body]) => (
            <div key={title} className="rounded-2xl border border-line bg-white p-5">
              <h2 className="serif text-2xl">{title}</h2>
              <p className="mt-2 text-sm text-ink-soft">{body}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
