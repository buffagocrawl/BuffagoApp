// Read-only EAS submission metadata. Never prints credentials or signed logs.
const path=require('node:path');
const fs=require('node:fs');
const cli=path.join(process.env.APPDATA,'npm/node_modules/eas-cli/build');
const Session=require(path.join(cli,'user/SessionManager.js')).default;
const {createGraphqlClient}=require(path.join(cli,'commandUtils/context/contextUtils/createGraphqlClient.js'));
const {SubmissionQuery}=require(path.join(cli,'graphql/queries/SubmissionQuery.js'));
const {BuildQuery}=require(path.join(cli,'graphql/queries/BuildQuery.js'));
(async()=>{
 const session=new Session(undefined);
 const accessToken=session.getAccessToken();
 const sessionSecret=accessToken?null:session.getSessionSecret();
 if(!accessToken&&!sessionSecret)throw new Error('No existing EAS authentication; no login attempted');
 const client=createGraphqlClient({accessToken,sessionSecret});
 const rows=await SubmissionQuery.allForAppAsync(client,'f08e790e-af47-4fc1-ba5e-707a0a15f7be',{limit:50,offset:0});
 const safe=rows.map(r=>({id:r.id,status:r.status,platform:r.platform,androidConfig:r.androidConfig,iosAppId:r.iosConfig?.ascAppIdentifier,errorCode:r.error?.errorCode}));
 const inventory=JSON.parse(fs.readFileSync(process.argv[3],'utf8').replace(/^\uFEFF/,''));
 const builds=await Promise.all(inventory.filter(b=>b.status==='FINISHED').slice(0,10).map(async b=>{
  const result=await BuildQuery.withSubmissionsByIdAsync(client,b.id,{useCache:false});
  return {...b,submissions:result.submissions.map(s=>({id:s.id,status:s.status,platform:s.platform,androidConfig:s.androidConfig,iosAppId:s.iosConfig?.ascAppIdentifier,errorCode:s.error?.errorCode}))};
 }));
 fs.writeFileSync(process.argv[2],JSON.stringify({source:'read-only EAS Submission/BuildQuery; submissions do not prove present store/tester availability',rows:safe,latestTenCompletedBuilds:builds},null,2));
 console.log(`${safe.length} EAS submission records saved without credentials/log URLs`);
})().catch(()=>{console.error('Read-only EAS submission query unavailable; no credentials printed');process.exitCode=1;});
