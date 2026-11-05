# Spec 20: Comprehensive Open Source & Open Data License Attribution

Status: shipped
Branch: spec/20-open-licenses-and-attribution
Reference (1.0): packages/web/src/features/modals/SettingsModal.tsx

## 1. Objective

Provide comprehensive, accurate attribution and open license listings across both the player-facing settings UI (`SettingsModal`) and the project repository root (`OPEN_SOURCE_LICENSES.md`), including Kotus wordlist data (CC BY 4.0), core runtime dependencies (`zod`, `argon2`, etc.), UI icon assets (Lucide), and replication tooling (`litestream`).

## 2. Invariants & Non-Goals

- **File Cohesion (<500 lines):** Extract the license dataset to `packages/web/src/features/modals/licenses.ts` so `SettingsModal.tsx` stays well under the 500-line ceiling.
- **Visual & Mobile Parity:** The license drawer in `SettingsModal` remains scrollable, lightweight, accessible, and responsive across desktop (1280px) and mobile (390px).
- **No Hardcoded Hex:** All UI elements use CSS custom properties (`var(--color-*)`).
- **Non-Goal:** Do not alter the proprietary status of Sanakenno source code (`"private": true` in `package.json`); this spec strictly attributes third-party open-source libraries and open data.

## 3. Contract & Architecture

- **Licenses Dataset (`packages/web/src/features/modals/licenses.ts`):**
  - Typed array `OPEN_LICENSES: readonly OpenLicenseEntry[]` containing:
    - Name, license identifier (e.g. `CC BY 4.0`, `MIT`, `ISC`, `Apache-2.0`), copyright holder / author, target URL, and optional category/note.
  - Covers: Kotus Nykysuomen sanalista, React, React DOM, Vite, Tailwind CSS, TanStack Query, Zustand, Hono, Kysely, better-sqlite3, Zod, Argon2, Lucide Icons, Litestream, and Workbox.
- **UI Presentation (`packages/web/src/features/modals/SettingsModal.tsx`):**
  - Updated section title / helper text: "Sanakenno käyttää seuraavia avoimen lähdekoodin kirjastoja ja aineistoja:".
  - Scrollable container rendering all entries with license badge, name, copyright, and link.
- **Repository Documentation (`OPEN_SOURCE_LICENSES.md`):**
  - Root markdown document detailing all open source libraries, data sets, licenses, and legal notices with full attribution statements.

## 4. Acceptance Criteria (Test Catalog)

- [x] Unit / Domain: `OPEN_LICENSES` has full metadata for all open source libraries and Kotus dataset.
- [x] Conventional UI: `SettingsModal` renders the license trigger button, expands on click, and displays all license entries including Kotus, Zod, Argon2, and Lucide.
- [x] Mechanical Fitness: `tests/architecture.test.ts` passes 100% (all files <500 lines, no hex colours, specs sync).
- [x] Visual Inspection: `pnpm run screenshot` captures mobile and desktop views cleanly.
