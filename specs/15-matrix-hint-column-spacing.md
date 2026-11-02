# Spec 15: Matrix Hint Consistent Column Spacing & Left Alignment

Status: shipped
Branch: spec/15-matrix-hint-column-spacing
Reference (1.0): `packages/web/src/features/gameplay/HintMatrixTable.tsx`, `packages/web/src/features/gameplay/HintPanels.tsx`

## 1. Objective

Make the Matrix hint table columns consistently spaced with constant width and left-aligned, omitting empty columns, and reserving sufficient space so that puzzles requiring the maximum number of columns (up to 16 active length columns, benchmarked by letter set `aeilnst` with lengths 4–19) fit cleanly without overflow or layout shifts across all supported screen sizes (down to 360px).

## 2. Invariants & Non-Goals

- **Invariants:**
  - The maximum number of distinct word length columns required by any valid 7-letter puzzle combination is **16** (benchmarked by `aeilnst` spanning continuous word lengths from 4 to 19).
  - Empty columns (lengths with zero words in the current puzzle) must be omitted.
  - Existing length columns must be aligned to the left with uniform, constant column width.
  - Sizing must fit on mobile viewports ($\ge 360$px wide, 332px inside container padding) without horizontal clipping or scrollbar when all 16 columns are present.
  - Tabular numerals (`fontVariantNumeric: 'tabular-nums'`) and center-aligned cells ensure headers (e.g. `4`, `10`, `19`), counts, and `·` dots line up in consistent vertical lines.
- **Non-Goals:**
  - Do not change hint unlocking tiers, progressive hint costs, or scoring.
  - Do not change how words are counted or hint data derivation in `@sanakenno/shared`.
  - Do not introduce horizontal scrolling in the matrix hint view.

## 3. Contract & Architecture

- **Shared Schemas / Logic (`@sanakenno/shared`):**
  - No changes needed (`deriveHintData` already produces `data.matrix`).
- **Server (`@sanakenno/server`):**
  - No changes needed.
- **Frontend Slice (`@sanakenno/web`):**
  - In `HintMatrixTable.tsx`:
    - Remove `w-full` from `table`. Replace with left-aligned table layout (`table-fixed` or explicit column widths on each `<col>` / `<th>` / `<td>`).
    - Standardize column widths:
      - `Kirj.` column: constant 28px width (`w-[28px]`, `min-w-[28px]`, `max-w-[28px]`).
      - `Yht.` column: constant 32px width (`w-[32px]`, `min-w-[32px]`, `max-w-[32px]`).
      - Each length column: constant 17px width (`w-[17px]`, `min-w-[17px]`, `max-w-[17px]`), centered (`text-center`).
    - Total width calculation:
      - $28\text{px} + 32\text{px} + 1\text{px (border)} + 16 \times 17\text{px} = 333\text{px}$, fitting within the 332px–336px available width on 360px viewport (and easily within 390px / 440px).
    - Center cell contents (`text-center`) in length columns so single-digit numbers, double-digit numbers (`10`–`22`), and faint dots (`·`) align on the exact vertical axis.
    - Ensure Tier 1 locked overlay (`UpgradeButton`) is cleanly positioned over the revealed columns without covering `Kirj.` or `Yht.`.

## 4. Acceptance Criteria (Test Catalog)

- [x] Unit / Domain: Verification confirms letter set `aeilnst` produces the maximum column requirement (16 distinct active lengths: 4–19) across all 7-letter combinations in Kotus wordlist.
- [x] Conventional UI (React Testing Library in Vitest):
  - Matrix table renders length columns with constant width classes and left-aligned table container.
  - Empty columns are omitted; only active lengths are rendered.
  - Sizing fits 16 columns within 332px container width without horizontal overflow.
  - Total and letter headers remain aligned and separated by border line.
- [x] Architectural Fitness: `pnpm check:agent` passes 100% (typecheck, lint, test:arch, test:unit, build).
- [x] Visual Inspection (`pnpm run screenshot` mobile 390px + desktop 1280px): Matrix hint displays clean, left-aligned, constant-width vertical columns across tiers.
