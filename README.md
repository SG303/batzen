<img src="assets/icon.svg" width="64" height="64" alt="">

# Batzen

A personal, self-hosted budget app for the big picture. Instead of logging every transaction, you record recurring costs (rent, insurance, subscriptions, taxes), rough estimates for variable costs (groceries, train tickets) and your income. A short check-in a few times a year keeps the numbers current.

- **Overview**: how your income splits into categories and what is left, per month or per year, as a band, a flow diagram (income → spending, saving, left over → categories and saving items) or a list. The saving rate is split into what you save on purpose (saving items) and what is simply left over
- **Items**: every cost and income keeps a history ("from March 2025: 2'560.–"), so changes and past years stay comparable
- **Shared costs**: record the total and your own share (e.g. rent split with a partner)
- **Income**: salary incl. 13th month; bonus and expenses (Spesen) are tracked separately and not counted in the budget
- **Assets**: accounts, pillar 3a, pension fund, securities and crypto as balances (no transactions). Shows total, freely available and tied-up money, a split by type and provider, the emergency fund in months of spending, and the total at every year end (for the tax return)
- **Contributions and market**: link a saving item (e.g. pillar 3a) to the asset it feeds. The check-in asks how much you actually paid in since the last check-in (prefilled with the budget estimate) and splits the balance change into your contributions and the market
- **Bills over the year**: give quarterly, semiannual and yearly items an optional due month. The overview shows which bills fall due in which month, how much to set aside every month so none comes as a surprise, and how much should be set aside by now. Each item can be left out of the reserve
- **Planning**: savings goals with a target amount and date, measured on an asset's balance or an amount entered by hand, and checked against what you save each month. "What if" scenarios apply changes such as a smaller workload or a move to a copy of today's budget and compare both side by side; the budget itself stays untouched
- **History**: year-over-year chart, lifestyle check (does spending grow faster than income?), table per year, and a printable year review (income, spending, saving rate, assets, biggest changes, check-in notes) to print or save as PDF
- **Check-in**: a reminder in the overview and a dot in the navigation once the last check-in is five months old. Walk through all items and asset balances, confirm or change them, and confirm the contributions to linked assets; pick a past month to backfill earlier years
- **Backups**: a copy of the database every night, the last 30 are kept; JSON export and restore under Settings
- **Login**: on first start you create an account; further accounts can be added under Settings. All accounts share the same budget. Sessions last 30 days and extend while you use the app
- **Privacy mode**: one tap on the eye in the header hides every amount, e.g. when someone looks at your phone. Kept per device
- Light and dark mode, optimized for phones, installable as a home screen app

## Stack

SvelteKit 3 (Svelte 5, TypeScript), Tailwind CSS 4, SQLite via better-sqlite3 and Drizzle ORM, adapter-node. Charts are plain SVG.

## Development

```sh
npm install
npm run dev          # http://localhost:5173
npm run check        # type check
npm test             # unit tests (Vitest)
```

The database lives in `data/batzen.db` (override with `DATABASE_PATH`). Migrations in `drizzle/` run automatically on startup. Sample data can be loaded under Settings.

After changing `src/lib/server/db/schema.ts`:

```sh
npx drizzle-kit generate --name <change>
```

## Deployment

Every change to `main` is tested and published as a Docker image to `ghcr.io/sg303/batzen` (tags `latest` and `sha-<commit>`). Copy [`compose.yaml`](compose.yaml) to the server and run:

```sh
docker compose pull && docker compose up -d   # serves on port 3000, data in the volume "batzen-data"
```

To update, run the same command again (or let a tool such as a nightly cron job do it). To go back to an earlier version, put e.g. `BATZEN_TAG=sha-1a2b3c4` into a file `.env` next to `compose.yaml` and run `docker compose up -d`; remove the line to follow `latest` again. Before an update changes the database, the app writes a copy to `/backups/batzen-before-update-<date>T<time>.db` and keeps the newest 5 (see [Restore](#restore)).

To build the image from a checkout instead: `docker compose -f compose.yaml -f compose.build.yaml up -d --build`.

On first start the app asks you to create an account. The login keeps other people in your network out; it is not meant for the open internet. Run the app only inside a private network (e.g. Tailscale).

Forgot your password? This sets a new random one and prints it:

```sh
docker compose exec batzen node scripts/reset-password.js <username>
# without Docker: node scripts/reset-password.js <username>
```

## Automation

- **CI** (`.github/workflows/ci.yml`): every push and pull request runs the type check and the tests, builds the image and starts it once (it must turn healthy and serve the setup page). On `main` the image is published. A weekly rebuild on Monday night picks up security fixes in the Node base image.
- **Dependabot** (`.github/dependabot.yml`): checks npm packages, the base image and the GitHub Actions every Sunday evening. Minor and patch updates are merged automatically once CI passes, which publishes a new image. Major updates stay open as pull requests and need a manual look.

## Backups

Every night after 03:00 (Swiss time) the app writes a consistent copy of the database to `/backups/batzen-YYYY-MM-DD.db` and keeps the newest 30. Under Settings > Daten you see when the last backup ran, whether it failed, and can start one by hand ("Jetzt sichern"). A backup contains everything, including accounts and passwords.

Without further setup the backups go to the Docker volume `batzen-backups` on the same machine. To keep them on a second device, pick one of these:

- **NAS**: mount a NAS share on the server (e.g. at `/mnt/nas/batzen`), make it writable for user ID 1000 (`sudo chown 1000:1000 /mnt/nas/batzen`, or `uid=1000` in the mount options), then put `BACKUP_PATH=/mnt/nas/batzen` into a file `.env` next to `compose.yaml` and run `docker compose up -d`.
- **Proxmox Backup Server**: keep the default volume and back up the whole VM with PBS. The nightly files are complete copies, so they are safe to restore even if the live database was being written during the VM backup.

Settings (environment variables, already set in the Docker image): `BACKUP_DIR` (folder inside the container, backups are off without it), `BACKUP_HOUR` (default 3), `BACKUP_KEEP` (default 30), `TZ` (default `Europe/Zurich`).

### Restore

**From a JSON export** (budget data only, accounts stay as they are): Settings > Daten > "Exportdatei wählen" > "Wiederherstellen".

**From a nightly backup** (everything, including accounts):

```sh
docker compose exec batzen ls /backups          # pick a file
docker compose stop batzen
docker compose run --rm --no-deps batzen sh -c 'cp /backups/batzen-2026-10-27.db /data/batzen.db && rm -f /data/batzen.db-wal /data/batzen.db-shm'
docker compose start batzen
```

**After an update that went wrong**: pin the previous image first (`BATZEN_TAG=sha-…` in `.env`, see [Deployment](#deployment)), otherwise the new version migrates the database again on start. Then restore the copy from before the update with the commands above, using `batzen-before-update-….db` instead of the nightly file.
