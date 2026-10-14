"use client";

import { useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { Button, Card, ErrorText, Field, Input } from "@/components/ui";

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError("");
    try {
      await api("/api/auth/signup", {
        method: "POST",
        body: JSON.stringify({ name, email, password }),
      });
      const res = await signIn("credentials", { email, password, redirect: false });
      if (res?.error) throw new Error("Account created, but sign-in failed.");
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create account");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-md p-8">
        <p className="serif text-3xl">Create a workspace</p>
        <p className="mt-1 text-sm text-ink-soft">You will add DeepSeek, ElevenLabs, and Twilio keys next.</p>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <Field label="Your name">
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </Field>
          <Field label="Email">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Field>
          <Field label="Password">
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required />
          </Field>
          <ErrorText>{error}</ErrorText>
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Creating…" : "Create workspace"}
          </Button>
        </form>
        <p className="mt-5 text-center text-sm text-ink-soft">
          Already have one?{" "}
          <Link href="/login" className="text-clay">
            Sign in
          </Link>
        </p>
      </Card>
    </div>
  );
}
