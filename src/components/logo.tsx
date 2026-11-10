import Link from "next/link";

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2.5 text-ink no-underline">
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
        <rect x="2" y="6" width="24" height="16" rx="3" stroke="currentColor" strokeWidth="2" />
        <circle cx="18" cy="14" r="4" stroke="var(--brand)" strokeWidth="2" />
        <path d="M21 17l3 3" stroke="var(--brand)" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <span className="font-display text-xl font-bold">Cardlens</span>
    </Link>
  );
}
