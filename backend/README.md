# Zuch backend

One Cloudflare Worker runs the whole shop:

- `/`: the shop (the React app in the repo root)
- `/admin`: the admin (the React app in `../admin`)
- `/api/*`: the API, built with [Hono](https://hono.dev) and [Zod](https://zod.dev)
- `/media/*`: product photos from R2

Data lives in **D1** (SQLite) and photos in **R2**. Payments go through
[Bachs](https://docs.bachs.io) hosted checkout.

## Run it on your computer

```bash
npm install
cp .dev.vars.example .dev.vars      # then set ADMIN_PASSWORD
npm run seed:local                  # loads the 25 current products and their photos
npm run build:sites                 # builds the shop and admin into public/
npm run dev                         # http://localhost:8787 (admin at /admin)
```

Without Bachs keys in `.dev.vars`, checkout uses a **pretend checkout** at
`/api/dev/checkout/...` where you can make a payment succeed or fail. It only exists when
`ENVIRONMENT=development`.

While working on the shop or admin screens, run `npm run dev` here and `npm run dev` in
the repo root (shop, port 5173) or in `../admin` (port 5174) for live reloading. Both
send `/api` and `/media` to this Worker.

## Commands

| Command | Does |
| --- | --- |
| `npm run dev` | Runs the Worker locally on port 8787 |
| `npm test` | Tests in the Workers runtime with a local D1 and R2 |
| `npm run typecheck` | TypeScript |
| `npm run build:sites` | Builds the shop and admin into `public/` |
| `npm run seed:local` / `seed:remote` | Loads products and photos into D1 and R2 |
| `npm run db:migrate:local` / `db:migrate:remote` | Applies database migrations |
| `npm run types` | Regenerates `worker-configuration.d.ts` after changing `wrangler.jsonc` |
| `npm run deploy` | Builds the sites and publishes the Worker |

## How buying works

1. The cart lives in the browser. At checkout it sends product IDs, quantities, sizes or
   measurements, and delivery details. **Prices come from the database**, never the browser.
2. The Worker saves the order as `awaiting_payment`, creates a Bachs checkout session for
   the total, and sends the customer to Bachs.
3. Bachs sends the customer back to their private order page,
   `/orders/<number>/<secret>`, which updates by itself.
4. Bachs calls `POST /api/webhooks/bachs`. The Worker checks the signature and that the
   amount covers the order, then marks it `paid`. **Only this webhook marks orders paid.**
5. The owner moves paid orders to `in_progress` and `completed` in the admin.

Customers find orders through the link from step 3, with their order number and email at
`/track`, or under **My Account** if they were signed in when they ordered.

| Status | Meaning |
| --- | --- |
| `awaiting_payment` | Order placed, payment not confirmed yet |
| `paid` | Bachs confirmed payment ("Not started" in the admin) |
| `in_progress` | Being made |
| `completed` | Done |
| `cancelled` | Cancelled by the owner |
| `payment_failed`, `expired` | Payment failed, or the 60-minute payment window closed |

## Put it on Cloudflare

You need a Cloudflare account and a Bachs account.

1. `npx wrangler login`
2. Create the database and copy its ID into `database_id` in `wrangler.jsonc`:
   `npx wrangler d1 create zuch`
3. Create the photo bucket: `npx wrangler r2 bucket create zuch-media`
4. Load everything: `npm run seed:remote`
5. Set the secrets (each command asks for the value):
   ```bash
   npx wrangler secret put ADMIN_PASSWORD
   npx wrangler secret put BACHS_SECRET_KEY
   npx wrangler secret put BACHS_WEBHOOK_SECRET
   ```
6. `npm run deploy`. Wrangler prints the address, like `https://zuch.<you>.workers.dev`.
   Set `PUBLIC_URL` to it in `wrangler.jsonc` (or your own domain later) and deploy again.
7. In the Bachs Developer Portal, add a webhook endpoint at
   `<PUBLIC_URL>/api/webhooks/bachs` for `collection.succeeded`, `checkout.completed`,
   `collection.failed` and `checkout.expired`. Its signing secret is `BACHS_WEBHOOK_SECRET`.

Start with a **sandbox** key (`sk_sandbox_...`) and `BACHS_API_URL` set to
`https://sandbox-api.bachs.io`. Any card number works there except `4000000000000002`
(declined). To go live, put a `sk_live_...` key in `BACHS_SECRET_KEY` and change
`BACHS_API_URL` to `https://api.bachs.io`.

Bachs refuses `localhost` return addresses, so real Bachs payments only work once the
Worker has a public address.

## Settings

| Name | Where | What |
| --- | --- | --- |
| `ENVIRONMENT` | `vars` | `production`, or `development` in `.dev.vars` |
| `PUBLIC_URL` | `vars` | The shop's public address, used for Bachs return links |
| `BACHS_API_URL` | `vars` | Bachs sandbox or live API |
| `BAYSE_URL` | `vars` | Used by `/api/health/bayse` |
| `ADMIN_PASSWORD` | secret | Password for `/admin` |
| `BACHS_SECRET_KEY` | secret | Bachs API key |
| `BACHS_WEBHOOK_SECRET` | secret | Signing secret of the Bachs webhook endpoint |

## Code

- `src/index.ts`: routes and request checks
- `src/routes/`: shop, checkout and orders, account, admin, webhooks, media, dev
- `src/db/`: D1 queries for the catalog, orders and customers
- `src/bachs.ts`: Bachs checkout sessions and webhook signatures
- `src/lib/`: passwords (PBKDF2), sessions (cookies with hashed tokens), IDs
- `model/`: Zod schemas for products, orders and accounts
- `migrations/`: the database tables
- `test/`: tests for checkout, webhooks, accounts, admin and request checks
