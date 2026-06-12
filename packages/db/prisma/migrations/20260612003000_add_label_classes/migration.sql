CREATE TABLE "label_classes" (
  "id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "color" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "label_classes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "label_classes_project_id_name_key" ON "label_classes"("project_id", "name");
CREATE INDEX "label_classes_project_id_created_at_idx" ON "label_classes"("project_id", "created_at");

ALTER TABLE "label_classes"
  ADD CONSTRAINT "label_classes_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
