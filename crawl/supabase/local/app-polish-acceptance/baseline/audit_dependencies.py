"""Read-only dependency inventory; never executes SQL or accesses a backend."""
from pathlib import Path
import hashlib
import json
import re
import sys

ROOT = Path(__file__).resolve().parents[5]
SOURCE = Path(__file__).with_name('provided-media-voting.sql')
text = SOURCE.read_text(encoding='utf-8')
tables = sorted(set(re.findall(r'create\s+table\s+([\w.]+)', text, re.I)))
triggers = sorted(set(re.findall(r'execute\s+function\s+([\w.]+)\s*\(', text, re.I)))
indexes = re.findall(r'create\s+(?:unique\s+)?index\s+if\s+not\s+exists\s+(\w+)', text, re.I)
definitions = set(re.findall(r'create\s+(?:or\s+replace\s+)?function\s+([\w.]+)', text, re.I))
references = sorted(set(re.findall(r'references\s+([\w.]+)\s*\(', text, re.I)))
worker = (ROOT / 'Agents/Jalapeno/wing_processing_worker/repository.py').read_text(encoding='utf-8')
worker_rpcs = sorted(set(re.findall(r'self\._rpc\(\s*"([\w]+)"', worker)))
contract = json.loads((ROOT / 'artifacts/app-polish/release-qa/production-contract.json').read_text(encoding='utf-8-sig'))
retained = {f["schema"] + '.' + f["name"] for f in contract['functions']}
assert len(tables) == 4, tables
assert len(triggers) == 9, triggers
assert len(indexes) == 13, indexes
report = {
 'status': 'INCOMPLETE_BASELINE_NOT_APPLIED',
 'scope': 'static dependency audit of supplied DDL and actual worker call sites; not runtime or staging acceptance',
 'source': str(SOURCE.relative_to(ROOT)).replace('\\', '/'),
 'source_sha256': hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
 'supplied_tables': tables,
 'supplied_index_count': len(indexes),
 'supplied_trigger_count': len(triggers),
 'referenced_parent_tables': references,
 'missing_app_parent_definitions': ['public.destinations', 'public.destination_ratings'],
 'platform_bootstrap_dependency': 'auth.users and real GoTrue/Auth JWT helpers; must be supplied by isolated Supabase, not a stub',
 'missing_trigger_function_definitions_in_export': [f for f in triggers if f not in definitions],
 'missing_index_function_definition': 'public.wing_media_is_public_status(text)',
 'retained_trigger_definition_references': sorted(f for f in triggers if f in retained),
 'retained_references_limitation': 'Some actual deployed voting functions are captured locally; no full upload/worker/storage baseline or installed schema is established by these references.',
 'worker_rpcs_not_defined_in_export': worker_rpcs,
 'upload_rpcs_not_defined_in_export': ['reserve_wing_submission_upload', 'finalize_wing_submission_upload'],
 'additional_baseline_contracts': ['review_wing_submission_v2', 'wingman_consume_rate_limit', 'wingman_create_destination', 'private.require_authenticated_user', 'private.is_public_wing_jury_photo'],
 'rls_enable_statements_in_export': len(re.findall(r'enable\s+row\s+level\s+security', text, re.I)),
 'create_policy_statements_in_export': len(re.findall(r'create\s+policy', text, re.I)),
 'grant_or_revoke_statements_in_export': len(re.findall(r'\b(?:grant|revoke)\s', text, re.I)),
 'storage_missing': ['wing-submissions bucket configuration', 'custom storage.objects RLS policies/grants', 'actual Storage upload/sign/delete integration'],
 'missing_transitive_dependencies': 'Full definitions/tables/config/types/extensions used by the missing upload/processing/cleanup/moderation/approval functions must be included and validated; cannot infer them from table declarations.',
 'fixtures_status': 'synthetic fixture plan prepared; no Auth users or database/storage records created',
 'production_access': False,
 'sql_applied': False,
 'staging_acceptance_passed': False,
}
destination = Path(sys.argv[1]) if len(sys.argv) > 1 else SOURCE.with_name('dependency-audit.json')
destination.write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
print(f'AUDIT: {len(tables)} supplied tables, {len(indexes)} indexes, {len(triggers)} triggers; incomplete baseline.')
print(f'MISSING: {len(triggers)} trigger definitions, index function, parent app tables, {len(worker_rpcs)} worker RPCs, upload RPCs, RLS/grants and storage setup.')
print('No SQL executed; staging not passed.')
