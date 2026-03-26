// @ts-nocheck
import { boolean, index, integer, jsonb, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core';
import { createInsertSchema } from 'drizzle-zod';

import { idGenerator } from '../utils/idGenerator';
import { timestamps } from './_helpers';
import { users } from './user';

export const trainingScenarios = pgTable(
  'training_scenarios',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => idGenerator('trainingScenarios'))
      .notNull(),
    key: text('key').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    legend: text('legend'),
    userRole: text('user_role'),
    goals: jsonb('goals').$type<string[]>().default([]),
    checkpointIds: jsonb('checkpoint_ids').$type<string[]>().default([]),
    systemPrompt: text('system_prompt'),
    analyzePrompt: text('analyze_prompt'),
    debriefPrompt: text('debrief_prompt'),
    assistantLabel: text('assistant_label'),
    userLabel: text('user_label'),
    voiceName: text('voice_name'),
    bannerUrl: text('banner_url'),
    contextWindow: integer('context_window'),
    silenceNudgeAfterMs: integer('silence_nudge_after_ms'),
    silenceNudgeCooldownMs: integer('silence_nudge_cooldown_ms'),
    silenceHardHangupMs: integer('silence_hard_hangup_ms'),
    sessionDurationMs: integer('session_duration_ms'),
    silenceNudgePhrases: jsonb('silence_nudge_phrases').$type<string[]>().default([]),
    showLegend: boolean('show_legend').default(true),
    showIntroDialog: boolean('show_intro_dialog').default(true),
    enableCheckpoints: boolean('enable_checkpoints').default(false),
    enableScoring: boolean('enable_scoring').default(false),
    isActive: boolean('is_active').default(true),
    scoreDisplayLabel: text('score_display_label'),
    scoreLevelLabels: jsonb('score_level_labels').$type<{
      low?: string;
      mid?: string;
      high?: string;
    }>(),
    openingInstruction: text('opening_instruction'),
    introDialogTitle: text('intro_dialog_title'),
    introDialogDescription: text('intro_dialog_description'),
    introDialogPlaceholder: text('intro_dialog_placeholder'),
    introDialogHint: text('intro_dialog_hint'),
    introDialogButtonLabel: text('intro_dialog_button_label'),
    roundEndingPrompt: text('round_ending_prompt'),
    silenceNudgeTemplate: text('silence_nudge_template'),
    shortAnswerNudge: text('short_answer_nudge'),
    quietSpeakerNudge: text('quiet_speaker_nudge'),
    autoSuccessPrompt: text('auto_success_prompt'),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('training_scenarios_key_unique').on(t.key),
    index('training_scenarios_active_idx').on(t.isActive),
  ],
);

export const insertTrainingScenarioSchema = createInsertSchema(trainingScenarios);
export type NewTrainingScenario = typeof trainingScenarios.$inferInsert;
export type TrainingScenarioItem = typeof trainingScenarios.$inferSelect;

export const trainingKnowledgeEntries = pgTable(
  'training_knowledge_entries',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => idGenerator('trainingKnowledgeEntries'))
      .notNull(),
    scenarioId: text('scenario_id')
      .references(() => trainingScenarios.id, { onDelete: 'cascade' })
      .notNull(),
    productIngredient: text('product_ingredient').notNull(),
    officialUsp: text('official_usp').notNull(),
    attackMyth: text('attack_myth').notNull(),
    ...timestamps,
  },
  (t) => [
    index('training_knowledge_entries_scenario_id_idx').on(t.scenarioId),
    index('training_knowledge_entries_product_idx').on(t.productIngredient),
  ],
);

export const insertTrainingKnowledgeSchema = createInsertSchema(trainingKnowledgeEntries);
export type NewTrainingKnowledgeEntry = typeof trainingKnowledgeEntries.$inferInsert;
export type TrainingKnowledgeEntryItem = typeof trainingKnowledgeEntries.$inferSelect;

// ======= voice_call_sessions ======= //

export interface VoiceCallSessionAnalysisResult {
  behavioralMetrics?: {
    silenceInfo?: string;
    responseSpeed?: string;
    repetitionAndRudeness?: string;
  };
  competencies: Array<{ name: string; score: number }>;
  improvements: string[];
  overallScore: number;
  phraseFeedback: Array<{
    userPhrase: string;
    suggestedPhrase: string;
    advice: string;
  }>;
  recommendedAction?: string;
  strengths: string[];
  summary: string;
}

export const voiceCallSessions = pgTable(
  'voice_call_sessions',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => idGenerator('voiceCallSessions'))
      .notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    scenarioId: text('scenario_id').notNull(),
    speakerName: text('speaker_name'),
    transcript: jsonb('transcript').$type<Array<{ role: 'ai' | 'user'; text: string }>>().notNull(),
    analysisResult: jsonb('analysis_result').$type<VoiceCallSessionAnalysisResult>(),
    score: integer('score'),
    hangUpReason: text('hang_up_reason'),
    durationSeconds: integer('duration_seconds'),
    ...timestamps,
  },
  (t) => [
    index('voice_call_sessions_user_id_idx').on(t.userId),
    index('voice_call_sessions_scenario_id_idx').on(t.scenarioId),
    index('voice_call_sessions_created_at_idx').on(t.createdAt),
  ],
);

export const insertVoiceCallSessionSchema = createInsertSchema(voiceCallSessions);
export type NewVoiceCallSession = typeof voiceCallSessions.$inferInsert;
export type VoiceCallSessionItem = typeof voiceCallSessions.$inferSelect;
