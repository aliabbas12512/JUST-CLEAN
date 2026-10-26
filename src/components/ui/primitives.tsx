import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { Icon, type IconName } from "./icon";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "success";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary: "bg-brand-900 text-white hover:bg-brand-800 shadow-sm",
  secondary: "bg-white text-brand-900 ring-1 ring-inset ring-[var(--line)] hover:bg-brand-50",
  ghost: "text-brand-800 hover:bg-brand-50",
  danger: "bg-red-600 text-white hover:bg-red-700",
  success: "bg-emerald-600 text-white hover:bg-emerald-700",
};
const sizes: Record<Size, string> = {
  sm: "h-9 px-3 text-sm gap-1.5",
  md: "h-11 px-4 text-[15px] gap-2",
  lg: "h-13 px-6 text-base gap-2",
};

export function btnClass(variant: Variant = "primary", size: Size = "md", extra = "") {
  return `inline-flex items-center justify-center rounded-xl font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 ${variants[variant]} ${sizes[size]} ${extra}`;
}

export function Button({ variant = "primary", size = "md", className = "", icon, children, ...rest }:
  ComponentProps<"button"> & { variant?: Variant; size?: Size; icon?: IconName }) {
  return (
    <button className={btnClass(variant, size, className)} {...rest}>
      {icon && <Icon name={icon} className="size-4.5" />}
      {children}
    </button>
  );
}

export function LinkButton({ variant = "primary", size = "md", className = "", icon, children, ...rest }:
  ComponentProps<typeof Link> & { variant?: Variant; size?: Size; icon?: IconName }) {
  return (
    <Link className={btnClass(variant, size, className)} {...rest}>
      {icon && <Icon name={icon} className="size-4.5" />}
      {children}
    </Link>
  );
}

export function Card({ className = "", children, ...rest }: ComponentProps<"div">) {
  return (
    <div className={`rounded-2xl bg-[var(--surface)] ring-1 ring-[var(--line)] ${className}`} {...rest}>
      {children}
    </div>
  );
}

