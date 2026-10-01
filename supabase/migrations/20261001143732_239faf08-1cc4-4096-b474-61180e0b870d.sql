DROP POLICY IF EXISTS "Receipts accept only images and PDF" ON storage.objects;
CREATE POLICY "Receipts accept only images and PDF"
ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (
  bucket_id NOT IN ('expense-receipts','resource-receipts')
  OR lower(storage.extension(name)) IN ('jpg','jpeg','png','webp','heic','heif','pdf')
);
DROP POLICY IF EXISTS "Receipts keep an image or PDF name" ON storage.objects;
CREATE POLICY "Receipts keep an image or PDF name"
ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated
WITH CHECK (
  bucket_id NOT IN ('expense-receipts','resource-receipts')
  OR lower(storage.extension(name)) IN ('jpg','jpeg','png','webp','heic','heif','pdf')
);