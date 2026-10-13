import { readFileSync } from 'node:fs';
const contract=JSON.parse(readFileSync(new URL('../../../artifacts/app-polish/release-qa/production-contract.json',import.meta.url),'utf8'));
// Reduced synthetic tables, overlaid with the actual read-only deployed vote
// definitions/policies/constraints. No production records or connection URLs.
export function deployedVotingFixtureSQL() {
  let sql=`alter table public.wing_media_submissions add column if not exists dislike_count integer not null default 0;
alter table public.wing_media_photo_votes add column if not exists updated_at timestamptz not null default now();
alter table public.wing_media_photo_votes add column if not exists created_at timestamptz not null default now();
alter table public.wing_media_photo_votes enable row level security;
grant select,insert,update,delete on public.wing_media_photo_votes to authenticated;
grant all on public.wing_media_photo_votes to service_role;`;
  for(const name of ['is_public_wing_jury_photo','validate_wing_media_photo_vote','refresh_wing_media_photo_vote_counts','validate_wing_jury_vote_insert','enforce_wing_jury_vote_immutability','refresh_wing_jury_photo_vote_counts']) {
    sql+=contract.functions.find(f=>f.schema==='private'&&f.name===name).definition+';';
  }
  for(const c of contract.constraints.filter(c=>['wing_media_photo_votes','wing_jury_votes'].includes(c.table))) sql+=`alter table public.${c.table} drop constraint if exists ${c.name};alter table public.${c.table} add constraint ${c.name} ${c.definition};`;
  for(const p of contract.policies.filter(p=>p.tablename==='wing_media_photo_votes')) sql+=`drop policy if exists ${p.policyname} on public.${p.tablename};create policy ${p.policyname} on public.${p.tablename} for ${p.cmd} to authenticated ${p.qual?`using (${p.qual})`:''} ${p.with_check?`with check (${p.with_check})`:''};`;
  for(const t of contract.triggers.filter(t=>['wing_media_photo_votes','wing_jury_votes'].includes(t.table))) sql+=`drop trigger if exists ${t.name} on public.${t.table};${t.definition};`;
  return sql;
}
