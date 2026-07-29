import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const migration = readFileSync(resolve(root, '..', '..', 'crawl', 'supabase', 'migrations', '20260729170000_mango_habanero_review_dashboard.sql'), 'utf8');
const selection = readFileSync(resolve(root, '..', '..', 'crawl', 'supabase', 'migrations', '20260729171000_mango_habanero_jalapeno_priority_selection.sql'), 'utf8');

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
  it('selects priority before random fallback and claims with row locking', () => {
    expect(selection).toContain('x.is_publish_priority'); expect(selection).toContain('order by random()'); expect(selection).toContain('for update skip locked');
  });
  it('keeps the service key out of frontend source and uses localhost only', () => {
    const source = readFileSync(resolve(root, 'src', 'main.jsx'), 'utf8'); const server = readFileSync(resolve(root, 'server', 'index.mjs'), 'utf8');
    expect(source).not.toContain('SUPABASE_SERVICE_ROLE_KEY'); expect(server).toContain("'127.0.0.1'");
    if (existsSync(resolve(root, 'dist', 'assets'))) for (const file of readdirSync(resolve(root, 'dist', 'assets'))) expect(readFileSync(resolve(root, 'dist', 'assets', file), 'utf8')).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
  });
});
