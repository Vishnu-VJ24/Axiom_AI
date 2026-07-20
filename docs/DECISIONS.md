# Sentinel — Engineering Decisions & Tradeoffs

These notes explain the key choices made in building Sentinel. Written for a technical reader — no marketing copy, just the reasoning.

---

## Database: Node.js Built-in SQLite (`node:sqlite`)

**Choice**: Single-file SQLite database, accessed via the built-in `node:sqlite` module (Node.js 22.5+).

**Why**: The primary constraint is zero-setup local execution — no external daemon, no Docker, no Visual Studio build tools. `better-sqlite3`, the most common SQLite library for Node, requires compiling a C++ native addon. On Windows without Visual Studio installed, this fails silently and blocks the entire install. `node:sqlite` ships *inside* the Node.js binary — no npm package, no compilation, no permissions issues. The synchronous API is nearly identical to `better-sqlite3` (`.prepare()`, `.run()`, `.get()`, `.all()`), so the code reads exactly the same.

This is also a deliberate forward-looking choice: `node:sqlite` was stabilized in Node 22.5 and represents the direction of the Node.js core team. For a 2025 portfolio project on Node 22, using the built-in over a third-party native addon is the right call.

**Tradeoff**: Requires the `--experimental-sqlite` flag in Node versions below 22.5 (where it was still experimental), and Node 22+ in general. For a demo project targeting a modern stack, this is a non-issue. SQLite itself doesn't support multi-process writes — a horizontally scaled production deployment would need Postgres, but the schema is written so that migration would only touch the connection setup, not the query logic.

---

## Badge Updates: Polling, Not WebSockets

**Choice**: The frontend polls `/api/badges/bulk` every 4 seconds.

**Why**: WebSockets would be the "correct" production answer for live updates, but they add meaningful complexity: a persistent connection manager, reconnection logic, and a stateful server. For a demo where I need to show live-updating badges to a hiring manager, 4-second polling is visually indistinguishable from real-time and costs maybe 15 lines of code vs. hundreds.

The polling interval (4s) was chosen because Claude badge evaluation takes 1–3 seconds. A 4s poll means badges appear within one or two poll cycles after a cart mutation — fast enough to look live without hammering the server.

**Tradeoff**: Each poll is a small SQLite read, so the overhead is negligible. In production with 10k users, you'd switch to Server-Sent Events or WebSockets and push badge updates from the server.

---

## Badge Taxonomy Design

**Choice**: 12 badges across 3 entity types (cart, product, customer), with clear numeric thresholds.

**Why**: The badge taxonomy was designed to make good demos *guaranteed* from the seed data. Alex has 4 orders and a $379 cart — VIP and High Value Cart fire on the first page load. This means a live demo doesn't depend on the viewer clicking the right things.

The thresholds ($100 for High Value Cart, 3 orders for VIP) were set low enough to trigger on the seed data but high enough to be meaningfully distinguishing. The badge names map to real e-commerce concepts Walmart would recognize (VIP tiers, trending products, bulk buyers).

**Why Claude instead of a rule engine**: A hardcoded rule engine could produce the same badges. But the point of this project is to demonstrate AI agent design — the reasoning field is the key differentiator. Claude doesn't just return `"VIP"`, it returns `"Customer has completed 4 orders totaling $624.95, exceeding the 3-order VIP threshold."` That reasoning is what makes this an agent, not a lookup table. Hover the badge in the UI to see this.

---

## QA Agent: Test Generation Before Execution

**Choice**: Generate test → save to disk → execute → summarize. Four distinct steps, each with its own Claude call.

**Why**: Separation of concerns. Each step has a single responsibility and can fail independently. If the test generation succeeds but execution fails (e.g., selector changed), the generated code is still on disk and inspectable. The two-Claude-call design (generation + summarization) also lets me use the same model for both tasks without overloading a single prompt.

Saving the generated file to `tests/generated/` rather than executing from a string was intentional: it means CI can pick up and replay the last generated test without re-calling Claude, and the file is human-readable and version-inspectable.

**Tradeoff**: The two Claude calls add latency (~20–30s total). For a synchronous HTTP endpoint, that's a long response time. In production, this would be an async job with polling or WebSocket updates. For a demo, the spinner with "Claude is generating…" messaging actually *shows the work happening*, which is a feature.

---

## App Context as "API Documentation" for the QA Agent

**Choice**: A hardcoded `APP_CONTEXT` string in `qa-agent.js` lists the app's key selectors, routes, and behaviors.

**Why**: Claude can't inspect a running browser to discover selectors. Without grounding, it would hallucinate selector names or write tests that can't find elements. The `APP_CONTEXT` acts as a contract between the agent and the application — all `data-testid` attributes in the frontend components are defined here so Claude can write tests that actually work.

This pattern mirrors how real AI-assisted test tools work (Sauce Labs AI, Testim, etc.) — they build a selector registry or visual index of the UI so the model has accurate grounding. We're doing it manually, but the principle is identical.

---

## No Authentication

**Choice**: A simple customer selector dropdown; no login, sessions, or tokens.

**Why**: Auth would add ~200 lines of boilerplate and nothing to the demo. The interesting parts of this project are the AI agents. The "customer selector" approach lets a hiring manager switch between personas mid-demo without having to log in and out, which actually makes for a better live demo than real auth would.

---

## Frontend: Plain CSS, No Tailwind

**Choice**: A handwritten `index.css` design system with CSS custom properties.

**Why**: Tailwind generates utility classes from a config — which is fast for teams but obscures the design thinking in a portfolio context. A handwritten design system with explicit CSS variables (`--accent-violet`, `--bg-glass`, etc.) shows that I understand design tokens, theming, and component-level CSS architecture, not just that I can write `className="flex items-center"`.

The design choices (dark mode only, glassmorphism, violet accent, Inter font) were chosen to create a strong first impression. A hiring manager who opens the app should see something that looks like a real product, not a tutorial project.

---

## Monorepo: npm Workspaces, Not Turborepo

**Choice**: Two workspaces (`frontend/`, `backend/`) managed by npm's built-in workspace support.

**Why**: Turborepo and Nx add caching and task orchestration that's valuable at scale, but overkill for two packages. npm workspaces give shared `node_modules` hoisting and workspace-scoped scripts with zero additional tooling. The root `package.json` uses `concurrently` to start both servers with a single `npm run dev`.

**Tradeoff**: No build caching. On a large codebase this would matter. For a two-package demo, it's irrelevant.

---

## BrowserStack: Config-Level Integration, Not Code-Level

**Choice**: BrowserStack is configured in `playwright.config.ts` via CDP endpoint, toggled by `USE_BROWSERSTACK=true`.

**Why**: The cleanest BrowserStack integration for Playwright is the CDP (Chrome DevTools Protocol) endpoint approach — it requires no SDK, no wrapper, no code changes. Tests are identical whether running locally or on BrowserStack; only the browser connection changes. This is the correct production pattern and demonstrates knowledge of how cross-browser cloud services actually work.

The env-toggle design means the repo ships with BrowserStack disabled, so contributors don't need credentials to run tests locally. CI uses local Chromium by default, keeping CI costs zero.
