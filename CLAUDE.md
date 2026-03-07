# CLAUDE.md

Guidelines for using Claude Code in this LobeChat repository.

## Tech Stack

- Next.js 16 + React 19 + TypeScript
- SPA inside Next.js with `react-router-dom`
- `@lobehub/ui`, antd for components; antd-style for CSS-in-JS
- react-i18next for i18n; zustand for state management
- SWR for data fetching; TRPC for type-safe backend
- Drizzle ORM with PostgreSQL; Vitest for testing

## Project Structure

```
lobe-chat/
├── apps/desktop/           # Electron desktop app
├── packages/               # Shared packages (@lobechat/*)
│   ├── database/           # Database schemas, models, repositories
│   ├── agent-runtime/      # Agent runtime
│   └── ...
├── src/
│   ├── app/                # Next.js app router
│   ├── store/              # Zustand stores
│   ├── services/           # Client services
│   ├── server/             # Server services and routers
│   └── ...
└── e2e/                    # E2E tests (Cucumber + Playwright)
```

## Development

### Git Workflow

- Use rebase for `git pull`
- Commit messages: prefix with gitmoji
- Branch format: `<type>/<feature-name>`
- PR titles with `✨ feat/` or `🐛 fix` trigger releases

### Package Management

- **Рекомендуется Bun** для локальной разработки: `bun install` (зависимости), `bun run dev` (сервер). Не используйте `npm install` / `npm run dev` — медленнее.
- `pnpm` — для монорепо и CI. Скрипты: `bun run <script>` или `pnpm run <script>`; исполняемые пакеты: `bunx`.

### Testing

```bash
# Run specific test (NEVER run `bun run test` - takes ~10 minutes)
bunx vitest run --silent='passed-only' '[file-path]'

# Database package
cd packages/database && bunx vitest run --silent='passed-only' '[file]'
```

- Prefer `vi.spyOn` over `vi.mock`
- Tests must pass type check: `bun run type-check`
- After 2 failed fix attempts, stop and ask for help

### i18n

- Add keys to `src/locales/default/namespace.ts`
- For dev preview: translate `locales/zh-CN/` and `locales/en-US/`
- Don't run `pnpm i18n` - CI handles it

## Linear Issue Management

**Trigger conditions** - when ANY of these occur, apply Linear workflow:

- User mentions issue ID like `LOBE-XXX`
- User says "linear", "link linear", "linear issue"
- Creating PR that references a Linear issue

**Workflow:**

1. Use `ToolSearch` to confirm `linear-server` MCP exists (search `linear` or `mcp__linear-server__`)
2. If found, read `.agents/skills/linear/SKILL.md` and follow the workflow
3. If not found, skip Linear integration (treat as not installed)

## Skills (Auto-loaded by Claude)

Claude Code automatically loads relevant skills from `.agents/skills/`.
