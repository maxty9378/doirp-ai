WITH source_scenario AS (
  SELECT *
  FROM training_scenarios
  WHERE key = 'training-gfd-stress'
),
inserted_scenario AS (
  INSERT INTO training_scenarios (
    id,
    key,
    title,
    description,
    legend,
    user_role,
    goals,
    checkpoint_ids,
    system_prompt,
    analyze_prompt,
    debrief_prompt,
    assistant_label,
    user_label,
    voice_name,
    banner_url,
    context_window,
    silence_nudge_after_ms,
    silence_nudge_cooldown_ms,
    silence_hard_hangup_ms,
    session_duration_ms,
    silence_nudge_phrases,
    show_legend,
    show_intro_dialog,
    enable_checkpoints,
    enable_scoring,
    is_active,
    score_display_label,
    score_level_labels,
    opening_instruction,
    intro_dialog_title,
    intro_dialog_description,
    intro_dialog_placeholder,
    intro_dialog_hint,
    intro_dialog_button_label,
    round_ending_prompt,
    silence_nudge_template,
    short_answer_nudge,
    quiet_speaker_nudge,
    auto_success_prompt,
    created_at,
    updated_at
  )
  SELECT
    concat('trn_', substring(md5(random()::text || clock_timestamp()::text) from 1 for 12)),
    'training-gfd-stress-google-live',
    'GFD: Google Live + расшифровка',
    'Отдельная версия стресс-интервью на официальном Google Gemini Live API с live-расшифровкой речи.',
    legend,
    user_role,
    goals,
    checkpoint_ids,
    system_prompt,
    analyze_prompt,
    debrief_prompt,
    assistant_label,
    user_label,
    voice_name,
    banner_url,
    context_window,
    silence_nudge_after_ms,
    silence_nudge_cooldown_ms,
    silence_hard_hangup_ms,
    session_duration_ms,
    silence_nudge_phrases,
    show_legend,
    show_intro_dialog,
    false,
    false,
    is_active,
    NULL,
    NULL,
    opening_instruction,
    intro_dialog_title,
    intro_dialog_description,
    intro_dialog_placeholder,
    intro_dialog_hint,
    intro_dialog_button_label,
    round_ending_prompt,
    silence_nudge_template,
    short_answer_nudge,
    quiet_speaker_nudge,
    NULL,
    NOW(),
    NOW()
  FROM source_scenario
  WHERE NOT EXISTS (
    SELECT 1
    FROM training_scenarios
    WHERE key = 'training-gfd-stress-google-live'
  )
  RETURNING id
)
INSERT INTO training_knowledge_entries (
  id,
  scenario_id,
  product_ingredient,
  official_usp,
  attack_myth,
  created_at,
  updated_at
)
SELECT
  concat('trk_', substring(md5(src.id || clock_timestamp()::text || random()::text) from 1 for 12)),
  inserted_scenario.id,
  src.product_ingredient,
  src.official_usp,
  src.attack_myth,
  NOW(),
  NOW()
FROM training_knowledge_entries AS src
JOIN training_scenarios AS base ON base.id = src.scenario_id
CROSS JOIN inserted_scenario
WHERE base.key = 'training-gfd-stress';
