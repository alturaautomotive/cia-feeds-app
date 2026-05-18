ALTER TABLE "BlogPost" ADD COLUMN IF NOT EXISTS "crossPosts" JSONB NOT NULL DEFAULT '[]'::jsonb;
CREATE INDEX IF NOT EXISTS "BlogPost_crossPosts_idx" ON "BlogPost" USING GIN ("crossPosts");
