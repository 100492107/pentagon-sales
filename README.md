# Pentagon Motor Group — Commission Tracker

Personal commission tracker for Pentagon Motor Group Sales Consultants (2026/27 scheme).

## Features
- Exact vehicle + F&I rates (GAP removed)
- £3,000 take-home target
- Pentagon branding
- **Cloud sync via Supabase** (multi-device)
- Local fallback + JSON export/import

## Supabase setup (one-time)
1. Create free project at https://supabase.com
2. SQL Editor → run:
```sql
create table deals (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz default now()
);
alter table deals enable row level security;
create policy "Allow all" on deals for all using (true) with check (true);
```
3. Project Settings → API → copy URL + anon key into the **Cloud Sync** tab
4. Click Connect → data now syncs across every device

## Scheme
| Type | Order | Delivery |
|------|-------|----------|
| New Retail | £40 | £40 |
| New Motability | £30 | £30 |
| Used | — | £60 |

F&I New: Finance £10 · Paint/Refresh/Warranty £35 · Care Pack £25  
F&I Used: Finance £60 · Paint/Refresh/Warranty £30 · Assurance £10
