import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Logo } from "@/components/logo";
import { Card } from "@/components/ui";
import { getUser } from "@/lib/session";
import { CodeForm } from "../login-form";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

/**
 * Opened from the sign-in email: the code is filled in, and the person presses "Sign in". Nothing is verified
 * on page load, so email link scanners that fetch this page can't use the code up.
 */
export default async function CodePage({ searchParams }: { searchParams: Promise<{ email?: string; code?: string; next?: string }> }) {
  const sp = await searchParams;
  if (await getUser()) redirect("/app");
  const email = z.string().email().max(320).safeParse(sp.email ?? "");
  if (!email.success) redirect("/login");
  const code = /^\d{6}$/.test(sp.code ?? "") ? sp.code! : "";
  const next = sp.next && sp.next.startsWith("/app") ? sp.next : "/app";
  return (
    <div className="flex min-h-screen flex-col bg-surface-2">
      <header className="mx-auto w-full max-w-[1160px] px-6 py-5">
        <Logo />
      </header>
      <main id="main" className="flex flex-1 items-start justify-center px-6 pt-10">
        <Card className="w-full max-w-[440px] p-8">
          <h1 className="font-display text-2xl font-bold">Sign in to Cardlens</h1>
          <p className="mt-2 text-[15px] text-muted">
            Signing in as <strong className="text-ink">{email.data}</strong>.
          </p>
          <CodeForm email={email.data} next={next} code={code} fromLink />
          <p className="mt-6 text-[13px] text-muted">
            By continuing you agree to our <Link href="/terms">terms</Link> and <Link href="/privacy">privacy notice</Link>.
          </p>
        </Card>
      </main>
    </div>
  );
}
