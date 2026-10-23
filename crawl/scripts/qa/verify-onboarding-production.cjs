// Run with: eas env:exec production "node scripts/qa/verify-onboarding-production.cjs" --non-interactive
// Read-only EAS resolution and local Android export; no build or deployment.
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const out = path.resolve('../artifacts/onboarding-final-corrections');
fs.mkdirSync(out, { recursive: true });
const eas = path.join(process.env.APPDATA, 'npm/node_modules/eas-cli/bin/run');
const resolved = JSON.parse(cp.execFileSync(process.execPath, [eas, 'config', '--platform', 'android', '--profile', 'production', '--json'], {encoding:'utf8', stdio:['ignore','pipe','inherit']}));
const profile = resolved.buildProfile;
const flags = Object.fromEntries(Object.entries(profile.env).filter(([k]) => k.startsWith('EXPO_PUBLIC_ONBOARDING')));
for (const key of ['EXPO_PUBLIC_ONBOARDING_V2','EXPO_PUBLIC_ONBOARDING_WING_SHOT_INVITE']) if (flags[key] !== 'true') throw Error(`${key} must be true`);
const env = {...process.env, ...profile.env, EXPO_NO_DOTENV:'1', NODE_ENV:'production'};
const exported = process.argv.includes('--verify-only') ? {status:0} : cp.spawnSync(process.execPath, ['node_modules/expo/bin/cli','export','--platform','android','--output-dir',path.join(out,'android-export'),'--source-maps','--no-bytecode'], {env,stdio:'inherit'});
if (exported.status !== 0) process.exit(exported.status || 1);
const dir=path.join(out,'android-export/_expo/static/js/android');
const bundleName=fs.readdirSync(dir).find(n=>n.endsWith('.js'));
const bytes=fs.readFileSync(path.join(dir,bundleName));
const bundle=bytes.toString();
const evidence={environment:profile.environment,platform:'android',buildType:profile.android?.buildType||profile.buildType,flags,bundle:bundleName,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),bundled:{}};
const vm = require('node:vm');
const definition = bundle.split('\n').find(line => line.startsWith('__d(') && line.includes('"ENABLE_ONBOARDING_V2"'));
if (!definition) throw Error('Bundled feature module not found');
const featureModule = {exports:{}};
vm.runInNewContext(definition, {process:{env:{}},__d(factory) { factory({}, () => {throw Error('Unexpected feature dependency');}, null, null, featureModule, featureModule.exports, []); }});
for (const key of ['ENABLE_ONBOARDING_V2','ENABLE_ONBOARDING_WING_SHOT_INVITE']) {
 evidence.bundled[key] = featureModule.exports[key];
 if (featureModule.exports[key] !== true) throw Error('Bundled feature is not enabled: '+key);
}
evidence.route='ENABLE_ONBOARDING_V2 ? OnboardingV2 : OnboardingExperimentRoute';
const sourceMap = JSON.parse(fs.readFileSync(path.join(dir, bundleName + '.map'), 'utf8'));
evidence.sourceMatches = {};
for (const file of ['components/RatingWizardDialog.jsx', 'components/OnboardingV2.jsx', 'components/OnboardingRatingConfirmation.jsx', 'lib/confirmOnboardingRating.js', 'lib/wingShotAuthIntent.js', 'components/wingShots/WingShotComposer.tsx', 'app/profile/wing-shots/submit.jsx', 'app/onboarding.jsx']) {
 const index = sourceMap.sources.findIndex(source => source.endsWith(file));
 const normalize = text => text.replaceAll('\r\n', '\n');
 evidence.sourceMatches[file] = index >= 0 && normalize(sourceMap.sourcesContent[index]) === normalize(fs.readFileSync(file, 'utf8'));
 if (!evidence.sourceMatches[file]) throw Error('Stale bundled source: ' + file);
}
fs.writeFileSync(path.join(out,'production-flags.json'),JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify(evidence,null,2));
