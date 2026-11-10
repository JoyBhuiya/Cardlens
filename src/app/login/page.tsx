import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { Card } from "@/components/ui";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  return (
    <div className="flex min-h-screen flex-col bg-surface-2">
      <header className="mx-auto w-full max-w-[1160px] px-6 py-5">
        <Logo />
      </header>
      <main id="main" className="flex flex-1 items-start justify-center px-6 pt-10">
        <Card className="w-full max-w-[440px] p-8">
          <h1 className="font-display text-2xl font-bold">Sign in to Cardlens</h1>
          <p className="mt-2 text-[15px] text-muted">We&apos;ll email you a secure sign-in link. No password needed.</p>
          {error ? (
            <p role="alert" className="mt-4 rounded-[8px] bg-negative/10 px-3 py-2 text-sm text-negative">
              That link has expired or was already used. Request a new one below.
            </p>
          ) : null}
          <LoginForm next={next && next.startsWith("/app") ? next : "/app"} />
          <p className="mt-6 text-[13px] text-muted">
            By continuing you agree to our <Link href="/terms">terms</Link> and <Link href="/privacy">privacy notice</Link>.
          </p>
        </Card>
      </main>
    </div>
  );
}
