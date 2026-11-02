// scripts/images/upload-images.mjs
//
// Uploads every image in catalog.json to S3-compatible storage, one folder per product:
//
//   products/<collection-slug>/<product-slug>/01.jpg, 02.jpg, ...
//   site/hero/..., site/video/...
//
// then writes:
//   manifest.json  every product with its public image URLs (seed data for the backend)
//   preview.html   a page showing each product next to its images, to eyeball the mapping
//
// Images already in the bucket are skipped, so it is safe to re-run. Hosted photos the
// admin has already copied are read from admin/data, so ImgBB is only used for the rest.
//
//   npm run images:upload -- --dry-run          check sources + preview, no storage calls
//   npm run images:upload                       upload
//   npm run images:upload -- --only=poise,nude  just these collections
//   npm run images:upload -- --force            re-upload even if the key exists
//
// Needs in .env: S3_ENDPOINT, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_BUCKET,
// S3_PUBLIC_BASE_URL (the public address of a bucket customers can read from).

import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { S3Client, HeadObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const CATALOG_FILE = path.join(HERE, "catalog.json");
const MANIFEST_FILE = path.join(HERE, "manifest.json");
const ADMIN_UPLOADS = path.join(ROOT, "admin/data/uploads");

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];

const DRY_RUN = flag("dry-run");
const FORCE = flag("force");
const ONLY = option("only")?.split(",").filter(Boolean);
const CONCURRENCY = Number(option("concurrency") || 6);
const PREVIEW_FILE = path.join(HERE, DRY_RUN ? "preview.dry-run.html" : "preview.html");

// ImgHippo answers 403 to requests without a browser user agent.
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

const CONTENT_TYPES = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif",
  mp4: "video/mp4",
};

const extensionOf = (p) => {
  const ext = path.extname(new URL(p, "file:///").pathname).slice(1).toLowerCase();
  return ext === "jpeg" ? "jpg" : ext;
};

const pad = (n) => String(n).padStart(2, "0");

function requireEnv() {
  const names = ["S3_ENDPOINT", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "S3_BUCKET", "S3_PUBLIC_BASE_URL"];
  const missing = names.filter((n) => !process.env[n]);
  if (missing.length) {
    console.error(`Missing ${missing.join(", ")}. Add them to .env (see .env.example), or pass --dry-run.`);
    process.exit(1);
  }
  return {
    bucket: process.env.S3_BUCKET,
    publicBaseUrl: process.env.S3_PUBLIC_BASE_URL.replace(/\/+$/, ""),
    client: new S3Client({
      region: process.env.S3_REGION || "auto",
      endpoint: process.env.S3_ENDPOINT,
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
      },
    }),
  };
}

async function readSource({ key, source }) {
  if (source.path) return readFile(path.join(ROOT, source.path));
  const copied = path.join(ADMIN_UPLOADS, key);
  if (existsSync(copied)) return readFile(copied);

  // ImgBB returns occasional 503s under parallel load and can stall for 30 seconds
  // before answering; give each attempt a time limit, back off and retry.
  let lastError;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const res = await fetch(source.url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(45_000) });
      const type = res.headers.get("content-type") || "";
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (!type.startsWith("image/")) throw new Error(`not an image (${type})`);
      return Buffer.from(await res.arrayBuffer());
    } catch (err) {
      lastError = err;
      if (attempt < 5) await new Promise((r) => setTimeout(r, 1000 * 2 ** (attempt - 1)));
    }
  }
  throw lastError;
}

async function existsInBucket(storage, key) {
  try {
    await storage.client.send(new HeadObjectCommand({ Bucket: storage.bucket, Key: key }));
    return true;
  } catch (err) {
    if (err.$metadata?.httpStatusCode === 404 || err.name === "NotFound") return false;
    throw err;
  }
}

async function runPool(items, worker) {
  let next = 0;
  const runners = Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
    while (next < items.length) await worker(items[next++]);
  });
  await Promise.all(runners);
}

// Turns the catalog into a flat list of upload jobs with their storage keys.
function planJobs(catalog) {
  const jobs = [];
  const collections = catalog.collections.filter((c) => !ONLY || ONLY.includes(c.slug) || ONLY.includes(c.legacyId));

  for (const col of collections) {
    for (const product of col.products) {
      product.images.forEach((source, i) => {
        const ext = extensionOf(source.path || source.url);
        jobs.push({ key: `products/${col.slug}/${product.slug}/${pad(i + 1)}.${ext}`, ext, source, product });
      });
    }
  }
  if (!ONLY) {
    for (const asset of catalog.siteAssets) {
      jobs.push({ key: asset.key, ext: extensionOf(asset.path), source: { source: "local", path: asset.path } });
    }
  }
  return { collections, jobs };
}

