import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import {after} from 'node:test';

// Dedicated Docker-only target: deliberately accepts no connection URL, remote
// host, existing container, linked Supabase config, or migration directory.
const image = 'postgres:17.6';
const context = 'desktop-linux';
const label = 'buffago.phase7b25.disposable';
const nonce = randomUUID().replaceAll('-', '');
const container = `buffago-phase7b25-${nonce.slice(0, 12)}`;
const database = 'buffago_phase7b25';
let verified = false;
let ordinal = 0;
let native;
after(async()=>{if(native)await native.stop();});

function command(args, input = '') {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', ['--context', context, ...args], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    const deadline = setTimeout(() => { child.kill(); reject(new Error(`Disposable Docker ${args[0]} exceeded 30s; no SQL retry attempted`)); }, 30000);
    let stdout = '', stderr = '', inputError;
    child.stdout.on('data', data => { stdout += data; });
    child.stderr.on('data', data => { stderr += data; });
    child.stdin.on('error', error => { inputError=error; });
    child.on('error', error => { clearTimeout(deadline); reject(error); });
    child.on('close', code => { clearTimeout(deadline); code === 0&&!inputError ? resolve(stdout.trim()) : reject(new Error(`docker ${args[0]} failed (${code}): ${stderr || stdout || inputError?.message}`)); });
    child.stdin.end(input);
  });
}

export async function startDisposablePostgres() {
  if(process.env.BUFFAGO_PHASE7B3D_NATIVE17==='1') {native=await import('./phase7b3d-native-postgres.mjs');await native.start();return;}
  assert.ok(!process.env.BUFFAGO_PHASE7B3D_NATIVE17,'Unknown native fixture selector');
  assert.equal(process.platform,'win32','This runner verifies the Windows Docker Desktop transport');
  if(process.env.DOCKER_CONTEXT) assert.equal(process.env.DOCKER_CONTEXT,context,'Remote/alternate Docker context override refused');
  if(process.env.DOCKER_HOST) assert.match(process.env.DOCKER_HOST,/^npipe:\/\/\/\/\.\/pipe\/[a-zA-Z0-9_.-]+$/,'Remote Docker host override refused');
  const endpoints=JSON.parse(await command(['context','inspect',context]))[0].Endpoints;
  assert.match(endpoints.docker.Host,/^npipe:\/\/\/\/\.\/pipe\/[a-zA-Z0-9_.-]+$/,'Docker must use a local Windows named pipe');
  // image inspect fails when uncached; --pull never independently forbids pulls.
  const cached = JSON.parse(await command(['image', 'inspect', image]))[0];
  await command(['run', '--detach', '--pull', 'never', '--name', container,
    '--label', `${label}=${nonce}`, '--network', 'none',
    '--tmpfs', '/var/lib/postgresql/data', '-e', 'POSTGRES_HOST_AUTH_METHOD=trust',
    '-e', `POSTGRES_DB=${database}`, image]);
  const target = JSON.parse(await command(['inspect', container]))[0];
  assert.equal(target.Image, cached.Id);
  assert.equal(target.Config.Labels[label], nonce);
  assert.equal(target.HostConfig.NetworkMode, 'none');
  assert.deepEqual(target.HostConfig.PortBindings ?? {}, {});
  assert.equal(target.HostConfig.Tmpfs['/var/lib/postgresql/data'], '');
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      // The image briefly starts an initialization server which pg_isready can
      // accept before it shuts down. Wait for init completion before probing
      // the permanent server (observed Phase7B.3B startup-race failure).
      const startup = await command(['logs', container]);
      if (!startup.includes('PostgreSQL init process complete; ready for start up.')) throw new Error('Initialization still running');
      await command(['exec', container, 'pg_isready', '-U', 'postgres', '-d', database]); ready = true; break;
    }
    catch { await new Promise(resolve => setTimeout(resolve, 200)); }
  }
  assert.ok(ready, `Dedicated ${container} did not become ready; existing containers were untouched.`);
  verified = true;
  const probe = await query(database, `select current_database() || ':' || current_user || ':' || current_setting('server_version_num')`);
  assert.equal(probe, `${database}:postgres:170006`);
  await query(database, 'create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;');
  console.log(JSON.stringify({ disposableContainer: container, image, imageId: cached.Id, context, transport:endpoints.docker.Host,hostPorts: [], network: 'none', version: '17.6', retained: true, dataLifecycle:'tmpfs; stopping the container loses fixture data' }));
}

