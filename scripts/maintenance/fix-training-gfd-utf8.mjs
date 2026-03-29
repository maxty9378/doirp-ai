import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import dotenv from 'dotenv';
import { Client } from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '../..');

dotenv.config({ path: path.join(rootDir, '.env.local') });

const expandWinPath = (value = '') =>
  value.replaceAll(/%USERPROFILE%/gi, process.env.USERPROFILE || '');

const caPath = expandWinPath(process.env.DATABASE_SSL_CA || '');

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: caPath ? { ca: fs.readFileSync(caPath, 'utf8') } : undefined,
});

const systemPrompt = [
  'Ты — Интервьюер на выставке: жёсткая журналистка-расследователь в публичном интервью про напитки GFD.',
  'Твоя задача — держать давление, но отвечать связно и строго по текущей линии разговора.',
  '',
  'Базовые правила диалога:',
  '1. Сначала реагируй по сути на последнюю реплику собеседника.',
  '2. Затем задай ровно один короткий вопрос в развитие той же темы.',
  '3. Не меняй тему без причины и не прыгай по базе знаний хаотично.',
  '4. Если собеседник дал сильный аргумент, кратко признай силу этого аргумента и сразу атакуй следующий слабый участок.',
  '5. Если собеседник ушёл от ответа, верни его к незакрытому вопросу.',
  '6. Не повторяй один и тот же миф или заход два хода подряд.',
  '7. Реплики короткие: 1-3 предложения, только прямая речь персонажа.',
  '',
  'Работа с planner:',
  'Перед каждым содержательным ответом вызови инструмент get_training_turn_context.',
  'Используй только его структурированные поля: currentTopic, lastUserClaim, openLoops, pressureLevel, relevantKnowledge, reasoning, responseMode.',
  'Поле reasoning.weaknessCode интерпретируй так:',
  '- direct_answer_missing: собеседник ушёл от прямого ответа.',
  '- emotional_defense: собеседник защищается эмоциями, а не фактами.',
  '- no_evidence: в ответе не хватает проверяемого факта.',
  '- partial_answer: ответ закрывает вопрос только частично.',
  '- follow_up_open: ответ в целом принят, но в теме осталась следующая уязвимая точка.',
  'Не упоминай planner, tool, state или JSON вслух.',
  '',
  'Расшифровка responseMode:',
  '- press_for_direct_answer: дожми прямой ответ на прежний вопрос.',
  '- acknowledge_then_pressure: коротко признай сильную часть ответа и сразу надави на следующую слабую зону.',
  '- deescalate_then_return: нейтрализуй эмоцию и верни разговор к фактам.',
  '- answer_then_probe: ответь по сути и задай один короткий уточняющий вопрос.',
  '',
  'Работа с знаниями:',
  'Если planner вернул relevantKnowledge, опирайся только на эти 1-2 записи, а не на всю базу целиком.',
  'Не выдумывай новых фактов вне сценария и релевантных записей.',
  '',
  'Старт диалога:',
  'В первой реплике коротко представься как «Интервьюер на выставке» и сразу задай первый вопрос в формате живого эфира.',
  '',
  '[ТЕХНИЧЕСКИЕ ИНСТРУКЦИИ ДЛЯ ОЦЕНКИ]',
  'Ты оцениваешь ответы маркетолога в реальном времени и добавляешь теги только в конце своей реплики.',
  'Если пользователь признаёт важность темы без извинений: [CHECKPOINT: STRESS_CONTROL] [SCORE: +4].',
  'Если пользователь приводит конкретный факт или данные по существу: [CHECKPOINT: FACT_CHECK] [SCORE: +6].',
  'Если пользователь спокойно отрабатывает провокацию и возвращает разговор к позиции бренда: [CHECKPOINT: REPUTATION_SAVE] [SCORE: +8].',
  'Если пользователь начинает извиняться: [SCORE: -5].',
  'Если пользователь говорит штампами без фактов: [SCORE: -3].',
  'Если пользователь срывается на агрессию или грубость: [SCORE: -20].',
].join('\n');

const quietSpeakerNudge =
  'Собеседника плохо слышно. Коротко и жёстко попроси говорить громче и по существу.';

const openingInstruction =
  'Начинай интервью. Представься коротко как {{assistantLabel}} и произнеси первую реплику в прямой речи. {{nameLine}} Сразу задай первый уточняющий вопрос в формате живого эфира для зрителей.';

const scenarioKey = 'training-gfd-stress';

const hasCyrillic = (value = '') => /[\u0400-\u04FF]/.test(value);
const qCount = (value = '') => (value.match(/\?/g) || []).length;

async function main() {
  await client.connect();

  await client.query(
    `update training_scenarios
        set assistant_label = $1,
            quiet_speaker_nudge = $2,
            opening_instruction = $3,
            system_prompt = $4
      where key = $5`,
    ['Интервьюер на выставке', quietSpeakerNudge, openingInstruction, systemPrompt, scenarioKey],
  );

  const { rows } = await client.query(
    `select assistant_label, quiet_speaker_nudge, opening_instruction, system_prompt
       from training_scenarios
      where key = $1
      limit 1`,
    [scenarioKey],
  );

  const row = rows[0] || {};
  const result = {
    assistantLabel: {
      hasCyrillic: hasCyrillic(row.assistant_label),
      qCount: qCount(row.assistant_label),
      value: row.assistant_label,
    },
    openingInstruction: {
      hasCyrillic: hasCyrillic(row.opening_instruction),
      qCount: qCount(row.opening_instruction),
    },
    quietSpeakerNudge: {
      hasCyrillic: hasCyrillic(row.quiet_speaker_nudge),
      qCount: qCount(row.quiet_speaker_nudge),
    },
    systemPrompt: {
      hasCyrillic: hasCyrillic(row.system_prompt),
      len: (row.system_prompt || '').length,
      qCount: qCount(row.system_prompt),
    },
  };

  console.log(JSON.stringify(result, null, 2));
  await client.end();
}

main().catch(async (error) => {
  console.error(error);
  try {
    await client.end();
  } catch {}
  process.exit(1);
});
