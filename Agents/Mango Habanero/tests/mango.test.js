import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const migration = readFileSync(resolve(root, '..', '..', 'crawl', 'supabase', 'migrations', '20260729170000_mango_habanero_review_dashboard.sql'), 'utf8');
const selection = readFileSync(resolve(root, '..', '..', 'crawl', 'supabase', 'migrations', '20260729172000_jalapeno_approved_queue_authority.sql'), 'utf8');
const lifecycle = readFileSync(resolve(root, '..', '..', 'crawl', 'supabase', 'migrations', '20260730233913_wing_review_intake_lifecycle.sql'), 'utf8');
const contractFix = readFileSync(resolve(root, '..', '..', 'crawl', 'supabase', 'migrations', '20260731030000_mango_habanero_review_contract_fix.sql'), 'utf8');
const source = readFileSync(resolve(root, 'src', 'main.jsx'), 'utf8');
const server = readFileSync(resolve(root, 'server', 'index.mjs'), 'utf8');

describe('Mango Habanero contracts', () => {
  it('has the local launcher and required environment contract', () => {
    expect(existsSync(resolve(root, 'Start Mango Habanero.bat'))).toBe(true);
    expect(readFileSync(resolve(root, '.env.example'), 'utf8')).toContain('SUPABASE_SERVICE_ROLE_KEY');
  });
  it('uses existing states and writes transition-backed review actions', () => {
    expect(migration).toContain("'in_review'"); expect(migration).toContain('wing_transition_submission');
    expect(migration).toContain('mango_review_wing_submission'); expect(migration).toContain('wing_admin_actions');
  });
  it('enforces one active priority and clears stale priority', () => {
    expect(migration).toContain('one_active_priority'); expect(migration).toContain('mango_clear_ineligible_priority');
    expect(migration).toContain("new.status <> 'approved'");
  });
  it('selects Make Next then oldest approved content and claims with row locking', () => {
    expect(selection).toContain('is_publish_priority desc'); expect(selection).toContain('approved_at asc nulls last, s.created_at asc, s.id'); expect(selection).toContain('for update skip locked'); expect(selection).not.toContain('order by random()');
  });
  it('keeps the service key out of frontend source and uses localhost only', () => {
    expect(source).not.toContain('SUPABASE_SERVICE_ROLE_KEY'); expect(server).toContain("'127.0.0.1'");
    if (existsSync(resolve(root, 'dist', 'assets'))) for (const file of readdirSync(resolve(root, 'dist', 'assets'))) expect(readFileSync(resolve(root, 'dist', 'assets', file), 'utf8')).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
  });
  it('keeps only actionable review submissions in the pending queue', () => {
    expect(source).toContain("new Set(['in_review'])");
    expect(source).toContain("item.status === 'in_review' && item.original_object_exists");
    expect(source).toContain("tab === 'pending'");
    expect(source).toContain("disabled={busy || !readyForReview}");
    expect(source).toContain("Original media unavailable");
    expect(source).toContain("<button className=\"reject\" disabled={busy} onClick={reject}>Reject</button>");
  });
  it('allows original private media to drive review and preview', () => {
    expect(contractFix).toContain("'original_object_exists'");
    expect(contractFix).toContain("when s.status = 'approved' then 'Approved / Awaiting Media Preparation'");
    expect(server).toContain("row.processed_storage_path || row.thumbnail_storage_path || row.original_storage_path");
    expect(server).toContain("path_kind: path === row.original_storage_path ? 'original'");
  });
  it('keeps approval atomic, reasoned, and transition-audited', () => {
    expect(lifecycle).toContain("v_submission.status <> 'in_review'");
    expect(lifecycle).toContain("'media_readiness', v_media_readiness");
    expect(lifecycle).toContain("'prior_status', v_submission.status");
    expect(lifecycle).toContain("approved_at = case when p_action = 'approve'");
    expect(lifecycle).toContain("approved_by = case when p_action = 'approve'");
    expect(lifecycle).toContain("rejection_reason_required");
  });
  it('publishes approved, eligible, unclaimed content only', () => {
    expect(selection).toContain("s.status = 'approved'");
    expect(selection).toContain("s.featured_at is null");
    expect(selection).toContain("s.processed_storage_path is not null");
    expect(selection).toContain('wing_generation_jobs g');
    expect(selection).toContain("g.status in ('pending', 'claimed', 'retry')");
    expect(selection).not.toContain("s.status in ('in_review', 'processing', 'rejected')");
  });
  it('does not relabel an approved row as processing without an active job', () => {
    expect(contractFix).toContain("j.status in ('pending', 'claimed', 'retry')");
    expect(contractFix).toContain("'Approved / Preparing Media'");
    expect(contractFix).toContain("when s.status = 'approved' then 'Approved / Awaiting Media Preparation'");
    expect(source).toContain("activeMediaJob ? 'Processing media' : 'Awaiting media preparation'");
  });
});