export function query(db, sql, applicationName = 'phase7b25-query') {
  if(native)return native.query(db,sql,applicationName);
  assert.ok(verified, 'Dedicated container identity must be verified before SQL');
  assert.match(db, /^buffago_phase7b25(?:_[0-9]+)?$/);
  return command(['exec', '-i', '-e', `PGAPPNAME=${applicationName}`, container,
    'psql', '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose', '-U', 'postgres', '-d', db], sql);
}

export async function fixture(options = {}) {
  if(native)return native.fixture(options);
  const db = `${database}_${++ordinal}`;
  await query(database, `create database ${db}`);
  await query(db, await readFile(options.bootstrap ?? new URL('../tests/database/fixtures/phase7b25-postgres-bootstrap.sql', import.meta.url), 'utf8'));
  if (options.migration !== false) {
    await query(db, await readFile(options.migration ?? new URL('../supabase/local/phase-2b/20261009_local_phase2b_foundation.sql', import.meta.url), 'utf8'));
  }
  return db;
}

// Each instance is a real independent PostgreSQL backend. ON_ERROR_STOP closes
// an errored session and PostgreSQL rolls back its transaction; callers retry
// the whole transaction using a fresh session.
export function session(db, applicationName) {
  if(native)return native.session(db,applicationName);
  assert.ok(verified);
  assert.match(db, /^buffago_phase7b25_[0-9]+$/);
  const child = spawn('docker', ['--context', context,'exec', '-i', '-e', `PGAPPNAME=${applicationName}`, container,
    'psql', '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose', '-U', 'postgres', '-d', db],
  { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  let output = '', errors = '', pending = null, ended = false;
  child.stdout.on('data', data => {
    output += data;
    if (pending && output.includes(pending.marker)) {
      const value = output.slice(0, output.indexOf(pending.marker)).trim();
      output = output.slice(output.indexOf(pending.marker) + pending.marker.length).trimStart();
      const current = pending; pending = null; clearTimeout(current.timer); current.resolve(value);
    }
  });
  child.stderr.on('data', data => { errors += data; });
  const closed = new Promise(resolve => child.on('close', code => {
    ended = true;
    if (pending) { clearTimeout(pending.timer); pending.reject(new Error(errors || `psql closed (${code})`)); pending = null; }
    resolve(code);
  }));
  child.on('error', error => { if (pending) { clearTimeout(pending.timer); pending.reject(error); pending = null; } });
  return {
    execute(sql) {
      assert.equal(ended, false); assert.equal(pending, null, 'One command per session at a time');
      return new Promise((resolve, reject) => {
        const marker = `BUFFAGO_DONE_${randomUUID()}`;
        pending = { marker, resolve, reject, timer: setTimeout(() => { child.stdin.end(); reject(new Error(`Session ${applicationName} exceeded 20s: ${errors}`)); }, 20000) };
        child.stdin.write(`${sql};\n\\echo ${marker}\n`);
      });
    },
    async close() { if (!ended) child.stdin.end(); await closed; },
  };
}

export async function observeBlocked(db, applicationName) {
  for (let attempt = 0; attempt < 60; attempt++) {
    const row = await query(db, `select coalesce(json_agg(json_build_object('pid',pid,'blockers',pg_blocking_pids(pid),'wait',wait_event)), '[]') from pg_stat_activity where datname=current_database() and application_name='${applicationName}' and cardinality(pg_blocking_pids(pid))>0`);
    const blocked = JSON.parse(row);
    if (blocked.length) return blocked[0];
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error(`No actual cross-backend lock wait observed for ${applicationName}`);
}

export const ids = Object.freeze({
  user: '11111111-1111-4111-8111-111111111111',
  other: '77777777-7777-4777-8777-777777777777',
  third: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  destination: '22222222-2222-4222-8222-222222222222',
  otherDestination: '33333333-3333-4333-8333-333333333333',
  photo: '44444444-4444-4444-8444-444444444444',
  rating: '55555555-5555-4555-8555-555555555555',
  otherRating: '66666666-6666-4666-8666-666666666666',
  crawl: '88888888-8888-4888-8888-888888888888',
  otherCrawl: '99999999-9999-4999-8999-999999999999',
});

export function asUser(user = ids.user, anonymous = false) {
  assert.match(user, /^[a-f0-9-]{36}$/);
  return `set role authenticated; select set_config('request.jwt.claim.sub','${user}',false); select set_config('request.jwt.claims','{"sub":"${user}","is_anonymous":${anonymous}}',false);`;
}

export async function scalar(db, sql) {
  return JSON.parse(await query(db, `select row_to_json(result) from (${sql}) result`));
}

// Isolated TLS/SCRAM fixture; no host ports or external route. This cannot
// change production adapter target policy or open a production connection.
export async function disposableTLS() {
  if(native)return native.tls();
  assert.ok(verified);
  await command(['exec',container,'sh','-c',`openssl req -x509 -newkey rsa:2048 -nodes -keyout /tmp/buffago.key -out /tmp/buffago.crt -days 1 -subj /CN=localhost -addext subjectAltName=DNS:localhost >/dev/null 2>&1
chown postgres:postgres /tmp/buffago.key /tmp/buffago.crt
chmod 600 /tmp/buffago.key
openssl req -x509 -newkey rsa:2048 -nodes -keyout /tmp/untrusted.key -out /tmp/untrusted.crt -days 1 -subj /CN=untrusted >/dev/null 2>&1
openssl req -new -key /tmp/buffago.key -out /tmp/expired.csr -subj /CN=localhost -addext subjectAltName=DNS:localhost >/dev/null 2>&1
touch /tmp/cert-index
printf '01\\n' > /tmp/cert-serial
mkdir /tmp/buffago-certs
cat > /tmp/expired-ca.cnf <<'BUFFAGO_CA'
[ca]
default_ca=fixture
[fixture]
database=/tmp/cert-index
serial=/tmp/cert-serial
new_certs_dir=/tmp/buffago-certs
default_md=sha256
policy=subject_policy
copy_extensions=copy
[subject_policy]
commonName=supplied
BUFFAGO_CA
openssl ca -config /tmp/expired-ca.cnf -selfsign -keyfile /tmp/buffago.key -cert /tmp/buffago.crt -in /tmp/expired.csr -out /tmp/expired.crt -startdate 20200101000000Z -enddate 20200102000000Z -batch -notext >/dev/null 2>&1
chown postgres:postgres /tmp/expired.crt
cat >> /var/lib/postgresql/data/postgresql.conf <<'BUFFAGO_TLS'
ssl=on
ssl_cert_file='/tmp/buffago.crt'
ssl_key_file='/tmp/buffago.key'
BUFFAGO_TLS
printf 'local all all trust\\nhostssl all fixture_trust 127.0.0.1/32 trust\\nhostssl all fixture_trust ::1/128 trust\\nhostssl all all 127.0.0.1/32 scram-sha-256\\nhostssl all all ::1/128 scram-sha-256\\n' > /var/lib/postgresql/data/pg_hba.conf`]);
  const password=randomUUID();
  await query(database,`set password_encryption='scram-sha-256'; create role fixture_tls login password '${password}';create role fixture_trust login; select pg_reload_conf();`);
  let tlsReady=false;
  for(let n=0;n<30;n++) {if(await query(database,'show ssl')==='on'){tlsReady=true;break;}await new Promise(resolve=>setTimeout(resolve,100));}
  assert.ok(tlsReady,'Disposable server did not accept SSL configuration');
  const connect=async({host='localhost',ca='/tmp/buffago.crt',ssl='verify-full',credential=password,user='fixture_tls',db=database}={})=>{
    assert.ok(['localhost','127.0.0.1'].includes(host));
    return command(['exec','-i','-e',`PGPASSWORD=${credential}`,'-e',`PGSSLMODE=${ssl}`,'-e',`PGSSLROOTCERT=${ca}`,'-e','PGREQUIREAUTH=scram-sha-256','-e','PGGSSENCMODE=disable',container,'psql','-X','-q','-A','-t','-w','-v','ON_ERROR_STOP=1','-h',host,'-U',user,'-d',db],`begin read only; select current_user||':'||ssl||':'||version from pg_stat_ssl where pid=pg_backend_pid(); rollback;`);
  };
  connect.expire=async()=>{await query(database,"alter system set ssl_cert_file='/tmp/expired.crt'; select pg_reload_conf();");await new Promise(resolve=>setTimeout(resolve,300));};
  connect.disable=async()=>{await query(database,"alter system set ssl='off'; select pg_reload_conf();");await new Promise(resolve=>setTimeout(resolve,300));};
  return connect;
}
