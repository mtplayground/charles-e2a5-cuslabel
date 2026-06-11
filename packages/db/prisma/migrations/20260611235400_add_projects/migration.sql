CREATE TABLE "projects" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "image_count" INTEGER NOT NULL DEFAULT 0,
  "label_class_count" INTEGER NOT NULL DEFAULT 0,
  "annotation_count" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "projects_created_at_idx" ON "projects"("created_at");
