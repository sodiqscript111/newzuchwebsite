# Zuch admin

The screens the shop owner uses at `/admin`: paid orders to work through, and products
with their photos. Sign in with `ADMIN_PASSWORD` (see `../backend/README.md`).

It has no server of its own. It talks to the Worker in `../backend`, and
`npm run build:sites` there builds it into the Worker.

```bash
npm install
npm run dev        # http://localhost:5174/admin/ (needs `npm run dev` in ../backend)
npm run build      # into dist/
npm run typecheck
```

- **Orders:** "To do" holds paid orders. Move them through Not started, Working on it and
  Done. Customers see each change on their order page. Unpaid orders wait under "Unpaid".
- **Products:** add, edit, hide or delete products and collections. Large phone photos
  are shrunk before upload.
