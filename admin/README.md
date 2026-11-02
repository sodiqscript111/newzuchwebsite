# Zuch admin

A small tool for one person to run the shop: see orders and mark them handled,
and manage products and their photos. It has its own dependencies and deploys
separately from the storefront in the repo root.

There is no login yet. Anyone who can open the URL can read orders and change
products, so don't put it on a public URL with real customer orders until a
password is added.

## Run it

Needs Node 22 or newer.

```bash
npm install
npm run seed -- --sample-orders
npm run dev
```

Open http://localhost:5174.

`npm run seed` fills an empty catalog from `../scripts/images/catalog.json`, then
copies each photo into storage. ImgBB is slow and often fails, so this can take
several minutes and may leave some photos on their old links. Run it again to
retry those; it keeps your edits. `--sample-orders` adds four made-up orders,
labelled "Sample", to try the Orders page. To start over, stop the server, delete
the `data` folder and seed again.

## How it fits together

- `shared/api.ts`: the API definition, used by the server and for types in the web app
- `server/`: the [Effect](https://effect.website) API, database and photo storage
- `web/`: the React screens

`npm run build && npm start` serves the API and the screens together on one port
(4320 by default).

| Setting | Without it | With it |
| --- | --- | --- |
| `DATABASE_URL`, `DATABASE_AUTH_TOKEN` | Database file at `data/admin.db` | Hosted libSQL database (Turso) |
| `S3_*` | Photos in `data/uploads` | Photos in S3-compatible storage (Brimble) |

See `.env.example`.

## Deploy

### Preview on Vercel (current setup)

`vercel.json` publishes a look-only site for showing the design: the real screens with
a snapshot of the products and small copies of the photos. It has no server, database or
keys, and nothing can be changed from it.

To refresh the snapshot, run `npm start`, then `npm run preview:export` in a second
terminal. Publish with `npx vercel --prod` from this folder.

### Working version on Vercel

Vercel keeps nothing on disk, so it needs a hosted database and the bucket. In
`vercel.json`, set `buildCommand` to `npm run build:vercel` and remove `outputDirectory`.

1. Create a [Turso](https://turso.tech) database. Put its URL and token in `admin/.env`
   as `DATABASE_URL` and `DATABASE_AUTH_TOKEN`, next to the `S3_*` values.
2. Fill it from your computer with `npm run seed`. This loads the current collections
   only, with the bucket links from `../scripts/images/manifest.json`.
3. From this folder, run `npx vercel` and accept the defaults. `vercel.json` handles
   the build.
4. Add `DATABASE_URL`, `DATABASE_AUTH_TOKEN` and the `S3_*` values under the project's
   Environment Variables, then run `npx vercel --prod`.

`npm run build:vercel` makes the same build locally.

### Other hosts

Anything that runs Docker or Node works too (Railway, Render, Fly.io). Set the root
directory to `admin`; the `Dockerfile` does the rest. Most hosts wipe the disk on every
deploy, so set the same values, or attach a volume and point `DATA_DIR` and
`DATABASE_URL` at it.

## Not connected yet

The storefront still reads Firebase and saves orders there, so changes here don't
reach the live site, and new customer orders don't appear here. That needs the
storefront moved onto this data, plus the new payment provider.
