# charles-e2a5-cuslabel

Image annotation workspace for project-based label classes, bounding boxes,
polylines, and COCO JSON export.

## Workspace

- `apps/web` - Vite React frontend with Tailwind and Konva annotation canvas.
- `apps/api` - Express API listening on `0.0.0.0:8080` by default.
- `packages/db` - Prisma client and PostgreSQL migrations.
- `packages/storage` - S3-compatible object storage client.
- `packages/shared` - Shared TypeScript DTOs and validation schemas.
- `tests/e2e` - Node E2E coverage for the core project/upload/annotate/export
  flow.

## Required Services

- Node.js 20 or newer.
- PostgreSQL. `DATABASE_URL` must point at a PostgreSQL database; SQLite,
  JSON-file persistence, in-memory storage, and local volumes are not supported.
- S3-compatible private object storage. The app reads the
  `OBJECT_STORAGE_*` variables shown in `.env.example`.

Uploaded images are stored as object keys relative to `OBJECT_STORAGE_PREFIX`.
The storage package prepends that prefix for every put/get/delete operation and
generates presigned GET URLs for browser display. Do not store public S3 URLs in
the database; the bucket is expected to be private.

## Environment

Copy `.env.example` and fill in real values:

```bash
cp .env.example .env
```

For the myClawTeam-provisioned environment, load the provided runtime values:

```bash
set -a
source /workspace/.env.production
set +a
export DATABASE_URL=$(cat /workspace/.database_url)
```

`HOST` and `PORT` control the Express API listener. In production use
`HOST=0.0.0.0` and `PORT=8080` unless your process manager or platform provides
different values.

## Local Development

```bash
npm install
set -a
source .env
set +a
npm run db:migrate:deploy
npm run dev
```

The dev command builds shared packages, starts the API on port `8080`, and
starts the Vite frontend on port `5173`. Vite proxies `/api` requests to the
local API.

## Validation

Run these before deployment:

```bash
npm run db:generate
npm run db:migrate:deploy
npm run typecheck
npm run lint
npm run format:check
npm run build
npm run test:e2e
```

`npm run test:e2e` starts the built API on a test port, creates a project,
uploads a real PNG through object storage, creates a box and polyline annotation,
downloads the COCO export, validates the JSON, and deletes the test project.

## Production Build

```bash
npm ci
npm run db:migrate:deploy
npm run build
```

Build outputs:

- API: `apps/api/dist`
- Web: `apps/web/dist`
- Shared package builds: `packages/*/dist`

Start the API with:

```bash
HOST=0.0.0.0 PORT=8080 npm start
```

`npm start` starts the API only. Serve `apps/web/dist` with a static web server
or reverse proxy.

## Bare Self-Hosted Deployment

A minimal single-host deployment has two serving responsibilities:

1. Run the API process:

   ```bash
   set -a
   source /etc/charles-e2a5-cuslabel.env
   set +a
   npm ci
   npm run db:migrate:deploy
   npm run build
   npm prune --omit=dev
   HOST=127.0.0.1 PORT=8080 npm start
   ```

2. Serve the frontend and proxy API traffic. With Nginx, the important shape is:

   ```nginx
   server {
     listen 80;
     server_name example.com;

     root /srv/charles-e2a5-cuslabel/apps/web/dist;
     index index.html;

     location /api/ {
       proxy_pass http://127.0.0.1:8080/api/;
       proxy_http_version 1.1;
       proxy_set_header Host $host;
       proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
       proxy_set_header X-Forwarded-Proto $scheme;
     }

     location / {
       try_files $uri $uri/ /index.html;
     }
   }
   ```

Use a process manager such as systemd, PM2, or your platform supervisor to keep
the API running. Run migrations before replacing the running API process.

## Health Check

The API exposes:

```bash
curl -fsS http://127.0.0.1:8080/api/health
```

The health response checks both PostgreSQL and object storage connectivity.

## Deployment Checklist

- `DATABASE_URL` is set to PostgreSQL.
- `OBJECT_STORAGE_ACCESS_KEY_ID`, `OBJECT_STORAGE_SECRET_ACCESS_KEY`,
  `OBJECT_STORAGE_BUCKET`, `OBJECT_STORAGE_PREFIX`,
  `OBJECT_STORAGE_ENDPOINT`, `OBJECT_STORAGE_REGION`, and
  `OBJECT_STORAGE_FORCE_PATH_STYLE` are set.
- `OBJECT_STORAGE_PREFIX` ends with `/` and matches the IAM-restricted prefix
  for the storage credentials.
- `npm run db:migrate:deploy` has completed successfully.
- `npm run build` has completed successfully.
- Static hosting serves `apps/web/dist`.
- `/api/` is proxied to the API process.
- `/api/health` returns `database: "ok"` and `storage: "ok"`.
