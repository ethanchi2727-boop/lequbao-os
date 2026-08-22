BEGIN;

CREATE TABLE product_publication_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id uuid NOT NULL,
  idempotency_key text NOT NULL CHECK (char_length(idempotency_key) BETWEEN 1 AND 255),
  request_hash text NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  from_status text NOT NULL CHECK (from_status IN ('DRAFT','OFF_SALE')),
  to_status text NOT NULL CHECK (to_status='ON_SALE'),
  product_version integer NOT NULL CHECK (product_version>0),
  published_by uuid NOT NULL REFERENCES users(id),
  published_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,id),
  UNIQUE (tenant_id,idempotency_key),
  FOREIGN KEY (tenant_id,product_id) REFERENCES products(tenant_id,id)
);

ALTER TABLE product_publication_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_publication_receipts FORCE ROW LEVEL SECURITY;
CREATE POLICY product_publication_receipts_tenant ON product_publication_receipts
  USING (tenant_id=app.current_tenant_id()) WITH CHECK (tenant_id=app.current_tenant_id());
CREATE TRIGGER product_publication_receipts_immutable
  BEFORE UPDATE OR DELETE ON product_publication_receipts
  FOR EACH ROW EXECUTE FUNCTION app.reject_mutation();

INSERT INTO schema_migrations(version,checksum)
VALUES ('0024_product_publication_receipts',encode(digest('lequbao-v6.1-0024-product-publication-receipts','sha256'),'hex'))
ON CONFLICT (version) DO NOTHING;

COMMIT;
