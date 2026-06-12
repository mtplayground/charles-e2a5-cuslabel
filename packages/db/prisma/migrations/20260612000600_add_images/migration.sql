CREATE TABLE "images" (
  "id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "storage_key" TEXT NOT NULL,
  "width" INTEGER NOT NULL,
  "height" INTEGER NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "images_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "images_storage_key_key" ON "images"("storage_key");
CREATE INDEX "images_project_id_created_at_idx" ON "images"("project_id", "created_at");

ALTER TABLE "images"
  ADD CONSTRAINT "images_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