async function main() {
  const catalog = JSON.parse(await readFile(CATALOG_FILE, "utf8"));
  const storage = DRY_RUN ? null : requireEnv();
  const { collections, jobs } = planJobs(catalog);

  console.log(`${DRY_RUN ? "[dry run] Checking" : "Uploading"} ${jobs.length} files${storage ? ` to bucket "${storage.bucket}"` : ""}...`);

  const results = new Map(); // key -> { status, url, error }
  let done = 0;

  await runPool(jobs, async (job) => {
    const sourceLabel = job.source.path || job.source.url;
    try {
      if (DRY_RUN) {
        await readSource(job);
        // Preview points at the original file so the mapping can be checked before uploading.
        const url = job.source.path ? path.relative(HERE, path.join(ROOT, job.source.path)).split(path.sep).join("/") : job.source.url;
        results.set(job.key, { status: "ok", url });
      } else {
        const url = `${storage.publicBaseUrl}/${job.key}`;
        if (!FORCE && (await existsInBucket(storage, job.key))) {
          results.set(job.key, { status: "skipped", url });
        } else {
          const body = await readSource(job);
          await storage.client.send(
            new PutObjectCommand({
              Bucket: storage.bucket,
              Key: job.key,
              Body: body,
              ContentType: CONTENT_TYPES[job.ext] || "application/octet-stream",
              CacheControl: "public, max-age=31536000, immutable",
            }),
          );
          results.set(job.key, { status: "uploaded", url });
        }
      }
    } catch (err) {
      results.set(job.key, { status: "failed", error: err.message });
      console.error(`  FAILED ${job.key} <- ${sourceLabel}: ${err.message}`);
    }
    done++;
    if (done % 10 === 0 || done === jobs.length) console.log(`  ${done}/${jobs.length}`);
  });

  const manifest = {
    generatedAt: new Date().toISOString(),
    bucket: storage?.bucket ?? null,
    publicBaseUrl: storage?.publicBaseUrl ?? null,
    collections: collections.map((col) => ({
      slug: col.slug,
      name: col.name,
      legacyId: col.legacyId,
      listed: col.listed,
      products: col.products.map((p) => ({
        slug: p.slug,
        legacyId: p.legacyId,
        name: p.name,
        price: p.price,
        ...(p.priceNote ? { priceNote: p.priceNote } : {}),
        description: p.description,
        sizes: p.sizes,
        images: jobs
          .filter((j) => j.product === p)
          .map((j) => ({ key: j.key, url: results.get(j.key).url ?? null, original: j.source.url || j.source.path, status: results.get(j.key).status })),
      })),
    })),
    siteAssets: jobs.filter((j) => !j.product).map((j) => ({ key: j.key, url: results.get(j.key).url ?? null, status: results.get(j.key).status })),
  };

  if (!DRY_RUN) await writeFile(MANIFEST_FILE, JSON.stringify(manifest, null, 2) + "\n");
  await writeFile(PREVIEW_FILE, renderPreview(manifest));

  const count = (s) => [...results.values()].filter((r) => r.status === s).length;
  console.log(
    DRY_RUN
      ? `\n${count("ok")} ok, ${count("failed")} failed.`
      : `\n${count("uploaded")} uploaded, ${count("skipped")} already in bucket, ${count("failed")} failed.`,
  );
  if (!DRY_RUN) console.log(`Manifest: ${path.relative(ROOT, MANIFEST_FILE)}`);
  console.log(`Preview:  ${path.relative(ROOT, PREVIEW_FILE)}`);
  if (count("failed")) process.exit(1);
}

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const formatPrice = (p) => (p.price != null ? `₦${p.price.toLocaleString("en-NG")}` : p.priceNote || "No price");

