# AGENTS.md

## Layout

Two **independent** npm projects. No root manifest, no workspaces, no git repo, no CI, no Docker. Run every `npm` command from inside the directory it belongs to; `npm install` is required per-directory.

- `backend/` — Express 5 + `pg` + zod 4 + `jsonwebtoken` + `bcrypt` + `@mistralai/mistralai` + pino/helmet/cors/express-rate-limit. `node_modules` is installed but there are **zero source files** — no `src/`, no `.env`, no schema/migrations. `tsconfig.json`, `package.json`, `package-lock.json` are the only tracked-looking files.
- `frontend/` — Vite 8 + React 19. Still the **unmodified `npm create vite` scaffold**: `src/App.tsx` is the "Get started / Count is 0" demo. Plain CSS in `App.css`/`index.css`; no router, no state library, no CSS framework.

## Commands

Frontend (`cd frontend`) — all four verified working:

| Command | Notes |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run lint` | **oxlint**, not ESLint. Non-type-aware (`typeAware` unset) |
| `npm run build` | `tsc -b && vite build` — **typecheck is part of the build** |
| `npm run preview` | serve `dist/` |

No test script, no formatter, no Prettier config anywhere in the repo.

Backend (`cd backend`) — **no `dev`/`start`/`build` script exists**; `npm test` is the stock `exit 1` placeholder. The only working runner is `npx tsx <file>`.

Verification order: frontend `npm run lint` then `npx tsc -b` (or just `npm run build`); backend `npx tsc --noEmit`.

## Backend TypeScript traps

These conflict in the current config and are verified — they will bite on the first file you add.

1. `package.json` sets `"type": "commonjs"` while `tsconfig.json` sets `verbatimModuleSyntax: true` + `module: "nodenext"`. Result: **any ESM `import`/`export` in a `.ts` file is a hard `tsc` error TS1295**, but `tsx` runs it fine at runtime. `tsc` and runtime will disagree. Fix the config (flip `"type": "module"`, or drop `verbatimModuleSyntax`) rather than writing CJS `require` — don't paper over it with `// @ts-ignore`.
2. `tsconfig.json` sets `"types": []`, which excludes `@types/node` even though it is installed. `process`, `Buffer`, etc. fail with TS2591. Add `"types": ["node"]` before writing any Express/env code.
3. `node --experimental-strip-types` does **not** work here (fails on `"type": "commonjs"`). Always use `npx tsx`.
4. `npx tsc --noEmit` currently fails `TS18003: No inputs were found` — that is just the empty source tree, not a real error. It goes away once the first `.ts` file exists.
5. `declaration: true` with no `rootDir`/`outDir` means `tsc` would emit `.js` + `.d.ts` beside your sources. Prefer `--noEmit`; there is no build pipeline.
6. Stricter than default: `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`. Both bite hardest on objects that came from `JSON.parse`/Zod with optional fields — index access yields `T | undefined`, and you cannot pass `prop: undefined` for an optional prop.

## Frontend quirks

- `erasableSyntaxOnly` in both `tsconfig.app.json` and `tsconfig.node.json`: no `enum`, no parameter properties, no namespaces. Use `as const` objects or union types.
- `noUnusedLocals` / `noUnusedParameters` are on, so an unused import fails the build.
- Lint will not catch type errors (oxlint is not type-aware). `npx tsc -b` is the real check.
- `vite.config.ts` configures only the React plugin — **no `server.proxy` and no API base URL**. The frontend cannot reach the backend until you add one.
- Frontend and backend pin **different TypeScript majors** (`~6.0` vs `7.0`) and different `@types/node` majors (24 vs 26). Don't hoist, share, or symlink across the boundary; typecheck each side separately.

## Secrets

No `.env` exists yet and only `frontend/.gitignore` exists — nothing currently excludes backend secrets. `dotenv` is already a dependency. Keep `DATABASE_URL`, `JWT_SECRET`, and `MISTRAL_API_KEY` out of committed files, and add a root `.gitignore` with `.env*` when the backend starts reading config.
