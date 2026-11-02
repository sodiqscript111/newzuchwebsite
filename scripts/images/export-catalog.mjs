// scripts/images/export-catalog.mjs
//
// Snapshots every product and image the site knows about into catalog.json:
//   - products stored in Firestore (images hosted on ImgBB / ImgHippo)
//   - products hardcoded in src/context/productContext.jsx (images in public/images)
//   - site assets (hero pictures, background video)
//
// catalog.json is what upload-images.mjs reads. Run this while Firestore is still
// up; once Firebase is gone, catalog.json is the source of truth.
//
//   npm run images:catalog

import { writeFile, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUT_FILE = path.join(ROOT, "scripts/images/catalog.json");

// Public web config from src/utils/firebase.js; Firestore reads are open.
const FIREBASE_PROJECT = "zuch-72a11";
const FIREBASE_API_KEY = "AIzaSyC_SEOAL5JNJtJP4C6M3SvyD2lgBq70TxQ";
const FIRESTORE = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT}/databases/(default)/documents`;

// Firestore collection id -> clean slug and display name.
const COLLECTIONS = {
  poisecollection: { slug: "poise", name: "Poise" },
  customnative: { slug: "custom-native", name: "Custom Native" },
  nudecolection: { slug: "nude", name: "Nude" },
  beachtimecollection: { slug: "beach-time", name: "Beach Time" },
  joggerset: { slug: "jogger-set", name: "Jogger Set" },
  alpha: { slug: "alpha", name: "Alpha" },
  voguejalabiya: { slug: "vogue-jalabiya", name: "Vogue Jalabiya" },
  amorcollection: { slug: "amor", name: "Amor" },
  lumincolection: { slug: "lumin", name: "Lumin" },
  zuchclassics: { slug: "zuch-classics", name: "Zuch Classics" },
  streetvouge: { slug: "street-vouge", name: "Street Vouge" },
  ray: { slug: "ray", name: "Ray" },
  nobles: { slug: "neutral-nobles", name: "Neutral Nobles" },
  majesticpearl: { slug: "majestic-pearl", name: "Majestic Pearl" },
  highrave: { slug: "high-rave", name: "High Rave" },
  CityAce: { slug: "city-ace", name: "City Ace" },
  YEffect: { slug: "y-effect", name: "The Y Effect" },
};

// Collections the live site still links to (Shopall categories + StoreNavigation).
const LISTED = new Set([
  "poisecollection",
  "customnative",
  "nudecolection",
  "beachtimecollection",
  "joggerset",
  "alpha",
  "voguejalabiya",
]);

// Mirrors the products injected by hand in src/context/productContext.jsx.
const HARDCODED_PRODUCTS = [
  {
    collection: "customnative",
    id: "ycutkaftan",
    name: "Y-Cut Kaftan",
    price: 80000,
    images: ["1.jpeg", "2.jpeg", "3.jpeg", "4.jpeg", "5.jpeg"].map((f) => `public/images/y-cut-kaftan/${f}`),
  },
  ...[
    ["jogger-ash", "Ash", "ash.png"],
    ["jogger-brown", "Brown", "brown.png"],
    ["jogger-navy", "Navy Blue", "navyblue.png"],
    ["jogger-beige", "Beige", "beige.png"],
    ["jogger-black", "Black", "black.png"],
    ["jogger-green", "Green", "green.png"],
  ].map(([id, name, file]) => ({
    collection: "joggerset",
    id,
    name,
    price: 45000,
    pricePlaceholder: true,
    images: [`public/images/joggerset/${file}`],
  })),
  ...[
    ["alpha-01", "Alpha 01", "alpha01.jpeg"],
    ["alpha-02", "Alpha 02", "alpha02.jpeg"],
    ["alpha-03", "Alpha 03", "alpha03.jpeg"],
  ].map(([id, name, file]) => ({
    collection: "alpha",
    id,
    name,
    price: 45000,
    pricePlaceholder: true,
    images: [`public/images/alpha/${file}`],
  })),
  ...["01", "02", "03"].map((n) => ({
    collection: "voguejalabiya",
    id: `vogue-${n}`,
    name: `Vogue Jalabiya ${n}`,
    price: 55000,
    pricePlaceholder: true,
    images: [`public/images/voguejalabiya/${n}_1.jpeg`, `public/images/voguejalabiya/${n}_2.jpeg`],
  })),
];

const SITE_ASSETS = [
  { key: "site/hero/headerpicone.jpg", path: "src/assets/headerpicone.jpg" },
  { key: "site/hero/headerpictwo.jpg", path: "src/assets/headerpictwo.jpg" },
  { key: "site/hero/headerpicthree.jpg", path: "src/assets/headerpicthree.jpg" },
  { key: "site/hero/headerpicfour.jpg", path: "src/assets/headerpicfour.jpg" },
  { key: "site/video/zuchwebsitevideo.mp4", path: "public/zuchwebsitevideo.mp4" },
];

const slugify = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

// Firestore REST values -> plain JS.
const plain = (v) => {
  if (!v) return undefined;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(plain);
  return undefined;
};

// imageUrl is stored as an array, a single URL, or a comma-separated string.
const toUrlList = (value) => {
  const list = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  return list.map((u) => String(u).trim()).filter(Boolean);
};

const toPrice = (value) => {
  if (typeof value === "number") return { price: value };
  const n = Number(String(value ?? "").replace(/[^\d.]/g, ""));
  if (value != null && String(value).trim() && Number.isFinite(n) && n > 0) return { price: n };
  return { price: null, ...(value ? { priceNote: String(value).trim() } : {}) };
};

const getJson = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.json();
};

async function listDocuments(collectionPath) {
  const docs = [];
  let pageToken = "";
  do {
    const qs = new URLSearchParams({ key: FIREBASE_API_KEY, pageSize: "300" });
    if (pageToken) qs.set("pageToken", pageToken);
    const page = await getJson(`${FIRESTORE}/${collectionPath}?${qs}`);
    docs.push(...(page.documents || []));
    pageToken = page.nextPageToken || "";
  } while (pageToken);
  return docs;
}

async function main() {
  const byCollection = new Map();
  const ensureCollection = (id) => {
    if (!byCollection.has(id)) {
      const meta = COLLECTIONS[id] || { slug: slugify(id), name: id };
      byCollection.set(id, { ...meta, legacyId: id, listed: LISTED.has(id), products: [] });
    }
    return byCollection.get(id);
  };

  const collectionDocs = await listDocuments("collections");
  for (const doc of collectionDocs) {
    const collectionId = doc.name.split("/").pop();
    const col = ensureCollection(collectionId);

    for (const p of await listDocuments(`collections/${collectionId}/products`)) {
      const f = Object.fromEntries(Object.entries(p.fields || {}).map(([k, v]) => [k, plain(v)]));
      const legacyId = p.name.split("/").pop();
      col.products.push({
        legacyId,
        name: (f.name || legacyId).trim(),
        ...toPrice(f.price),
        description: (f.description || "").trim(),
        sizes: f.standardSizes || f.standardSize || [],
        images: toUrlList(f.imageUrl).map((url) => ({ source: "remote", url })),
      });
    }
  }

  for (const p of HARDCODED_PRODUCTS) {
    for (const img of p.images) await access(path.join(ROOT, img));
    ensureCollection(p.collection).products.push({
      legacyId: p.id,
      name: p.name,
      price: p.price,
      ...(p.pricePlaceholder ? { priceNote: "placeholder price from productContext.jsx" } : {}),
      description: "",
      sizes: [],
      images: p.images.map((file) => ({ source: "local", path: file })),
    });
  }

  // Product slugs come from names, kept unique inside each collection.
  const collections = [...byCollection.values()].sort((a, b) => Number(b.listed) - Number(a.listed) || a.name.localeCompare(b.name));
  for (const col of collections) {
    const seen = new Map();
    for (const product of col.products) {
      let slug = slugify(product.name) || slugify(product.legacyId);
      const count = (seen.get(slug) || 0) + 1;
      seen.set(slug, count);
      if (count > 1) slug = `${slug}-${count}`;
      product.slug = slug;
    }
    col.products = col.products.map(({ slug, ...rest }) => ({ slug, ...rest }));
  }

  for (const asset of SITE_ASSETS) await access(path.join(ROOT, asset.path));

  const catalog = {
    generatedAt: new Date().toISOString(),
    sources: [`firestore:${FIREBASE_PROJECT}`, "src/context/productContext.jsx"],
    collections,
    siteAssets: SITE_ASSETS,
  };
  await writeFile(OUT_FILE, JSON.stringify(catalog, null, 2) + "\n");

  const products = collections.flatMap((c) => c.products);
  const images = products.reduce((n, p) => n + p.images.length, 0);
  console.log(`Wrote ${path.relative(ROOT, OUT_FILE)}`);
  console.log(`  ${collections.length} collections (${collections.filter((c) => c.listed).length} listed on the site)`);
  console.log(`  ${products.length} products, ${images} product images, ${SITE_ASSETS.length} site assets`);
  const noImages = products.filter((p) => p.images.length === 0);
  if (noImages.length) console.warn(`  Products with no images: ${noImages.map((p) => p.legacyId).join(", ")}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
