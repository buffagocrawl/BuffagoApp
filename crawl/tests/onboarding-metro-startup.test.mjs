import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const config=require('../metro.config.js');
const blocked=path=>config.resolver.blockList.some(pattern=>pattern.test(path));
test('Metro prunes generated Expo cache directories on Windows and POSIX without excluding app or QA fixture sources',()=>{
 for(const path of ['C:\\repo\\crawl\\.expo','C:\\repo\\crawl\\.expo\\cache\\bundle.js','/repo/crawl/.expo','/repo/crawl/.expo/edge/node_modules/worker.js'])assert.equal(blocked(path),true,path);
 for(const path of ['C:\\repo\\crawl\\app\\onboarding.jsx','/repo/crawl/components/OnboardingV2.jsx','/repo/crawl/tests/fixtures/native-visual/approvedPhoto.local.json'])assert.equal(blocked(path),false,path);
 assert.equal(blocked('/repo/crawl/.exposition/app.js'),false);
 assert.equal(config.resolver.resolveRequest,null,'fixture resolver remains opt-in');
});
