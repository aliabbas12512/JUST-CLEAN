-- Just Clean — storage buckets, realtime publication and scheduled jobs.

-- Storage: logos are public, verification documents are private.
-- Object paths are "<auth.uid()>/<file>" so ownership can be checked from the path.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('laundry-logos', 'laundry-logos', true, 2097152, array['image/png','image/jpeg','image/webp']),
  ('partner-docs', 'partner-docs', false, 10485760, array['image/png','image/jpeg','image/webp','application/pdf']),
  ('rider-docs', 'rider-docs', false, 10485760, array['image/png','image/jpeg','image/webp','application/pdf'])
on conflict (id) do nothing;

create policy "logos public read" on storage.objects for select
  using (bucket_id = 'laundry-logos');
create policy "logos owner write" on storage.objects for insert to authenticated
  with check (bucket_id = 'laundry-logos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "logos owner update" on storage.objects for update to authenticated
  using (bucket_id = 'laundry-logos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "logos owner delete" on storage.objects for delete to authenticated
  using (bucket_id = 'laundry-logos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "docs owner or admin read" on storage.objects for select to authenticated
  using (bucket_id in ('partner-docs','rider-docs')
         and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
create policy "docs owner write" on storage.objects for insert to authenticated
  with check (bucket_id in ('partner-docs','rider-docs') and (storage.foldername(name))[1] = auth.uid()::text);

-- Realtime: order tracking, rider jobs and in-app notifications.
alter publication supabase_realtime add table public.orders, public.order_events, public.delivery_jobs, public.notifications;

-- pg_cron (enable it in Supabase: Database -> Extensions). If it is not
-- available, the Vercel cron at /api/cron/maintenance calls run_maintenance().
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('just-clean-maintenance', '*/5 * * * *', 'select public.run_maintenance()');
  end if;
end $$;
