import 'dotenv/config';
import { WingmanService } from '../lib/wingman/WingmanService.ts';
import type { WingmanInput } from '../lib/wingman/types.ts';

async function main() {
  const wingman = new WingmanService();

  const tests: WingmanInput[] = [
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

  console.log('\n🟡 Wingman Test Run Starting...\n');

  for (const test of tests) {
    console.log('==================================================');
    console.log(`🍗 INPUT: ${test.rawInput}`);

    try {
      const result = await wingman.run(test);

      console.log('\n🧠 DECISION:', result.decision);
      console.log('📌 REASON:', result.decisionReason);
      console.log('💬 MESSAGE:', result.userMessage);

      console.log('\n📊 AI:');
      console.log({
        name: result.ai.normalizedName,
        city: result.ai.city,
        confidence: result.ai.confidence,
        wingsProbability: result.ai.wingsProbability,
      });

      console.log('\n📍 PLACE:');
      console.log({
        found: result.place.found,
        name: result.place.name,
        city: result.place.city,
      });

      console.log('\n⚙️ ACTIONS:');
      console.log({
        insertDestination: result.shouldInsertDestination,
        insertSuggestion: result.shouldInsertSuggestion,
      });

      if (result.destinationInsert) {
        console.log('\n✅ DESTINATION INSERT PAYLOAD:');
        console.log(result.destinationInsert);
      }

      if (result.suggestionInsert) {
        console.log('\n📝 SUGGESTION INSERT PAYLOAD:');
        console.log(result.suggestionInsert);
      }
    } catch (err) {
      console.error('\n❌ ERROR:', err);
    }

    console.log('\n');
  }

  console.log('🟢 Wingman Test Run Complete.\n');
}

main().catch((err) => {
  console.error('Fatal error running Wingman test:', err);
  process.exit(1);
});