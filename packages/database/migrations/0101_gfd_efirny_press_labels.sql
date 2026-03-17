-- Подписи индикатора «Эфирный прессинг» для сценария GFD
UPDATE training_scenarios
SET
  score_display_label = 'ЭФИРНЫЙ ПРЕССИНГ',
  score_level_labels = '{"high": "✅ КРАСИВО ОТРАБОТАНО", "low": "📛 ПРОВАЛ ИНТЕРВЬЮ", "mid": "⚠️ НАПРЯЖЕННАЯ ПАУЗА"}'::jsonb
WHERE key = 'training-gfd-stress';
