import { serverDB } from '@/database/server';
import { trainingScenarios } from '@lobechat/database/schemas';

async function run() {
  const scenarios = await serverDB
    .select({
      id: trainingScenarios.id,
      key: trainingScenarios.key,
      analyzePrompt: trainingScenarios.analyzePrompt,
    })
    .from(trainingScenarios)
    .limit(10);
  
  for (const s of scenarios) {
    if (s.analyzePrompt) {
      console.log(`\n=== SCENARIO: ${s.key} ===`);
      console.log(s.analyzePrompt.slice(0, 500) + '...');
    }
  }
}

run();