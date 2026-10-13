import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
function tree(source,removeAdditions=false){
 const file=ts.createSourceFile('handler.js',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
 const visit=node=>{
  if(ts.isParenthesizedExpression(node))return visit(node.expression);
  if(removeAdditions&&ts.isPropertyAssignment(node)&&['dislike_count','neutral_count','photo_dislike_count','photo_neutral_count'].includes(node.name.getText(file)))return null;
  const children=[];ts.forEachChild(node,child=>{const value=visit(child);if(value)children.push(value);});
  let text=ts.isIdentifier(node)||ts.isStringLiteral(node)||ts.isNumericLiteral(node)?node.text:undefined;
  if(ts.isNumericLiteral(node))text=String(Number(node.text.replaceAll('_','')));
  if(node.kind===ts.SyntaxKind.RegularExpressionLiteral)text=node.getText(file);
  if(removeAdditions&&text==='like_count,dislike_count,neutral_count')text='like_count';
  return {kind:ts.SyntaxKind[node.kind],...(text!==undefined?{text}:{}),children};
 };return visit(file);
}
for(const slug of ['wing-jury-vote','wing-jury-reveal'])test(`actual deployed ${slug} handler differs only in additive vote counts`,()=>{
 const old=read(`../../artifacts/app-polish/release-qa/deployed/${slug}/index.js`);
 const handler=old.slice(old.lastIndexOf('Deno.serve('));
 const source=read(`../supabase/functions/${slug}/index.ts`).replace(/^import .*;$/gm,'');
 const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
 const current=compiled.slice(compiled.lastIndexOf('Deno.serve('));
 assert.deepEqual(tree(current,true),tree(handler));
});
test('actual deployed Jury authentication, request, eligibility and signing helpers match the dependency',()=>{
 const deployed=read('../../artifacts/app-polish/release-qa/deployed/wing-jury-vote/index.js');
 const shared=read('../supabase/functions/_shared/wingJury.ts').replace(/^import .*;$/gm,'').replace(/^export /gm,'');
 const compiled=ts.transpileModule(shared,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
 const functions=source=>ts.createSourceFile('source.js',source,ts.ScriptTarget.Latest,true).statements.filter(ts.isFunctionDeclaration);
 const old=functions(deployed),current=functions(compiled);
 for(const name of ['respond','readJuryBody','readToken','createBoundary','canonicalProcessedPath','safeJurySignedUrl','isPublicPhoto','hasPublicPhotoMetadata','eligiblePhoto']){
  const before=old.find(fn=>fn.name?.text===name),after=current.find(fn=>fn.name?.text===name);assert.ok(before&&after,name);
  let previous=before.getText();if(name==='createBoundary'){const factory=previous.match(/const admin = (\w+)\(/)[1];previous=previous.replaceAll(factory,'createClient');}
  assert.deepEqual(tree(after.getText()),tree(previous),name);
 }
});
test('Wingman protected JWT/atomic-limit adapter and creation call match actual v17',()=>{
 const deployed=read('../../artifacts/app-polish/release-qa/wingman-intake-v17.ts').replaceAll('\r\n','\n');
 const current=read('../supabase/functions/wingman-intake/index.ts').replaceAll('\r\n','\n');
 for(const [start,end] of [['function createAdminClient','async function requireUserId'],['async function requireUserId','async function getOptionalUserId'],['async function getOptionalUserId','function getClientIp'],['async function enforceRateLimit','async function resolvePlaceCandidate']])assert.equal(current.slice(current.indexOf(start),current.indexOf(end)),deployed.slice(deployed.indexOf(start),deployed.indexOf(end)));
 const rpc=".rpc('wingman_create_destination', { p_destination: insertPayload, p_created_by: authenticatedUserId })";
 assert.ok(current.includes(rpc)&&deployed.includes(rpc));
});
