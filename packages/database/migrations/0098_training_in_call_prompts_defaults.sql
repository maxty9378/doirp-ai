-- Заполняем in-call промпты значениями по умолчанию для существующих сценариев
UPDATE "training_scenarios"
SET
  "round_ending_prompt" = COALESCE("round_ending_prompt", 'Через 15 секунд наш эфир на конференции подходит к концу. Кратко подведи итог: убедил ли тебя собеседник или нет, и скажи: "зрители нашего стрима сами сделают выводы". После этого естественно завершай разговор как в реальном живом общении на мероприятии, без служебных фраз про окончание звонка.'),
  "silence_nudge_template" = COALESCE("silence_nudge_template", 'Собеседник молчит. Скажи коротко: "{{phrase}}".'),
  "short_answer_nudge" = COALESCE("short_answer_nudge", 'Отвечай короче: 1-2 предложения и по сути, затем жди ответ собеседника.'),
  "quiet_speaker_nudge" = COALESCE("quiet_speaker_nudge", 'Собеседник говорит очень тихо и неуверенно. Сделай ему жесткое замечание.'),
  "auto_success_prompt" = COALESCE("auto_success_prompt", 'Маркетолог блестяще справился с напором, сохранил лицо бренда и не оставил места для манипуляций. Признай поражение иронично, например: "Ладно, вы хорошо подготовились к эфиру... Но мы ещё проверим ваши слова. На этом всё, возвращаемся в студию!" и естественно заверши диалог в стиле прямого эфира.')
WHERE "round_ending_prompt" IS NULL
   OR "silence_nudge_template" IS NULL
   OR "short_answer_nudge" IS NULL
   OR "quiet_speaker_nudge" IS NULL
   OR "auto_success_prompt" IS NULL;
