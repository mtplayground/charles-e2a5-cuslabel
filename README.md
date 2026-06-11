# charles-e2a5-cuslabel

React, Tailwind, and Node.js/Express monorepo scaffold.

## Workspace

- `apps/web` - Vite React frontend with Tailwind.
- `apps/api` - Express backend listening on `0.0.0.0:8080` by default.
- `packages/db` - Prisma client and PostgreSQL migration setup.
- `packages/storage` - S3-compatible Object Storage client.
- `packages/shared` - Shared TypeScript types and utilities.

## Scripts

```bash
npm install
export DATABASE_URL=$(cat /workspace/.database_url)
set -a
source /workspace/.env.production
set +a
npm run db:migrate:deploy
npm run dev
npm run build
npm start
```

The frontend dev server runs on port `5173` and proxies `/api` requests to the
backend on port `8080`.
