import 'dotenv/config';
import { WingmanService } from '../lib/wingman/WingmanService';
import type { WingmanInput } from '../lib/wingman/types';

async function runSingleTest(wingman: WingmanService, test: WingmanInput) {
  console.log('\n==================================================');
  console.log(`INPUT: ${test.rawInput}`);
  console.log(`STATE ID: ${test.stateId}`);
  console.log(`STATE CODE: ${test.stateCode ?? 'N/A'}`);
  console.log(`USER ID: ${test.userId ?? 'guest'}`);

  try {
    const result = await wingman.run(test);

    console.log('\nRESULT:');
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('\nERROR:');
    console.error(error);
  }
}

async function main() {
  const wingman = new WingmanService();

  const testCases: WingmanInput[] = [
    {
      rawInput: 'Blind Rhino Bridgeport',
      stateId: 7,
      stateCode: 'CT',
      userId: null,
    },
    {
      rawInput: 'J Timothys Plainville',
      stateId: 7,
      stateCode: 'CT',
      userId: null,
    },
    {
      rawInput: 'Red Rock Cafe Storrs',
      stateId: 7,
      stateCode: 'CT',
      userId: null,
    },
    {
      rawInput: 'Olive Garden Hartford',
      stateId: 7,
      stateCode: 'CT',
      userId: null,
    },
    {
      rawInput: 'Fake Wing Castle Downtown',
      stateId: 7,
      stateCode: 'CT',
      userId: null,
    },
  ];

  for (const testCase of testCases) {
    await runSingleTest(wingman, testCase);
  }

  console.log('\nDone.');
}

main().catch((error) => {
  console.error('Fatal test harness error:', error);
  process.exit(1);
});