function renderPreview(manifest) {
  const products = manifest.collections.flatMap((c) => c.products);
  const images = products.flatMap((p) => p.images);
  const failed = [...images, ...manifest.siteAssets].filter((i) => i.status === "failed");

  const imageTile = (img) =>
    img.url
      ? `<a class="tile" href="${esc(img.url)}" target="_blank" title="${esc(img.key)}&#10;from ${esc(img.original)}">
           <img src="${esc(img.url)}" alt="" loading="lazy" onerror="this.parentNode.classList.add('broken')">
           <span>${esc(img.key.split("/").pop())}</span>
         </a>`
      : `<div class="tile broken" title="${esc(img.key)}"><span>${esc(img.key.split("/").pop())} failed</span></div>`;

  const productCard = (p) => `
    <article class="product">
      <div class="tiles">${p.images.map(imageTile).join("") || '<div class="tile broken"><span>no images</span></div>'}</div>
      <h3>${esc(p.name)}</h3>
      <p class="price${p.price == null || p.priceNote ? " warn" : ""}">${esc(formatPrice(p))}${p.priceNote && p.price != null ? " · placeholder" : ""}</p>
      <p class="meta">${esc(p.slug)} · ${p.images.length} image${p.images.length === 1 ? "" : "s"}${p.legacyId !== p.slug ? ` · was <code>${esc(p.legacyId)}</code>` : ""}</p>
    </article>`;

  const collectionSection = (c) => `
    <section>
      <header>
        <h2>${esc(c.name)}</h2>
        <span class="badge ${c.listed ? "on" : "off"}">${c.listed ? "On the site" : "Hidden"}</span>
        <span class="meta">products/${esc(c.slug)}/ · ${c.products.length} products</span>
      </header>
      <div class="grid">${c.products.map(productCard).join("")}</div>
    </section>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Zuch Image Map</title>
<style>
  :root { --bg:#fafaf9; --card:#fff; --text:#1c1917; --muted:#78716c; --line:#e7e5e4; --ok:#15803d; --okbg:#dcfce7; --bad:#b91c1c; --badbg:#fee2e2; --warn:#a16207; }
  @media (prefers-color-scheme: dark) { :root { --bg:#0c0a09; --card:#1c1917; --text:#f5f5f4; --muted:#a8a29e; --line:#292524; --ok:#4ade80; --okbg:#14532d; --bad:#f87171; --badbg:#450a0a; --warn:#facc15; } }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--text); font:14px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; }
  main { max-width:1200px; margin:0 auto; padding:24px 16px 64px; }
  h1 { font-size:22px; margin:0 0 4px; }
  .summary { color:var(--muted); margin:0 0 8px; }
  .failures { background:var(--badbg); color:var(--bad); padding:10px 12px; border-radius:8px; margin:12px 0; }
  section { margin-top:32px; }
  section > header { display:flex; flex-wrap:wrap; align-items:baseline; gap:8px 12px; border-bottom:1px solid var(--line); padding-bottom:8px; margin-bottom:12px; }
  h2 { font-size:18px; margin:0; }
  .badge { font-size:12px; padding:2px 8px; border-radius:999px; }
  .badge.on { background:var(--okbg); color:var(--ok); }
  .badge.off { background:var(--line); color:var(--muted); }
  .meta { color:var(--muted); font-size:12px; overflow-wrap:anywhere; }
  .grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(260px, 1fr)); gap:12px; }
  .product { background:var(--card); border:1px solid var(--line); border-radius:10px; padding:10px; }
  .product h3 { font-size:15px; margin:8px 0 2px; }
  .product p { margin:0; }
  .price.warn { color:var(--warn); }
  .tiles { display:grid; grid-template-columns:repeat(auto-fill, minmax(72px, 1fr)); gap:6px; }
  .tile { position:relative; display:block; aspect-ratio:3/4; border-radius:6px; overflow:hidden; background:var(--line); color:inherit; text-decoration:none; }
  .tile img { width:100%; height:100%; object-fit:cover; display:block; }
  .tile span { position:absolute; left:0; right:0; bottom:0; font-size:10px; padding:2px 4px; background:rgba(0,0,0,.55); color:#fff; }
  .tile.broken { background:var(--badbg); outline:2px solid var(--bad); }
  .tile.broken img { visibility:hidden; }
  code { font-size:11px; }
</style>
</head>
<body>
<main>
  <h1>Zuch product images${manifest.bucket ? ` in storage (${esc(manifest.bucket)})` : " (dry run, original sources)"}</h1>
  <p class="summary">${manifest.collections.length} collections · ${products.length} products · ${images.length} product images · ${manifest.siteAssets.length} site assets · ${esc(manifest.generatedAt)}</p>
  ${failed.length ? `<div class="failures"><strong>${failed.length} failed:</strong> ${failed.map((f) => esc(f.key)).join(", ")}</div>` : ""}
  ${manifest.collections.map(collectionSection).join("")}
  ${
    manifest.siteAssets.length
      ? `<section><header><h2>Site assets</h2><span class="meta">site/</span></header>
         <div class="grid"><article class="product"><div class="tiles">${manifest.siteAssets
           .map((a) => (a.key.endsWith(".mp4") ? `<a class="tile" href="${esc(a.url)}" target="_blank"><span>${esc(a.key.split("/").pop())}</span></a>` : imageTile({ ...a, original: a.key })))
           .join("")}</div></article></div></section>`
      : ""
  }
</main>
</body>
</html>
`;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
