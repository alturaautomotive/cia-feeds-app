ALTER TABLE "Vehicle" ADD COLUMN "images" TEXT[] NOT NULL DEFAULT '{}';
UPDATE "Vehicle" SET "images" = ARRAY["imageUrl"] WHERE "imageUrl" IS NOT NULL;
