import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const migration = readFileSync(resolve(root, '..', '..', 'crawl', 'supabase', 'migrations', '20260729170000_mango_habanero_review_dashboard.sql'), 'utf8');
const selection = readFileSync(resolve(root, '..', '..', 'crawl', 'supabase', 'migrations', '20260729172000_jalapeno_approved_queue_authority.sql'), 'utf8');

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
    const source = readFileSync(resolve(root, 'src', 'main.jsx'), 'utf8'); const server = readFileSync(resolve(root, 'server', 'index.mjs'), 'utf8');
    expect(source).not.toContain('SUPABASE_SERVICE_ROLE_KEY'); expect(server).toContain("'127.0.0.1'");
    if (existsSync(resolve(root, 'dist', 'assets'))) for (const file of readdirSync(resolve(root, 'dist', 'assets'))) expect(readFileSync(resolve(root, 'dist', 'assets', file), 'utf8')).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
  });
  it('keeps uploaded and processing submissions visible in the pending queue', () => {
    const source = readFileSync(resolve(root, 'src', 'main.jsx'), 'utf8');
    expect(source).toContain("new Set(['uploaded', 'processing', 'in_review'])");
    expect(source).not.toContain("const readyForReview=item.status==='in_review'");
    expect(source).toContain("tab === 'pending' && <><button className=\"approve\"");
    expect(source).toContain("<button className=\"reject\" disabled={busy} onClick={reject}>Reject</button>");
  });
});
