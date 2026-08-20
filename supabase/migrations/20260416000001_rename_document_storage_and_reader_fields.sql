-- Rename AWS-era document storage and OCR reader columns to provider-agnostic names.

ALTER TABLE public.documents
    RENAME COLUMN s3_key TO storage_key;

ALTER TABLE public.documents
    RENAME COLUMN s3_bucket TO storage_bucket;

ALTER TABLE public.documents
    RENAME COLUMN textract_job_id TO reader_job_id;

ALTER TABLE public.ocr_results
    RENAME COLUMN textract_job_id TO reader_job_id;

ALTER TABLE public.documents
    RENAME CONSTRAINT unique_s3_key TO unique_storage_key;

ALTER INDEX IF EXISTS public.idx_documents_textract_job_id
    RENAME TO idx_documents_reader_job_id;

ALTER INDEX IF EXISTS public.idx_ocr_results_textract_job_id
    RENAME TO idx_ocr_results_reader_job_id;

COMMENT ON COLUMN public.documents.storage_key IS 'Object storage key for the stored document';
COMMENT ON COLUMN public.documents.storage_bucket IS 'Object storage bucket name where document is stored';
COMMENT ON COLUMN public.documents.reader_job_id IS 'Document reader job identifier for extraction processing';
COMMENT ON COLUMN public.ocr_results.reader_job_id IS 'Document reader job identifier that produced these OCR results';
