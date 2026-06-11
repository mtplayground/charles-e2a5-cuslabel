CREATE TABLE "app_metadata" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "value" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "app_metadata_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "app_metadata_key_key" ON "app_metadata"("key");
