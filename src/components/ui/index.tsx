import * as React from "react";
import { cn } from "@/lib/utils";

/* shadcn/ui-style primitives styled with the Cardlens tokens (8px controls, 14px cards, 1px borders, 44px targets). */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "md" | "lg" | "sm";

export function buttonClasses(variant: ButtonVariant = "primary", size: ButtonSize = "md", className?: string) {
  return cn(
    "inline-flex items-center justify-center gap-2 rounded-[8px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 no-underline",
    size === "lg" && "min-h-12 px-[22px] text-base",
    size === "md" && "min-h-11 px-[18px] text-[15px]",
    size === "sm" && "min-h-9 px-3 text-sm",
    variant === "primary" && "bg-brand text-white hover:bg-brand-strong dark:text-surface",
    variant === "secondary" && "border border-border-strong/60 bg-surface text-ink hover:bg-surface-2",
    variant === "ghost" && "text-ink hover:bg-surface-2",
    variant === "danger" && "bg-negative text-white hover:opacity-90",
    className,
  );
}

export function Button({
  variant,
  size,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <button className={buttonClasses(variant, size, className)} {...props} />;
}

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-[14px] border border-border bg-surface", className)} {...props} />;
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-1 p-5 pb-0 sm:p-6 sm:pb-0", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn("font-display text-lg font-semibold", className)} {...props} />;
}

export function CardBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5 sm:p-6", className)} {...props} />;
}

type BadgeTone = "neutral" | "brand" | "positive" | "negative" | "warning";
export function Badge({ tone = "neutral", className, ...props }: React.HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap",
        tone === "neutral" && "bg-surface-2 text-muted border border-border",
        tone === "brand" && "bg-brand-soft text-brand-strong",
        tone === "positive" && "bg-positive/10 text-positive",
        tone === "negative" && "bg-negative/10 text-negative",
        tone === "warning" && "bg-warning/10 text-warning",
        className,
      )}
      {...props}
    />
  );
}

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      className={cn(
        "min-h-12 w-full rounded-[8px] border border-border-strong bg-surface px-3.5 text-base text-ink placeholder:text-[#6b7280]",
        className,
      )}
      {...props}
    />
  );
});

export function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn("min-h-11 rounded-[8px] border border-border-strong bg-surface px-3 text-[15px] text-ink", className)}
      {...props}
    />
  );
}

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("text-[15px] font-semibold", className)} {...props} />;
}

export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn("w-full border-collapse text-sm", className)} {...props} />
    </div>
  );
}
export function Th({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className={cn("border-b border-border px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted", className)} {...props} />;
}
export function Td({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("border-b border-border px-3 py-2.5 align-middle", className)} {...props} />;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-[8px] bg-surface-2", className)} aria-hidden="true" />;
}

export function Stat({ label, value, tone }: { label: string; value: string; tone?: "negative" | "positive" }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-[10px] border border-border bg-surface p-4">
      <span className="text-xs text-muted">{label}</span>
      <span className={cn("num font-display text-xl font-semibold sm:text-2xl", tone === "negative" && "text-negative", tone === "positive" && "text-positive")}>
        {value}
      </span>
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        {description ? <p className="text-[15px] text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="no-print flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <Card className="flex flex-col items-start gap-3 p-8">
      <h2 className="font-display text-xl font-semibold">{title}</h2>
      <p className="max-w-prose text-[15px] text-muted">{body}</p>
      {action}
    </Card>
  );
}
