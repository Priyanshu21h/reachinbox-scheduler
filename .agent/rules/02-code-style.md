# Code Style Rules

## TypeScript
- Strict mode everywhere. No `any`. Use `unknown` and narrow with guards.
- Prefer `const` over `let`. Never `var`.
- Use named exports. Avoid default exports (exception: React components in apps/web).
- All async functions must have explicit return types.
- Use `satisfies` for object literal type checking where appropriate.

## Naming Conventions
- Files: `kebab-case.ts`
- Classes: `PascalCase`
- Functions and variables: `camelCase`
- Constants and env vars: `SCREAMING_SNAKE_CASE`
- Types and interfaces: `PascalCase` with `I` prefix for interfaces only if needed for clarity

## Error Handling
- Use typed error classes extending `Error` (e.g., `AppError`, `ValidationError`, `NotFoundError`).
- Always log errors with `pino` at the appropriate level.
- Never `console.log`. Use `logger.info`, `logger.warn`, `logger.error`.

## Imports
- Use path aliases where available (`@rs/shared`, `@rs/db`).
- Group imports: 1) Node built-ins, 2) External packages, 3) Internal packages, 4) Local modules.

## API Design
- All endpoints return `{ data, meta }` on success or `{ error: { code, message, details } }` on failure.
- Use HTTP status codes correctly (200, 201, 400, 401, 403, 404, 409, 422, 500).
- Always validate request bodies with zod via the `validate` middleware.

## React (apps/web)
- Functional components only. No class components.
- Co-locate component styles with the component.
- Use `@tanstack/react-query` for all server state.
- No direct `fetch` — use the typed axios client in `lib/api.ts`.
- Never store auth tokens in localStorage. Auth is cookie-based (httpOnly).

## Testing
- Test files: `*.test.ts` alongside the module.
- Use `vitest`. No `jest`.
- Mock external dependencies (Redis, Prisma) only when necessary; prefer real connections for integration tests.
