# 🛡️ Axiom — AI Badge & QA Agent for E-Commerce

[![CI](https://github.com/Vishnu-VJ24/axiom/actions/workflows/ci.yml/badge.svg)](https://github.com/Vishnu-VJ24/axiom/actions/workflows/ci.yml)

> A demo e-commerce store with two production-grade AI agents built on top: one that assigns behavioral badges to carts, customers, and products using Gemini, and one that takes a plain-English test instruction and generates, runs, and summarizes a real Playwright test — live, in your browser.

---

## What This Is

Axiom is a portfolio project demonstrating full-stack + AI agent engineering at the intersection of e-commerce, LLM integration, and test automation.

The store sells 10 products. Four seeded customers browse and buy. Two AI agents watch everything:

**Badge Agent** — After every cart mutation or order, it packages the relevant context (cart total, item categories, order history, product popularity) and sends it to Gemini with a structured badge taxonomy. Gemini returns JSON: which badges apply and *why* — a one-sentence reasoning per badge. Those badges render as colored pills in the UI, updating every 4 seconds via polling.

**QA Agent** — A floating panel lets you type plain English: *"Adding 3 items to the cart should update the badge and total."* The backend sends that instruction plus a precise description of the app's selectors and routes to Gemini, which returns a complete TypeScript Playwright test. The backend saves it to disk, runs it with `npx playwright test`, captures stdout/stderr, sends the raw output back to Gemini for a plain-English summary, and shows you pass/fail and a paragraph explanation — all within about 30 seconds.

---

## Architecture

The project is a Node.js monorepo with two workspaces:

- **`frontend/`** — React (Vite) SPA. Plain CSS, no UI framework. Communicates with the backend via `/api/*` proxied through Vite's dev server. Polls `/api/badges/bulk` every 4 seconds to keep badge pills live.

- **`backend/`** — Express API. SQLite (via `better-sqlite3`) as the database — zero external dependencies, runs in-process. Two agent modules (`badge-agent.js`, `qa-agent.js`) call the Google Generative AI SDK. Routes: `/api/products`, `/api/cart`, `/api/customers`, `/api/orders`, `/api/badges`, `/api/qa`.

- **`tests/`** — Hand-written Playwright e2e tests in `tests/e2e/`. AI-generated tests land in `tests/generated/` at runtime (gitignored content, folder tracked).

- **`.github/workflows/ci.yml`** — Runs the full Playwright suite on every push to `main` using Chromium.

---

## Setup

### Prerequisites
- Node.js 18+
- A Google Gemini API key ([get one here](https://aistudio.google.com/))

### Installation

```bash
# 1. Clone
git clone https://github.com/Vishnu-VJ24/axiom.git
cd axiom

# 2. Install all workspace dependencies
npm install

# 3. Create your .env file
cp .env.example .env
# Edit .env and add your GEMINI_API_KEY

# 4. Run (starts backend on :3001 and frontend on :5173 concurrently)
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

On first run, the backend seeds the SQLite database and triggers an initial badge evaluation for all entities. Badges will appear within ~10 seconds of startup.

### Running Tests

```bash
# Install Playwright browsers (first time only)
npx playwright install

# Run all e2e tests
npm test

# Run with interactive UI
npx playwright test --ui
```

### BrowserStack (Optional)

To route tests through [BrowserStack Automate](https://www.browserstack.com/automate):

```bash
# Add to your .env:
USE_BROWSERSTACK=true
BROWSERSTACK_USERNAME=your_username
BROWSERSTACK_ACCESS_KEY=your_key

npm test
```

All tests run locally by default. BrowserStack is purely additive — no local tests break without it.

---

## What This Demonstrates

| Feature | Skill |
|--------|-------|
| React + Vite SPA, CSS design system | Frontend engineering |
| Express REST API, SQLite, seeded data | Backend engineering |
| Gemini API with structured JSON prompts | LLM/AI integration |
| Badge taxonomy, entity classification | Agent design & prompt engineering |
| Playwright test generation from natural language | AI-driven test automation |
| Live badge polling, toast notifications | Real-time UX patterns |
| GitHub Actions CI, multi-browser Playwright | CI/CD & DevOps |
| BrowserStack Automate config | Cross-browser cloud testing |
| Monorepo workspaces, clean separation | Software architecture |

---

## 90-Second Demo Script

1. **Open the app** — badges are already on Alex Rivera's products and customer header (VIP, Big Spender). Explain: *"These come from Gemini analyzing the seeded data on startup."*

2. **Hover a badge** — the tooltip shows Gemini's exact reasoning. *"Not a rule engine — the model decides and explains."*

3. **Switch to Jamie** — customer badges and cart change. Add the Ergonomic Chair ($249.99) to cart. Open cart — total shows. Wait 4 seconds — a "High Value Cart" badge appears in the cart footer.

4. **Open QA Agent panel** — click a pre-typed example chip: *"Add 2 items to cart and verify the total updates."* Hit Generate & Run. Watch the spinner. In ~20 seconds: pass/fail, Gemini's summary, and a "View Generated Code" toggle showing the actual Playwright TypeScript.

5. **Close and show the test history** — the last 5 runs are listed. *"Every run saves to disk and the DB. You can replay any of them."*

6. **Mention CI** — *"Push to main → GitHub Actions runs all of this automatically, including any AI-generated tests."*

---

## Project Structure

```
axiom/
├── frontend/
│   ├── src/
│   │   ├── App.jsx              # Root: customers, products, cart, badges, QA
│   │   ├── index.css            # Complete design system (dark mode, glassmorphism)
│   │   ├── components/
│   │   │   ├── BadgePill.jsx    # Badge with hover-tooltip reasoning
│   │   │   ├── ProductCard.jsx  # Product + product badges + add-to-cart
│   │   │   ├── CartSidebar.jsx  # Slide-in cart with cart badges + checkout
│   │   │   └── QaPanel.jsx      # QA agent UI: input → run → summary → history
│   │   └── hooks/useApi.js      # Fetch helpers
│   └── vite.config.js
├── backend/
│   └── src/
│       ├── index.js             # Express server, startup, seed trigger
│       ├── db/
│       │   ├── schema.js        # SQLite schema (better-sqlite3)
│       │   └── seed.js          # Realistic seed data
│       ├── routes/              # products, customers, cart, orders, badges, qa
│       └── agents/
│           ├── badge-agent.js   # Gemini badge evaluation + DB persistence
│           └── qa-agent.js      # Test generation, execution, summarization
├── tests/
│   ├── e2e/                     # Hand-written Playwright tests
│   └── generated/               # AI-generated tests (runtime, gitignored content)
├── docs/DECISIONS.md
├── playwright.config.ts         # Local + BrowserStack config
├── .github/workflows/ci.yml
└── .env.example
```
