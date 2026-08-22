BEGIN;

ALTER TABLE platform_checkout_groups
  ADD COLUMN source_channel text NOT NULL DEFAULT 'LEQU_LIFE'
    CHECK (source_channel IN ('LEQU_LIFE','MERCHANT_MINI_PROGRAM'));

INSERT INTO schema_migrations(version,checksum)
VALUES ('0019_merchant_mini_checkout_scope',encode(digest('lequbao-v6.1-0019','sha256'),'hex'))
ON CONFLICT (version) DO NOTHING;

COMMIT;
