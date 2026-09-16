# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary users are the Ecomfive operations team managing "proveeduría" (supply /
drop-shipping operations) for Costa Rica and Panamá: Hernán Betancourt and
jhokser gonzalez build and operate the system day to day, Alcides Andrade
reviews figures and approves pricing/inventory decisions, and Carmen provides
and validates data from Dropi. The beta's near-term users are this small
internal team, not external customers or a broad non-technical staff — the
upload flows assume some comfort with spreadsheets.

## Product Purpose

Replace manual, Carmen-produced reports with an internal system of record for
proveeduría operations: reconcile bank deposits against what each platform
(starting with Dropi) reports, track physical inventory in/out via the
warehouse scanning tool ("pistoleo"), and flag inventory that platforms have
not returned so the team can file claims. Success means the team can trust
these numbers without waiting on manual reports, starting with Costa Rica and
Panamá.

## Positioning

Where spreadsheets and manual reports only show what one person compiled
after the fact, this system keeps a per-platform, per-country ledger that
ties bank movements, platform-reported orders, and physical inventory scans
together, so discrepancies and unreturned inventory surface on their own
instead of requiring someone to notice them.

## Operating Context

- Bank statements arrive as CSV or Excel exports from CR/PA banks and are
  uploaded manually (no bank API integration).
- Inventory movements come from María José's warehouse scanning tool
  ("pistoleo"), currently imported as CSV/Excel exports.
- Dropi is the first platform integrated; EFI and Boxful/Drop are expected to
  follow. Two distinct Dropi account roles matter: a "proveedor" account for
  the team's own orders, and a "dropshipper" account (fase 2) for competitor
  intelligence.
- Backend is Supabase (Postgres, Storage); hosting is Vercel, deployed from
  `Ecomfive/sandbox` on GitHub with CI/CD on push to `main`.
- A cron job (`/api/cron/alertas-inventario`) is meant to run quincenally to
  auto-generate inventory-not-returned alerts.

## Capabilities and Constraints

- No authentication yet: anyone with the deployed link can read and write
  all data. Confirmed as a **temporary beta constraint** — the team intends
  to add login and per-person roles later; do not treat the current
  open-access model as a permanent decision.
- Products can be created automatically by SKU during inventory import,
  without waiting for the Dropi extraction to populate a catalog first.
- Bank statement column layout is not fixed — the upload flow supports
  mapping arbitrary CSV/Excel columns rather than assuming one bank's format.
- Automated Dropi data extraction (via browser automation) is not yet built;
  "monto reportado por plataforma" in conciliación is entered manually for
  now.
- Competitor/market intelligence (scraping via the Dropi dropshipper
  account) is explicitly deferred to a later phase, not part of the current
  beta.

## Brand Commitments

This tool is Ecomfive's internal system and carries the Ecomfive brand
identity rather than staying a generically named, unbranded internal tool.
The Ecomfive wordmark (black, white, gray, and red variants) was supplied by
the user and lives at `public/brand/`; the UI accent color (`--accent` in
`src/app/globals.css`, `#d1302f`) is a contrast-adjusted version of the
brand's red (`#e83b3c` in the logo file) so button and link text clears
WCAG AA against it — the literal brand red is reserved for the logo itself.
No broader brand guideline (secondary palette, typography, imagery style)
has been supplied beyond the logo — do not invent one beyond what these
files establish.

## Evidence on Hand

None yet. The beta has been built and verified against test data only, which
was deleted after each verification pass. No real customer, order, or
financial data has been loaded. Do not fabricate sample data, testimonials,
or metrics when representing this product.

## Product Principles

1. Replace manual reporting with a system of record — every reconciliation
   and alert should be traceable to real uploaded data, not a person's
   memory.
2. Start narrow and correct (Costa Rica + Panamá, Dropi only) rather than
   broad and approximate; expand platform and country coverage only after
   the pattern is proven.
3. Prefer manual, reviewable steps (CSV upload, manual platform-amount
   entry, manual alert generation) over automation the team can't yet
   verify, and automate incrementally as trust in the data grows.
4. Treat the current lack of authentication as a known gap, not a design
   decision — plan future work assuming login and per-person roles will
   exist.
