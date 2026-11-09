# Zuch

Online shop for Zuch, running on Cloudflare.

| Folder | What |
| --- | --- |
| `src/` | The shop customers use (React + Vite) |
| `admin/` | The owner's admin at `/admin` (React + Vite) |
| `backend/` | The Cloudflare Worker: API, payments, database and photos. **Start here.** |
| `scripts/images/` | The product catalog snapshot the backend seeds from |

Customers can browse, check out as a guest or with an account, pay with Bachs, and follow
their orders. Setup, local running and deployment are in [backend/README.md](backend/README.md).
