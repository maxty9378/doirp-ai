/**
 * One-off: fix TrainingAgents/index.tsx encoding to UTF-8.
 * Run: node scripts/fix-training-agents-encoding.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const filePath = path.join(__dirname, '../src/app/[variants]/(main)/home/features/TrainingAgents/index.tsx');

let content = fs.readFileSync(filePath, 'utf8');

const fixes = [
  { from: /\/\/[^\n]*store[^\n]*API/, to: '// \u0421\u0440\u0430\u0437\u0443 \u043f\u043e\u0434\u0441\u0442\u0430\u0432\u043b\u044f\u0435\u043c \u043a\u043e\u043d\u0444\u0438\u0433 \u0432 store, \u0447\u0442\u043e\u0431\u044b \u0447\u0430\u0442 \u043d\u0435 \u043f\u043e\u043a\u0430\u0437\u044b\u0432\u0430\u043b \u043f\u0443\u0441\u0442\u043e\u0435 \u0441\u043e\u0441\u0442\u043e\u044f\u043d\u0438\u0435 \u0434\u043e \u043e\u0442\u0432\u0435\u0442\u0430 API' },
  { from: /message\.error\('[\s\S]*?'\);\s*\n\s*} finally \{\s*\n\s*setHardNegotiationsLoadingKey/m, to: "message.error('\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0437\u0430\u043f\u0443\u0441\u0442\u0438\u0442\u044c \u0442\u0440\u0435\u043d\u0430\u0436\u0451\u0440');\n      } finally {\n        setHardNegotiationsLoadingKey" },
  { from: /message\.error\('[\s\S]*?'\);\s*\n\s*} finally \{\s*\n\s*setActivePresetKey/m, to: "message.error('\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0437\u0430\u043f\u0443\u0441\u0442\u0438\u0442\u044c \u0442\u0440\u0435\u043d\u0430\u0436\u0451\u0440');\n      } finally {\n        setActivePresetKey" },
  { from: /message\.error\('[\s\S]*?'\);\s*\n\s*return;/g, to: "message.error('\u041d\u0443\u0436\u043d\u043e \u0432\u044b\u0431\u0440\u0430\u0442\u044c \u0444\u0430\u0439\u043b \u0438\u0437\u043e\u0431\u0440\u0430\u0436\u0435\u043d\u0438\u044f');\n        return;" },
  { from: /payload\.error \|\| '[^']*'/g, to: "payload.error || '\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0441\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c \u0431\u0430\u043d\u043d\u0435\u0440'" },
  { from: /message\.success\('[\s\S]*?'\);/g, to: "message.success('\u0411\u0430\u043d\u043d\u0435\u0440 \u0443\u0441\u043f\u0435\u0448\u043d\u043e \u043e\u0431\u043d\u043e\u0432\u043b\u0451\u043d');" },
  { from: /error\.message : '[^']*'/g, to: "error.message : '\u041e\u0448\u0438\u0431\u043a\u0430 \u0437\u0430\u0433\u0440\u0443\u0437\u043a\u0438 \u0431\u0430\u043d\u043d\u0435\u0440\u0430'" },
  { from: /title="[^"]*"/, to: 'title="\u0414\u043e\u0441\u0442\u0443\u043f\u043d\u044b\u0435 \u0442\u0440\u0435\u043d\u0430\u0436\u0451\u0440\u044b"' },
  { from: /label: '[^']*',\s*\n\s*onClick: \(e\) => \{\s*\n\s*e\.domEvent\.stopPropagation\(\);\s*\n\s*hnBannerFileInputRef/, to: "label: '\u041e\u0431\u043d\u043e\u0432\u0438\u0442\u044c \u0431\u0430\u043d\u043d\u0435\u0440',\n                        onClick: (e) => {\n                          e.domEvent.stopPropagation();\n                          hnBannerFileInputRef" },
  { from: /<Text fontSize=\{13\} weight=\{500\}>\s*\n\s*[\s\S]*?\s*\n\s*<\/Text>\s*\n\s*<Text color=\{cssVar\.colorTextSecondary\} fontSize=\{13\}>/s, to: '<Text fontSize={13} weight={500}>\n                \u0416\u0435\u0441\u0442\u043a\u0438\u0435 \u043f\u0435\u0440\u0435\u0433\u043e\u0432\u043e\u0440\u044b\n              </Text>\n              <Text color={cssVar.colorTextSecondary} fontSize={13}>' },
  { from: /<Text color=\{cssVar\.colorTextSecondary\} fontSize=\{13\}>\s*\n\s*[\s\S]*?\s*\n\s*<\/Text>\s*\n\s*<Text fontSize=\{12\} type=\{'secondary'\}>/s, to: '<Text color={cssVar.colorTextSecondary} fontSize={13}>\n                \u0423\u043f\u0440\u0430\u0432\u043b\u0435\u043d\u0447\u0435\u0441\u043a\u0438\u0435 \u043f\u043e\u0435\u0434\u0438\u043d\u043a\u0438 \u0432 \u0447\u0430\u0442\u0435\n              </Text>\n              <Text fontSize={12} type={\'secondary\'}>' },
  { from: /<Text fontSize=\{12\} type=\{'secondary'\}>\s*\n\s*[\s\S]*?\s*\n\s*<\/Text>\s*\n\s*<\/Flexbox>\s*\n\s*<Avatar/s, to: '<Text fontSize={12} type={\'secondary\'}>\n                \u041d\u0430\u0436\u043c\u0438\u0442\u0435, \u0447\u0442\u043e\u0431\u044b \u0432\u044b\u0431\u0440\u0430\u0442\u044c \u0440\u0435\u0436\u0438\u043c\n              </Text>\n            </Flexbox>\n            <Avatar' },
  { from: /avatar="\?\?"/, to: 'avatar="\u2694\uFE0F"' },
  { from: /title="[^"]*"\s*\n\s*width=\{440\}/, to: 'title="\u0412\u044b\u0431\u0435\u0440\u0438\u0442\u0435 \u0440\u0435\u0436\u0438\u043c"\n        width={440}' },
];

for (const { from, to } of fixes) {
  content = content.replace(from, to);
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('Done: written UTF-8 to', filePath);
