# Roadmap

Batzen stays a tool for the big picture: no transactions, no bank connections, no price feeds. New features follow the same idea as the budget: a few numbers, updated during the check-in.

## Phase 0: Foundations

- [x] Nightly database backups, keep 30 days, stored on a second device (NAS or Proxmox Backup)
- [x] Restore from the JSON export under Settings
- [x] Unit tests for `src/lib/domain.ts`
- [x] Private GitHub repository

## Phase 1: Assets

Track where money is invested and how much, as balances instead of transactions.

- [x] Assets with name, type, provider ("where") and an optional note on the holdings (e.g. "Global ETF, Gold ETF")
- [x] Types: account / savings account, pillar 3a, pension fund (2nd pillar), securities account, crypto, other
- [x] Balance timeline in CHF per asset and month, like `item_versions` (unique per asset + month)
- [x] Pillar 3a and pension fund count as tied up; the overview shows total assets and how much is freely available
- [x] Split by type and by provider
- [x] Emergency fund in months: freely available cash divided by monthly spending
- [x] Check-in step "Vermögen": confirm or update every balance; balances become part of the `Snapshot`
- [x] History: total assets per year end (31 Dec, also useful for the tax return)

Not planned for now: debts / net worth (mortgage, leasing, loans), foreign currencies (enter the CHF value shown by the broker), allocation within a securities account beyond the note field.

## Phase 2: Connect assets and budget

Saving items are planned as averages, but real payments are lumpy (e.g. pillar 3a paid once a year or in 2-3 instalments). So the budget only suggests the contributions; the check-in confirms what was actually paid.

- [x] Link a saving item (e.g. "3. Säule a") to an asset (optional; one item feeds at most one asset, an asset can be fed by several items)
- [x] Check-in step "Vermögen": for each linked asset, ask for the contributions since the last check-in, prefilled with the budget estimate and editable
- [x] Rough market performance per asset: change in balance minus the confirmed contributions since the last check-in, shown in the check-in summary, the overview of a check-in and on the assets page
- [x] Store the confirmed contributions in the check-in `Snapshot` (optional field, older snapshots have none)

## Phase 3: Due dates and reserves

Due months are optional. Without one an item still counts towards the monthly reserve, it is only missing from the calendar and the target balance.

- [x] Due month for quarterly, semiannual and yearly items (taxes, health insurance, Serafe, Halbtax, car insurance), stored per version like the interval
- [x] Year calendar in the overview: which bills are due in which month, against the steady amount set aside
- [x] Monthly amount to set aside so that no bill comes as a surprise; every item can be left out of it (e.g. a pillar 3a paid from the bonus)
- [x] Target balance: what should be set aside by the end of the current month for the bills still to come

## Phase 4: Planning (only if needed)

- [x] Scenarios ("what if"): apply changes such as 80 % workload or a move to a copy of the budget and compare with the actual budget
- [x] Savings goals with target amount and date, checked against the current saving rate

## Smaller improvements

- [x] Check-in reminder in the overview ("last check-in 5 months ago"), in-app only
- [x] Saving rate split into "saved on purpose" (saving items) and "left over"
- [x] Printable year review (income, spending, saving rate, assets, biggest changes)
- [x] Flow diagram (Sankey) in the overview: income on the left, split into categories, saving and "left over"
- [x] Privacy mode: one toggle that hides all amounts, e.g. when someone looks at the phone

## Next improvements

Ordered by value. All of them stay within the big-picture idea: no transactions, no projections.

- [ ] Plausibility check, budget against reality: in the check-in, compare how much the accounts actually grew since the previous check-in with how much they should have grown according to the budget (what is left over plus saving items without an asset). A large gap hints at variable costs that are estimated too low. One-off amounts (bonus, tax refund) need a way to be excluded or a clear note, because they distort the comparison
- [ ] Pillar 3a limit: show the contributions confirmed in the current calendar year against the yearly maximum (e.g. "4'200 of 7'258 paid in") in the check-in and on the assets page, so there is still time to pay in before year end. The limit is a constant that has to be updated yearly
- [ ] Stale estimates: in the check-in, mark items whose version has not changed for more than 12 months, especially variable costs and insurance premiums
- [ ] CSV export for spreadsheets or the tax advisor (year-end balances, costs per category), next to the JSON export
- [ ] Asset development chart: total, freely available and tied up across all check-ins, as a line chart on the assets page (check first whether something like it already exists)

## Ideas (nice to have, not planned)

- [ ] Withdrawals: allow negative contributions in the check-in (e.g. selling part of a securities account, an early pillar 3a withdrawal for a home), so money taken out is not counted as a market loss
- [ ] Dynamic tracking of investments: store the units per position (e.g. 12.5 units of a Global ETF, 0.04 BTC) instead of a CHF balance and update the value from a price source. The check-in then only asks whether the units changed, which means less input. Opt-in per asset; only the ticker leaves the server, never units or amounts. This is the one deliberate exception to "no price feeds" above, so it needs a privacy-friendly source and must keep working (last known price) when the source is down.
