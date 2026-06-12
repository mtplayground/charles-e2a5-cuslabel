# charles-e2a5-cuslabel

## Snapshot

`charles-e2a5-cuslabel` is a web-based image annotation workspace. It lets users organize labeling work into projects, upload images, define label classes, annotate images with bounding boxes and polylines, and export the result as COCO JSON.

## Core Features

- Project dashboard with create, rename, delete, and list flows.
- Image upload and gallery views with persisted metadata and private object storage-backed image delivery.
- Project-specific label classes with names and colors.
- Konva-based annotation canvas with image rendering, zoom, pan, and a drawing layer.
- Bounding box annotation support: draw, move, resize, delete, assign active class, and persist.
- Polyline annotation support: draw multi-point paths, add/move/delete vertices, delete paths, assign active class, and persist.
- COCO export generation for project images, categories, boxes, and polylines, exposed through a download endpoint and export panel UI.
- Automated end-to-end test covering project creation, image upload, box and polyline annotation, COCO export, and cleanup.

## Architecture

- Monorepo using Node.js 20+, TypeScript, npm workspaces, and shared packages.
- `apps/web`: Vite React frontend with Tailwind CSS and Konva for annotation UI.
- `apps/api`: Express API, configured to listen on `0.0.0.0:8080` by default.
- `packages/db`: Prisma schema, generated client, and PostgreSQL migrations.
- `packages/storage`: S3-compatible object storage wrapper.
- `packages/shared`: Shared DTOs and Zod validation schemas.
- `tests/e2e`: Core-flow E2E test script.

## Data and Storage Conventions

- PostgreSQL is the only persistent database. `DATABASE_URL` is required; SQLite, JSON-file persistence, in-memory state, and ephemeral volumes are not part of the product contract.
- Uploaded image bytes live in private S3-compatible object storage.
- Database rows store object keys and metadata, not public object URLs or base64 file data.
- Object storage keys are relative in application data; the storage package prepends `OBJECT_STORAGE_PREFIX` for every put, get, and delete operation.
- Browser-readable image URLs are generated as presigned GET URLs on API reads.

## Validation and Operations

- API request bodies are validated with shared schemas and return structured JSON errors.
- Malformed JSON returns a 400 response, unknown `/api/*` routes return JSON 404 responses, and unexpected server errors are logged before a 500 response.
- Local development runs migrations before starting the API and web dev server; Vite proxies `/api` to the API service.
- Production build compiles shared packages, the API, and the web app. Production serving expects the API process plus a static host or reverse proxy for `apps/web/dist`.
- `/api/health` checks database and storage configuration.

## Current Boundaries

- The product currently focuses on project-based image annotation and COCO export.
- Annotation geometry supports bounding boxes and polylines.
- Storage is private by design; clients should use API-provided signed URLs rather than constructing bucket URLs.
