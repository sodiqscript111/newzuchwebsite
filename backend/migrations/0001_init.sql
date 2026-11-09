CREATE TABLE collections (
  slug TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE products (
  id TEXT PRIMARY KEY,
  collection_slug TEXT NOT NULL REFERENCES collections(slug),
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  price INTEGER,
  price_note TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  sizes TEXT NOT NULL DEFAULT '[]',
  visible INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  UNIQUE (collection_slug, slug)
);

CREATE TABLE product_images (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  position INTEGER NOT NULL
);
CREATE INDEX product_images_by_product ON product_images (product_id, position);

CREATE TABLE customers (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('customer', 'admin')),
  customer_id TEXT REFERENCES customers(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);

CREATE TABLE orders (
  id TEXT PRIMARY KEY,
  number TEXT NOT NULL UNIQUE,
  access_token_hash TEXT NOT NULL,
  customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  address TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN (
    'awaiting_payment', 'paid', 'in_progress', 'completed', 'cancelled', 'payment_failed', 'expired'
  )),
  total INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'NGN',
  bachs_checkout_id TEXT,
  bachs_charge_id TEXT,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  paid_at TEXT,
  updated_at TEXT NOT NULL
);
CREATE INDEX orders_by_customer ON orders (customer_id, created_at);
CREATE INDEX orders_by_status ON orders (status, created_at);
CREATE INDEX orders_by_checkout ON orders (bachs_checkout_id);

CREATE TABLE order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id TEXT,
  product_name TEXT NOT NULL,
  image_key TEXT,
  unit_price INTEGER NOT NULL,
  quantity INTEGER NOT NULL,
  size TEXT,
  measurements TEXT
);
CREATE INDEX order_items_by_order ON order_items (order_id);

CREATE TABLE webhook_events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  received_at TEXT NOT NULL
);
