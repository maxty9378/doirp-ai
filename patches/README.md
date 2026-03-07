# Патчи зависимостей

Применяются автоматически при `pnpm install`.

## @lobehub__ui.patch

Устраняет предупреждения консоли в dev:

- **Modal:** замена устаревшего `maskClosable` на `mask: { closable }` (API antd 6).
- **Image (preview):** замена устаревшего `rootClassName` на `classNames.root` (API antd 6).

Предупреждение React 19 про `element.ref` исходит из @base-ui/react и @lobehub/ui (Tooltip/Popover) и устраняется только обновлением этих пакетов.
