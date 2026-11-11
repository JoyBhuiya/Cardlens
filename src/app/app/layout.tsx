import type { Metadata } from "next";
import { Logo } from "@/components/logo";
import { AppNav } from "@/components/app-nav";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Overview", robots: { index: false } };

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireUser();
  return (
    <div className="min-h-screen bg-surface-2 lg:grid lg:grid-cols-[248px_1fr]">
      <aside className="no-print border-b border-border bg-surface lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between gap-4 px-5 py-4 lg:flex-col lg:items-stretch lg:gap-8 lg:py-6">
          <Logo href="/app" />
          <AppNav />
          <div className="hidden flex-col gap-2 text-[13px] text-muted lg:mt-auto lg:flex">
            <span className="truncate" title={user.email ?? ""}>{user.email}</span>
            <form action="/auth/signout" method="post">
              <button type="submit" className="min-h-9 font-semibold text-ink hover:underline">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </aside>
      <main id="main" className="min-w-0 px-4 py-6 sm:px-8 sm:py-8">
        <div className="mx-auto max-w-[1100px]">{children}</div>
      </main>
    </div>
  );
}
