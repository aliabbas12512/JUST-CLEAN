"use client";
import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n/client";
import type { ActionResult } from "@/lib/types";
import { Alert, btnClass } from "./primitives";
import type { IconName } from "./icon";
import { Icon } from "./icon";

export type FormAction = (prev: ActionResult<unknown> | null, fd: FormData) => Promise<ActionResult<unknown>>;

export function SubmitButton({ children, variant = "primary", size = "md", className = "", icon, name, value, confirmText }:
  { children: ReactNode; variant?: "primary" | "secondary" | "ghost" | "danger" | "success"; size?: "sm" | "md" | "lg";
    className?: string; icon?: IconName; name?: string; value?: string; confirmText?: string }) {
  const { pending } = useFormStatus();
  const { t } = useI18n();
  return (
    <button
      type="submit"
      name={name}
      value={value}
      disabled={pending}
      aria-busy={pending}
      onClick={(e) => {
        if (confirmText && !window.confirm(confirmText)) e.preventDefault();
      }}
      className={btnClass(variant, size, className)}
    >
      {pending ? <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : icon && <Icon name={icon} className="size-4.5" />}
      {pending ? t.common.loading : children}
    </button>
  );
}

/**
 * Wraps a server action. Shows localized errors from ActionResult.error,
 * an optional success message, and refreshes server data on success.
 */
export function ActionForm({ action, children, className = "", successMessage, resetOnSuccess = false, onSuccess, redirectTo }:
  { action: FormAction; children: ReactNode; className?: string; successMessage?: string | boolean;
    resetOnSuccess?: boolean; onSuccess?: (r: ActionResult<unknown>) => void; redirectTo?: string }) {
  const [state, formAction] = useActionState(action, null);
  const { t } = useI18n();
  const router = useRouter();
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) {
      if (resetOnSuccess) ref.current?.reset();
      onSuccess?.(state);
      if (redirectTo) router.push(redirectTo);
      else router.refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const errorText = state && !state.ok ? ((t.errors as Record<string, string>)[state.error] ?? t.errors.generic) : null;
  const okText = state?.ok && successMessage ? (typeof successMessage === "string" ? successMessage : state.message ?? t.common.saved) : null;

  return (
    <form ref={ref} action={formAction} className={className}>
      {children}
      {errorText && <div className="mt-3"><Alert tone="red">{errorText}</Alert></div>}
      {okText && <div className="mt-3"><Alert tone="green">{okText}</Alert></div>}
    </form>
  );
}
