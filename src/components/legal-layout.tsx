import { Logo } from "@/components/logo";

export function LegalLayout({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-surface">
      <header className="border-b border-border">
        <div className="mx-auto max-w-[1160px] px-6 py-[18px]">
          <Logo />
        </div>
      </header>
      <main id="main" className="mx-auto max-w-[720px] px-6 py-14">
        <h1 className="font-display text-4xl font-bold">{title}</h1>
        <p className="mt-2 text-sm text-muted">Last updated {updated} · Draft pending legal review</p>
        <div className="mt-8 flex flex-col gap-4 text-[16px] leading-relaxed [&_h2]:mt-6 [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc">
          {children}
        </div>
      </main>
    </div>
  );
}
