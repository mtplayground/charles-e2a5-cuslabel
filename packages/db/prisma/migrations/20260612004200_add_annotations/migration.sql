CREATE TYPE "annotation_type" AS ENUM ('BOX', 'POLYLINE');

CREATE TABLE "annotations" (
  "id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "image_id" TEXT NOT NULL,
  "label_class_id" TEXT NOT NULL,
  "type" "annotation_type" NOT NULL,
  "geometry" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "annotations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "annotations_project_id_created_at_idx" ON "annotations"("project_id", "created_at");
CREATE INDEX "annotations_image_id_created_at_idx" ON "annotations"("image_id", "created_at");
CREATE INDEX "annotations_label_class_id_idx" ON "annotations"("label_class_id");

ALTER TABLE "annotations"
  ADD CONSTRAINT "annotations_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "annotations"
  ADD CONSTRAINT "annotations_image_id_fkey"
  FOREIGN KEY ("image_id") REFERENCES "images"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "annotations"
  ADD CONSTRAINT "annotations_label_class_id_fkey"
  FOREIGN KEY ("label_class_id") REFERENCES "label_classes"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
