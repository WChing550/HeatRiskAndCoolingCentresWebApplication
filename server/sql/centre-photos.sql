-- Additive and safe to re-run. Existing single-photo covers are retained.
ALTER TABLE cooling_centres ADD COLUMN IF NOT EXISTS image_urls TEXT[] NOT NULL DEFAULT '{}';
UPDATE cooling_centres SET image_urls=ARRAY[image_url]
WHERE image_url IS NOT NULL AND cardinality(image_urls)=0;
