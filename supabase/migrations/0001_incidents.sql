-- REPRO incident history. Optional; the demo path does not read it.
-- Written only by the server with the secret key. RLS is enabled with no
-- policies, so anon/authenticated clients cannot read or write anything.

create table if not exists public.incidents (
  id              text primary key,                 -- incident.id from the extension
  captured_at     timestamptz not null,
  page_url        text not null,
  method          text not null,
  endpoint        text not null,
  status          integer not null,
  runtime_error   text,
  incident        jsonb not null,                   -- sanitized Incident
  analysis        jsonb,                            -- IncidentAnalysis
  analysis_source text check (analysis_source in ('model', 'fallback')),
  replay_outcome  text check (replay_outcome in ('reproduced', 'not_reproduced', 'diverged', 'inconclusive')),
  issue_url       text,
  created_at      timestamptz not null default now()
);

create index if not exists incidents_created_at_idx on public.incidents (created_at desc);
create index if not exists incidents_signature_idx on public.incidents (endpoint, status);

alter table public.incidents enable row level security;
-- (no "force": the server writes as service_role, which bypasses RLS by design)
-- No policies on purpose: only the service/secret key (which bypasses RLS) touches this table.

-- service_role bypasses RLS but still needs table privileges
grant select, insert, update on public.incidents to service_role;
