import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const crawl = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = path.join(crawl, 'supabase/contracts/current-supported-schema-v1.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const checks = manifest.checks;
const sql = (v) => `'${String(v).replaceAll("'", "''")}'`;
if (!manifest.contract_version || !Array.isArray(checks) || checks.length === 0) throw new Error('invalid current schema contract');
const lines = [
  `-- GENERATED FILE. Source: supabase/contracts/current-supported-schema-v1.json`,
  `-- Read-only compatibility preflight. This is not provisioning and not a historical baseline.`,
  `begin;`,
  `create temp table _buffago_supported_schema_report(check_number integer, schema_name text, object_name text, object_type text, result text, detail text);`,
];
checks.forEach((c, i) => {
  const n = i + 1;
  const qualified = `${c.schema}.${c.object_name}`;
  if (c.object_type === 'extension') {
    lines.push(`insert into _buffago_supported_schema_report values (${n}, ${sql(c.schema)}, ${sql(c.object_name)}, 'extension', case when exists(select 1 from pg_extension where extname=${sql(c.object_name)}) then 'compatible' else 'missing' end, 'required extension');`);
  } else if (c.object_type === 'table') {
    lines.push(`insert into _buffago_supported_schema_report values (${n}, ${sql(c.schema)}, ${sql(c.object_name)}, 'table', case when to_regclass(${sql(qualified)}) is null then 'missing' else 'present' end, 'required relation');`);
    for (const [column, type] of Object.entries(c.required_columns ?? {})) {
      lines.push(`insert into _buffago_supported_schema_report select ${n}, ${sql(c.schema)}, ${sql(`${c.object_name}.${column}`)}, 'column', case when c.table_name is null then 'missing' when c.udt_name = ${sql(type === 'timestamp with time zone' ? 'timestamptz' : type === 'timestamp without time zone' ? 'timestamp' : type)} or c.data_type = ${sql(type)} then 'compatible' else 'incompatible' end, ${sql(`required type ${type}`)} from (select ${sql(column)} as required_column) wanted left join information_schema.columns c on c.table_schema=${sql(c.schema)} and c.table_name=${sql(c.object_name)} and c.column_name=wanted.required_column;`);
    }
    lines.push(`insert into _buffago_supported_schema_report select ${n}, ${sql(c.schema)}, ${sql(c.object_name)}, 'rls', case when c.relname is null then 'missing' when c.relrowsecurity = ${c.required_rls ? 'true' : 'false'} then 'compatible' else 'incompatible' end, ${sql(`RLS required=${c.required_rls}`)} from (select c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname=${sql(c.schema)} and c.relname=${sql(c.object_name)}) c;`);
    for (const constraint of c.required_constraints ?? []) lines.push(`insert into _buffago_supported_schema_report select ${n}, ${sql(c.schema)}, ${sql(constraint)}, 'constraint', case when con.conname is null then 'incompatible' else 'compatible' end, 'required named constraint' from (select ${sql(constraint)} as required_name) wanted left join (select con.conname from pg_constraint con join pg_class rel on rel.oid=con.conrelid join pg_namespace ns on ns.oid=rel.relnamespace where ns.nspname=${sql(c.schema)} and rel.relname=${sql(c.object_name)}) con on con.conname=wanted.required_name;`);
    for (const policy of c.required_policies ?? []) lines.push(`insert into _buffago_supported_schema_report select ${n}, ${sql(c.schema)}, ${sql(policy)}, 'policy', case when p.policyname is null then 'incompatible' else 'compatible' end, 'required policy capability' from (select ${sql(policy)} as required_name) wanted left join pg_policies p on p.schemaname=${sql(c.schema)} and p.tablename=${sql(c.object_name)} and p.policyname=wanted.required_name;`);
  } else if (c.object_type === 'function') {
    lines.push(`insert into _buffago_supported_schema_report values (${n}, ${sql(c.schema)}, ${sql(c.object_name)}, 'function', case when to_regprocedure(${sql(c.required_signature)}) is null then 'missing' else 'compatible' end, ${sql(c.required_function_capability)});`);
  } else if (c.object_type === 'trigger') {
    lines.push(`insert into _buffago_supported_schema_report values (${n}, ${sql(c.schema)}, ${sql(c.object_name)}, 'trigger', case when exists(select 1 from pg_trigger t join pg_class r on r.oid=t.tgrelid join pg_namespace ns on ns.oid=r.relnamespace where ns.nspname=${sql(c.schema)} and r.relname=${sql(c.required_table.split('.')[1])} and t.tgname=${sql(c.object_name)} and not t.tgisinternal) then 'compatible' else 'missing' end, ${sql(c.required_trigger_capability)});`);
  }
});
lines.push(`do $$ declare missing_count integer; incompatible_count integer; begin select count(*) filter(where result='missing'), count(*) filter(where result='incompatible') into missing_count,incompatible_count from _buffago_supported_schema_report; raise notice 'current_supported_schema_contract_version=${manifest.contract_version} generated_check_count=${checks.length} missing=% incompatible=%', missing_count,incompatible_count; if missing_count > 0 or incompatible_count > 0 then raise exception 'current_supported_schema_preflight_failed missing=% incompatible=% generated_check_count=${checks.length}', missing_count,incompatible_count; end if; end $$;`);
lines.push(`select * from _buffago_supported_schema_report order by check_number, object_type, object_name;`);
lines.push(`rollback;`);
fs.writeFileSync(path.join(crawl, 'supabase/validation/current-supported-schema-preflight.sql'), `${lines.join('\n')}\n`);
const checksum = (await import('node:crypto')).createHash('sha256').update(JSON.stringify(manifest)).digest('hex');
fs.writeFileSync(path.join(crawl, 'supabase/contracts/current-supported-schema-v1.sha256'), `${checksum}\n`);
console.log(`generated current schema preflight: ${checks.length} contract checks; checksum ${checksum}`);
