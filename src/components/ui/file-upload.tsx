"use client";
import { useState } from "react";
import { getBrowserClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n/client";
import { Icon } from "./icon";

/**
 * Uploads directly from the browser to Supabase Storage under "<uid>/..."
 * (storage policies only allow a user's own folder) and stores the path in a hidden input.
 */
export function FileUpload({ bucket, name, label, accept = "image/png,image/jpeg,image/webp,application/pdf", maxBytes = 10 * 1024 * 1024, existing }:
  { bucket: "laundry-logos" | "partner-docs" | "rider-docs"; name: string; label: string; accept?: string; maxBytes?: number; existing?: string | null }) {
  const { t } = useI18n();
  const [path, setPath] = useState<string>("");
  const [state, setState] = useState<"idle" | "uploading" | "done" | "error">(existing ? "done" : "idle");
  const [msg, setMsg] = useState<string | null>(null);

  const onChange = async (file: File | undefined) => {
    if (!file) return;
    setMsg(null);
    if (file.size > maxBytes) { setState("error"); setMsg(t.errors.file_too_large); return; }
    if (!accept.split(",").includes(file.type)) { setState("error"); setMsg(t.errors.validation); return; }
    const sb = getBrowserClient();
    const { data } = (await sb?.auth.getUser()) ?? { data: { user: null } };
    if (!sb || !data.user) { setState("error"); setMsg(t.errors.not_authenticated); return; }
    setState("uploading");
    const ext = file.type === "application/pdf" ? "pdf" : file.type.split("/")[1];
    const p = `${data.user.id}/${crypto.randomUUID()}.${ext}`;
    const { error } = await sb.storage.from(bucket).upload(p, file, { contentType: file.type });
    if (error) { setState("error"); setMsg(t.errors.upload_failed); return; }
    setPath(p);
    setState("done");
  };

  return (
    <div>
      <span className="mb-1.5 block text-sm font-semibold text-brand-950">{label}</span>
      <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-sm hover:bg-brand-50">
        <Icon name={state === "done" ? "check" : "file"} className={`size-5 ${state === "done" ? "text-emerald-600" : "text-slate-500"}`} />
        <span className="flex-1 text-slate-600">
          {state === "uploading" ? t.common.loading : state === "done" ? (path ? path.split("/").pop() : t.common.saved) : t.common.add}
        </span>
        <input type="file" accept={accept} className="sr-only" onChange={(e) => onChange(e.target.files?.[0])} />
      </label>
      <input type="hidden" name={name} value={path} />
      {msg && <p className="mt-1 text-xs text-red-600">{msg}</p>}
    </div>
  );
}
