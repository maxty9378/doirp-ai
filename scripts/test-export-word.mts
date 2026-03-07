/**
 * Проверка экспорта Markdown → Word через @mohtasham/md-to-docx.
 * Запуск: npx tsx scripts/test-export-word.mts
 * Результат: test-export-word.docx в корне проекта.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const markdown = `# Тестовая страница

Проверка экспорта в формат Word.

## Список
- Пункт 1
- Пункт 2

**Жирный текст** и *курсив*.
`;

async function main() {
  const { convertMarkdownToDocx } = await import('@mohtasham/md-to-docx');
  const blob = await convertMarkdownToDocx(markdown);
  const buffer = Buffer.from(await blob.arrayBuffer());
  const outPath = join(process.cwd(), 'test-export-word.docx');
  writeFileSync(outPath, buffer);
  console.log('OK: записан файл', outPath);
}

main().catch((e) => {
  console.error('Ошибка:', e);
  process.exit(1);
});
