# Zuch backend

One Cloudflare Worker runs the whole shop:

- `/`: the shop (the React app in the repo root)
- `/admin`: the admin (the React app in `../admin`)
- `/api/*`: the API, built with [Hono](https://hono.dev) and [Zod](https://zod.dev)
- `/media/*`: product photos from R2

Data lives in **D1** (SQLite) and photos in **R2**. Payments go through
[Paystack](https://paystack.com/docs) checkout.

## Run it on your computer

```bash
npm install
cp .dev.vars.example .dev.vars      # then set ADMIN_PASSWORD
npm run seed:local                  # loads the 25 current products and their photos
npm run build:sites                 # builds the shop and admin into public/
npm run dev                         # http://localhost:8787 (admin at /admin)
```

Without `PAYSTACK_SECRET_KEY` in `.dev.vars`, checkout uses a **pretend checkout** at
`/api/dev/checkout/...` where you can make a payment succeed or fail. It only exists when
`ENVIRONMENT=development`. With a Paystack test key (`sk_test_...`), real test payments work
locally too.

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
2. The Worker saves the order as `awaiting_payment` and starts a Paystack transaction for the
   total in kobo, using the order number as the reference. The customer pays on Paystack.
3. Paystack sends the customer back to their private order page,
   `/orders/<number>/<secret>`. Opening it asks Paystack to verify the payment, and the page
   updates by itself.
4. Paystack also calls `POST /api/webhooks/paystack` with `charge.success`. The Worker checks
   the signature.

An order only becomes `paid` when Paystack confirms it, through the webhook or the verify
call, for the full amount in naira. Nothing the browser sends can mark it paid.
5. The owner moves paid orders to `in_progress` and `completed` in the admin.

Customers find orders through the link from step 3, with their order number and email at
`/track`, or under **My Account** if they were signed in when they ordered.

| Status | Meaning |
| --- | --- |
| `awaiting_payment` | Order placed, payment not confirmed yet |
| `paid` | Paystack confirmed payment ("Not started" in the admin) |
| `in_progress` | Being made |
| `completed` | Done |
| `cancelled` | Cancelled by the owner |
| `payment_failed` | Paystack reported the payment failed |

Orders a customer abandons stay `awaiting_payment` and appear under "Unpaid" in the admin.

## Put it on Cloudflare

You need a Cloudflare account and a Paystack account.

1. `npx wrangler login`
2. Create the database and copy its ID into `database_id` in `wrangler.jsonc`:
   `npx wrangler d1 create zuch`
3. Create the photo bucket: `npx wrangler r2 bucket create zuch-media`
4. Load everything: `npm run seed:remote`
5. Set the secrets (each command asks for the value):
   ```bash
   npx wrangler secret put ADMIN_PASSWORD
   npx wrangler secret put PAYSTACK_SECRET_KEY
   npx wrangler secret put PAYSTACK_WEBHOOK_SECRET
   ```
6. `npm run deploy`. Wrangler prints the address, like `https://zuch.<you>.workers.dev`.
   Set `PUBLIC_URL` to it in `wrangler.jsonc` (or your own domain later) and deploy again.
7. In the Paystack dashboard, set the webhook URL to
   `<PUBLIC_URL>/api/webhooks/paystack`. If Paystack gives you a webhook signing secret
   (`whsec_...`, under **Developers > API configuration**), store it as
   `PAYSTACK_WEBHOOK_SECRET`. Without one, webhooks are checked with your secret key instead.

Start with your **test** secret key (`sk_test_...`). Paystack's test card
`4084 0840 8408 4081` (any future expiry, CVV `408`) succeeds, and `4084 0800 0000 5408`
(CVV `001`) is declined. To go live, put your `sk_live_...` key in `PAYSTACK_SECRET_KEY` and set
the live webhook URL in Paystack.

## Settings

| Name | Where | What |
| --- | --- | --- |
| `ENVIRONMENT` | `vars` | `production`, or `development` in `.dev.vars` |
| `PUBLIC_URL` | `vars` | The shop's public address, used for Paystack return links |
| `BAYSE_URL` | `vars` | Used by `/api/health/bayse` |
| `ADMIN_PASSWORD` | secret | Password for `/admin` |
| `PAYSTACK_SECRET_KEY` | secret | Paystack secret key (`sk_test_...` or `sk_live_...`) |
| `PAYSTACK_WEBHOOK_SECRET` | secret | Paystack webhook signing secret (`whsec_...`), optional |

## Code

- `src/index.ts`: routes and request checks
- `src/routes/`: shop, checkout and orders, account, admin, webhooks, media, dev
- `src/db/`: D1 queries for the catalog, orders and customers
- `src/paystack.ts`: starting and verifying Paystack payments, and webhook signatures
- `src/payments.ts`: asks Paystack about an unpaid order when the customer opens it
- `src/lib/`: passwords (PBKDF2), sessions (cookies with hashed tokens), IDs
- `model/`: Zod schemas for products, orders and accounts
- `migrations/`: the database tables
- `test/`: tests for checkout, webhooks, accounts, admin and request checks
