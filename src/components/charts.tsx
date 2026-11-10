"use client";

import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatPence } from "@/lib/money";
import { monthLabel } from "@/lib/utils";

// Brand teal for spend, navy for payments, red only for interest and fees.
const SPEND = "var(--brand)";
const PAYMENTS = "var(--navy)";
const INTFEES = "var(--negative)";
const DONUT = ["#0E7C66", "#1E3A5F", "#3FA58C", "#5B7BA6", "#86C9B7", "#9DB4D6", "#B9DDD3", "#CBD5E1"];

const axisTick = { fill: "var(--muted)", fontSize: 12 };
const tooltipStyle = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--ink)" };

export function SpendVsPaymentsChart({
  data,
  showInterest = false,
}: {
  data: { month: string; spend_pence: number; payments_pence: number; interest_fees_pence: number }[];
  showInterest?: boolean;
}) {
  const rows = data.map((d) => ({
    month: monthLabel(d.month),
    Spend: d.spend_pence / 100,
    Payments: d.payments_pence / 100,
    "Interest and fees": d.interest_fees_pence / 100,
  }));
  const summary = data
    .map((d) => `${monthLabel(d.month)}: spend ${formatPence(d.spend_pence, { whole: true })}, payments ${formatPence(d.payments_pence, { whole: true })}`)
    .join("; ");
  return (
    <figure className="m-0">
      <div className="h-72 w-full" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="month" tick={axisTick} tickLine={false} axisLine={{ stroke: "var(--border)" }} />
            <YAxis tick={axisTick} tickLine={false} axisLine={false} tickFormatter={(v) => `£${Number(v).toLocaleString("en-GB")}`} width={70} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v) => formatPence(Math.round(Number(v) * 100))} cursor={{ fill: "var(--surface-2)" }} />
            <Legend wrapperStyle={{ fontSize: 13 }} />
            <Bar dataKey="Spend" fill={SPEND} radius={[3, 3, 0, 0]} isAnimationActive={false} />
            <Bar dataKey="Payments" fill={PAYMENTS} radius={[3, 3, 0, 0]} isAnimationActive={false} />
            {showInterest ? <Bar dataKey="Interest and fees" fill={INTFEES} radius={[3, 3, 0, 0]} isAnimationActive={false} /> : null}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="sr-only">Monthly spend and payments. {summary}</figcaption>
    </figure>
  );
}

export function CategoryDonut({ data }: { data: { name: string; spend_pence: number; share_pct: number }[] }) {
  const top = data.slice(0, 7);
  const rest = data.slice(7).reduce((s, c) => s + c.spend_pence, 0);
  const restPct = Math.round(data.slice(7).reduce((s, c) => s + c.share_pct, 0) * 10) / 10;
  const rows = [...top.map((c) => ({ name: c.name, value: c.spend_pence / 100, pct: c.share_pct })), ...(rest > 0 ? [{ name: "Other", value: rest / 100, pct: restPct }] : [])];
  return (
    <figure className="m-0 flex flex-col items-center gap-4 sm:flex-row">
      <div className="h-56 w-56 flex-none" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={rows} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="95%" paddingAngle={1} isAnimationActive={false} stroke="var(--surface)">
              {rows.map((_, i) => (
                <Cell key={i} fill={DONUT[i % DONUT.length]} />
              ))}
            </Pie>
            <Tooltip contentStyle={tooltipStyle} formatter={(v) => formatPence(Math.round(Number(v) * 100))} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="w-full">
        <ul className="flex flex-col gap-2 text-sm">
          {rows.map((r, i) => (
            <li key={r.name} className="flex items-center gap-2.5">
              <span className="size-3 flex-none rounded-sm" style={{ background: DONUT[i % DONUT.length] }} aria-hidden="true" />
              <span className="flex-1">{r.name}</span>
              <span className="num text-muted">{r.pct}%</span>
              <span className="num w-24 text-right font-semibold">{formatPence(Math.round(r.value * 100), { whole: true })}</span>
            </li>
          ))}
        </ul>
      </figcaption>
    </figure>
  );
}

export function HBarList({ rows }: { rows: { label: string; value_pence: number; note?: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value_pence));
  return (
    <ul className="flex flex-col gap-3">
      {rows.map((r) => (
        <li key={r.label} className="flex items-center gap-3 text-sm">
          <span className="w-36 flex-none truncate sm:w-44" title={r.label}>
            {r.label}
          </span>
          <div className="h-2.5 flex-1 rounded-[5px] bg-border" aria-hidden="true">
            <div className="h-2.5 rounded-[5px] bg-brand" style={{ width: `${Math.max(2, (r.value_pence / max) * 100)}%` }} />
          </div>
          <span className="num w-24 text-right font-semibold">{formatPence(r.value_pence, { whole: true })}</span>
          {r.note ? <span className="hidden w-14 text-right text-muted sm:inline">{r.note}</span> : null}
        </li>
      ))}
    </ul>
  );
}
