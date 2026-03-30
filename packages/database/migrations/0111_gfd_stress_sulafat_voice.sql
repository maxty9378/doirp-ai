-- Обновление голоса по умолчанию на Sulafat для всех сценариев тренажеров,
-- где голос не задан или установлен старый дефолт (Kore).

UPDATE training_scenarios
SET voice_name = 'Sulafat'
WHERE voice_name IS NULL OR voice_name = 'Kore';
