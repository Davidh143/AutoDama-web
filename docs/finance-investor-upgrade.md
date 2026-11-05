# AutoDama – investor financing upgrade (implementation plan)

Status: specification committed on feature branch; production `main` unchanged. Do not deploy before tests and user approval.

## Confirmed rules
- Default investor remuneration **35%** of the profit attributable to the investor-funded portion of each car. Configurable to arbitrary decimal percentage later, with effective date and nonretroactive snapshots.
- Helper default remuneration **15% of vehicle profit**, configurable; future option fixed monthly remuneration plus a percentage. Avoid charging helper remuneration twice.
- Investor bears losses in proportion to funding percentage; owner bears the rest. Agree explicitly whether helper gets zero on loss.
- Investor principal and credited returns remain invested until withdrawal; **crediting investor profit is not a cash outflow**.
- Owner cash draws (approximately CZK 60,000/month) are **owner withdrawals, not deductible salary** for sole proprietorship.
- Two virtual capital ledgers: owner and investor; distinguish total equity/claim, available cash, inventory cost basis, profits credited, withdrawals, VAT receivables/payables, other reserves.
- Car purchase form shows BOTH owner contribution and investor contribution. Default split proportionate to their available free capital, allow manual override, enforce sum equals funded purchase cash requirement and ensure sufficient available capital. Snapshot funding split on the car.
- At sale, allocate net realized profit according to funding share, investor remuneration, helper compensation, owner remainder; preserve original purchase basis, cash movements and liabilities.
- VAT forecast monthly input VAT/output VAT and actual net settlement, projected refund timing and conservative free cash; **VAT refund is not profit**. Internal attribution to capital providers is only management accounting, never a separate tax entitlement.
- Respect real-world tax obligations, actual VAT filing/settlement and existing app calculations. Never treat bank cash as entirely available to invest.
- Historical completed sales must remain unchanged; active cars retain frozen terms unless explicitly amended with audit trail.
- No sample/demo records inserted into actual company data.

## Example calculations (CZK)
Purchase financed owner 160,000 + investor 240,000 = 400,000 (40/60). Realized distributable profit 50,000; investor 35% × 60% × 50,000 = 10,500; helper 15% × 50,000 = 7,500; owner = 32,000. Loss -20,000: owner -8,000 and investor -12,000; helper 0, subject to written contract.

## Required implementation sequencing
1. Audit existing `index.html` data model, Supabase save/load schema and `assertState` compatibility. Make export backup; do not expose tokens or modify production data.
2. Introduce backwards-compatible optional schema for financing, capital events, settings history; ensure cloud persistence does not silently drop new keys. Add migration with non-destructive defaults for existing cars (unknown split, not fabricated 100% owner).
3. Add settings editor and validation for investor percent (default 35), helper percent (default 15), owner monthly draw, compensation mode, effective dates.
4. Add dual-field financing purchase form and frozen snapshot, ledger entries and sale/loss allocation; integrate actual transaction payment state and avoid double-counting purchase or VAT.
5. Add owner/investor ledger and liquidity report, monthly VAT forecast and 30/60/90-day projection, owner draws.
6. Test cloud and local modes, reload persistence, backup/restore, multi-user concurrency, demo data isolation, precision and rounding, historical immutability, VAT scenarios, losses, mixed financing, withdrawals, no negative available cash.
7. Review change diff, stage via PR, merge to main only after user approves.

## Financial integrity
The app is management reporting, not a substitute for accounting/tax records. Investor contract and tax treatment need professional review. Distinguish realized profit, gross margin, net after direct costs, VAT-inclusive cash and cash on bank. Avoid claiming exact refund amounts before all monthly VAT transactions are reconciled.
