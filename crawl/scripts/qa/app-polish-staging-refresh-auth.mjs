import {writeFileSync} from 'node:fs';
import {admin,client,check,readJSON,localPath} from './app-polish-staging-common.mjs';
const fixture=readJSON('.expo/app-polish-staging-fixtures.json');
for(const actor of Object.values(fixture.actors)){
 const result=await admin.auth.admin.getUserById(actor.id);if(result.error)continue;
 const link=check(await admin.auth.admin.generateLink({type:'magiclink',email:result.data.user.email}));
 actor.token=check(await client().auth.verifyOtp({token_hash:link.properties.hashed_token,type:'magiclink'})).session.access_token;
}
writeFileSync(localPath('.expo/app-polish-staging-fixtures.json'),JSON.stringify(fixture));
console.log('Refreshed surviving synthetic sessions through real local GoTrue; no fixtures reset.');
