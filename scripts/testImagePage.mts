/**
 * Проверка загрузки страницы генерации картинок.
 * Запуск: bun run scripts/testImagePage.mts (при работающем pnpm dev на порту 3010).
 */
const BASE = process.env.BASE_URL || 'http://localhost:3010';
const IMAGE_URL = `${BASE}/image?topic=gt_E2ABJV16593M`;

async function main() {
  try {
    const res = await fetch(IMAGE_URL, { redirect: 'follow' });
    if (res.status !== 200) {
      console.error(`Ошибка: статус ${res.status} для ${IMAGE_URL}`);
      process.exit(1);
    }
    const html = await res.text();
    if (!html || html.length < 1000) {
      console.error('Ошибка: ответ слишком короткий');
      process.exit(1);
    }
    if (!html.includes('<!DOCTYPE html>')) {
      console.error('Ошибка: ответ не похож на HTML');
      process.exit(1);
    }
    console.log('OK: страница /image?topic=gt_E2ABJV16593M загружается (200, HTML)', html.length, 'байт');
    process.exit(0);
  } catch (e) {
    console.error('Ошибка запроса:', e);
    process.exit(1);
  }
}

main();
