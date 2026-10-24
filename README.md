# PaisaTrack

A private, offline-first personal expense tracker designed for iPhone 17 (PWA) and desktop web.

Complete product and architecture requirements are documented in [PaisaTrack_Complete_Development_Guide.md](./PaisaTrack_Complete_Development_Guide.md).

---

## Tech Stack (Phase 0)

- **Framework:** React 19 + TypeScript (Strict Mode)
- **Bundler & Dev Server:** Vite
- **Styling:** Vanilla CSS with custom design tokens and iOS safe-area variables
- **Database (Phase 1+):** Dexie.js (IndexedDB)
- **Validation (Phase 1+):** Zod
- **Icons:** Lucide React
- **Date & Math:** `date-fns`, integer paise arithmetic
- **Testing:** Vitest + React Testing Library + jsdom
- **PWA:** `vite-plugin-pwa`

---

## Getting Started

### Prerequisites

- Node.js (v20+ recommended, tested with v24.13.0)
- npm (v10+ recommended, tested with v11.6.2)

### Installation

```bash
npm install
```

### Development Scripts

| Command | Description |
|---|---|
| `npm run dev` | Starts Vite local development server |
| `npm run build` | Builds type-checked production bundle to `dist/` |
| `npm run preview` | Previews production build locally |
| `npm run typecheck` | Runs TypeScript compiler checks without emitting files |
| `npm test` | Runs all unit and component tests via Vitest |
| `npm run test:watch` | Runs Vitest in interactive watch mode |

---

## Architecture Principles

1. **Local-First & Private:** Data resides exclusively in device IndexedDB. No backend, cloud sync, or external analytics in v1.
2. **Financial Precision:** All monetary amounts are stored and calculated in integer paise (₹1 = 100 paise).
3. **Deterministic:** Chat-style entry parses input deterministically with user confirmation; no silent saves or remote LLM calls.
4. **Offline Capability:** PWA app-shell caching ensures core functionality works offline after initial load.
