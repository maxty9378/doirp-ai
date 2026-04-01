-- Удаляем старые прокси и добавляем актуальные из запроса пользователя.
-- Первым идёт основной прокси пользователя с высшим приоритетом.

DELETE FROM "voice_call_proxies";

INSERT INTO "voice_call_proxies" ("id", "url", "enabled", "priority", "created_at", "updated_at")
VALUES
  ('vcp_user_main', 'socks5h://gemini:gBOiFtedtz2SHEVNtTqi@95.81.98.243:20818', 1, 10, NOW(), NOW()),
  ('vcp_node_1', 'socks5h://cddtxqdm:kcqr3pqna7ja@31.59.20.176:6754', 1, 100, NOW(), NOW()),
  ('vcp_node_2', 'socks5h://cddtxqdm:kcqr3pqna7ja@23.95.150.145:6114', 1, 110, NOW(), NOW()),
  ('vcp_node_3', 'socks5h://cddtxqdm:kcqr3pqna7ja@198.23.239.134:6540', 1, 120, NOW(), NOW()),
  ('vcp_node_4', 'socks5h://cddtxqdm:kcqr3pqna7ja@45.38.107.97:6014', 1, 130, NOW(), NOW()),
  ('vcp_node_5', 'socks5h://cddtxqdm:kcqr3pqna7ja@107.172.163.27:6543', 1, 140, NOW(), NOW()),
  ('vcp_node_6', 'socks5h://cddtxqdm:kcqr3pqna7ja@198.105.121.200:6462', 1, 150, NOW(), NOW()),
  ('vcp_node_7', 'socks5h://cddtxqdm:kcqr3pqna7ja@216.10.27.159:6837', 1, 160, NOW(), NOW()),
  ('vcp_node_8', 'socks5h://cddtxqdm:kcqr3pqna7ja@142.111.67.146:5611', 1, 170, NOW(), NOW()),
  ('vcp_node_9', 'socks5h://cddtxqdm:kcqr3pqna7ja@191.96.254.138:6185', 1, 180, NOW(), NOW()),
  ('vcp_node_10', 'socks5h://cddtxqdm:kcqr3pqna7ja@31.58.9.4:6077', 1, 190, NOW(), NOW());

-- Устанавливаем Sulafat как лучший голос девушки для всех активных сценариев
UPDATE "training_scenarios"
SET "voice_name" = 'Sulafat'
WHERE "is_active" = true;