export function CardHeader({ title, action, subtitle }: { title: ReactNode; action?: ReactNode; subtitle?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
      <div>
        <h2 className="font-bold text-brand-950">{title}</h2>
        {subtitle && <p className="text-sm text-[var(--muted)]">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

type Tone = "gray" | "blue" | "green" | "amber" | "red" | "violet";
const tones: Record<Tone, string> = {
  gray: "bg-slate-100 text-slate-700",
  blue: "bg-brand-50 text-brand-700",
  green: "bg-emerald-50 text-emerald-700",
  amber: "bg-amber-50 text-amber-800",
  red: "bg-red-50 text-red-700",
  violet: "bg-violet-50 text-violet-700",
};

export function Badge({ tone = "gray", children, className = "" }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${tones[tone]} ${className}`}>{children}</span>;
}

export function Field({ label, hint, children, className = "" }: { label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-sm font-semibold text-brand-950">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-[var(--muted)]">{hint}</span>}
    </label>
  );
}

export const inputClass =
  "block w-full rounded-xl border-0 bg-white px-3.5 py-2.5 text-[15px] text-brand-950 ring-1 ring-inset ring-[var(--line)] placeholder:text-slate-400 focus:ring-2 focus:ring-brand-500 disabled:bg-slate-50";

export function Input(props: ComponentProps<"input">) {
  return <input {...props} className={`${inputClass} ${props.className ?? ""}`} />;
}
export function Select(props: ComponentProps<"select">) {
  return <select {...props} className={`${inputClass} ${props.className ?? ""}`} />;
}
export function Textarea(props: ComponentProps<"textarea">) {
  return <textarea rows={3} {...props} className={`${inputClass} ${props.className ?? ""}`} />;
}

export function Checkbox({ label, ...rest }: ComponentProps<"input"> & { label: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 text-[15px]">
      <input type="checkbox" className="mt-1 size-4.5 rounded accent-brand-700" {...rest} />
      <span>{label}</span>
    </label>
  );
}

export function PageHeader({ title, subtitle, back, actions }: { title: ReactNode; subtitle?: ReactNode; back?: string; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex items-start justify-between gap-3">
      <div className="flex items-start gap-2">
        {back && (
          <Link href={back} className="mt-0.5 rounded-lg p-1.5 text-brand-800 hover:bg-brand-50" aria-label="back">
            <Icon name="chevron" className="size-5 -scale-x-100" />
          </Link>
        )}
        <div>
          <h1 className="text-xl font-bold text-brand-950 sm:text-2xl">{title}</h1>
          {subtitle && <p className="mt-0.5 text-sm text-[var(--muted)]">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ icon = "box", title, body, action }: { icon?: IconName; title: ReactNode; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-2xl bg-white px-6 py-12 text-center ring-1 ring-[var(--line)]">
      <div className="mb-3 rounded-full bg-brand-50 p-3 text-brand-700">
        <Icon name={icon} className="size-7" />
      </div>
      <p className="font-bold text-brand-950">{title}</p>
      {body && <p className="mt-1 max-w-sm text-sm text-[var(--muted)]">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Alert({ tone = "blue", title, children, icon }: { tone?: "blue" | "amber" | "red" | "green"; title?: ReactNode; children?: ReactNode; icon?: IconName }) {
  const map = {
    blue: "bg-brand-50 text-brand-900 ring-brand-100",
    amber: "bg-amber-50 text-amber-900 ring-amber-200",
    red: "bg-red-50 text-red-800 ring-red-200",
    green: "bg-emerald-50 text-emerald-900 ring-emerald-200",
  } as const;
  const ic: IconName = icon ?? (tone === "red" || tone === "amber" ? "alert" : tone === "green" ? "check" : "info");
  return (
    <div className={`flex gap-3 rounded-xl px-4 py-3 ring-1 ${map[tone]}`} role={tone === "red" ? "alert" : undefined} data-tone={tone}>
      <Icon name={ic} className="mt-0.5 size-5" />
      <div className="text-sm">
        {title && <p className="font-bold">{title}</p>}
        {children && <div className={title ? "mt-0.5" : ""}>{children}</div>}
      </div>
    </div>
  );
}

export function Stat({ label, value, icon, href }: { label: ReactNode; value: ReactNode; icon?: IconName; href?: string }) {
  const body = (
    <Card className="p-4 transition-shadow hover:shadow-sm">
      <div className="flex items-center justify-between text-[var(--muted)]">
        <span className="text-sm">{label}</span>
        {icon && <Icon name={icon} className="size-4.5" />}
      </div>
      <div className="font-num mt-2 text-2xl font-bold text-brand-950">{value}</div>
    </Card>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export function Stars({ value, count, size = "size-4" }: { value: number; count?: number; size?: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-sm">
      <Icon name="star" className={`${size} fill-amber-400 text-amber-400`} />
      <span className="font-num font-semibold">{Number(value).toFixed(1)}</span>
      {count !== undefined && <span className="font-num text-[var(--muted)]">({count})</span>}
    </span>
  );
}

export function Table({ head, children }: { head: ReactNode[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-[var(--line)]">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="bg-slate-50 text-[var(--muted)]">
          <tr>{head.map((h, i) => <th key={i} className="px-3 py-2.5 text-start font-semibold">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-[var(--line)]">{children}</tbody>
      </table>
    </div>
  );
}

export function Td({ children, className = "" }: { children?: ReactNode; className?: string }) {
  return <td className={`px-3 py-2.5 align-top ${className}`}>{children}</td>;
}

export function Tabs({ items, active }: { items: { key: string; label: ReactNode; href: string; count?: number }[]; active: string }) {
  return (
    <div className="mb-4 flex gap-1 overflow-x-auto rounded-xl bg-white p-1 ring-1 ring-[var(--line)]">
      {items.map((it) => (
        <Link
          key={it.key}
          href={it.href}
          className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold ${it.key === active ? "bg-brand-900 text-white" : "text-[var(--muted)] hover:bg-slate-50"}`}
        >
          {it.label}
          {it.count !== undefined && <span className="font-num rounded-full bg-black/10 px-1.5 text-xs">{it.count}</span>}
        </Link>
      ))}
    </div>
  );
}

export function KV({ k, v }: { k: ReactNode; v: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 text-sm">
      <span className="text-[var(--muted)]">{k}</span>
      <span className="text-end font-medium text-brand-950">{v}</span>
    </div>
  );
}
