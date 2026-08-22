\set ON_ERROR_STOP on

BEGIN;

INSERT INTO tenants(id,tenant_code,legal_name,display_name) VALUES
  ('54000000-0000-4000-8000-000000000001','cart-tenant-a','Cart A Legal','Cart A'),
  ('54000000-0000-4000-8000-000000000002','cart-tenant-b','Cart B Legal','Cart B');
INSERT INTO stores(id,tenant_id,store_code,store_name,status) VALUES
  ('54000000-0000-4000-8000-000000000003','54000000-0000-4000-8000-000000000001','CART-A','Cart Store A','ACTIVE'),
  ('54000000-0000-4000-8000-000000000004','54000000-0000-4000-8000-000000000002','CART-B','Cart Store B','ACTIVE');
INSERT INTO products(id,tenant_id,store_id,product_type,title,status,sale_price_cents) VALUES
  ('54000000-0000-4000-8000-000000000005','54000000-0000-4000-8000-000000000001','54000000-0000-4000-8000-000000000003','PHYSICAL','Product A','ON_SALE',1000),
  ('54000000-0000-4000-8000-000000000006','54000000-0000-4000-8000-000000000002','54000000-0000-4000-8000-000000000004','PHYSICAL','Product B','ON_SALE',2000);
INSERT INTO product_variants(id,tenant_id,product_id,sku_code,title,sale_price_cents,status) VALUES
  ('54000000-0000-4000-8000-000000000007','54000000-0000-4000-8000-000000000001','54000000-0000-4000-8000-000000000005','CART-A-SKU','A',1000,'ACTIVE'),
  ('54000000-0000-4000-8000-000000000008','54000000-0000-4000-8000-000000000002','54000000-0000-4000-8000-000000000006','CART-B-SKU','B',2000,'ACTIVE');
INSERT INTO platform_consumer_accounts(id,union_identifier_hash) VALUES
  ('54000000-0000-4000-8000-000000000009',repeat('a',64)),
  ('54000000-0000-4000-8000-000000000010',repeat('b',64));
INSERT INTO shopping_carts(id,account_id) VALUES
  ('54000000-0000-4000-8000-000000000011','54000000-0000-4000-8000-000000000009'),
  ('54000000-0000-4000-8000-000000000012','54000000-0000-4000-8000-000000000010');
INSERT INTO shopping_cart_items(
  id,cart_id,merchant_tenant_id,store_id,product_id,variant_id,quantity
) VALUES
  ('54000000-0000-4000-8000-000000000013','54000000-0000-4000-8000-000000000011','54000000-0000-4000-8000-000000000001','54000000-0000-4000-8000-000000000003','54000000-0000-4000-8000-000000000005','54000000-0000-4000-8000-000000000007',1),
  ('54000000-0000-4000-8000-000000000014','54000000-0000-4000-8000-000000000012','54000000-0000-4000-8000-000000000002','54000000-0000-4000-8000-000000000004','54000000-0000-4000-8000-000000000006','54000000-0000-4000-8000-000000000008',1);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='lequ_platform_consumer_test') THEN
    CREATE ROLE lequ_platform_consumer_test NOLOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA app,public TO lequ_platform_consumer_test;
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO lequ_platform_consumer_test;

SET ROLE lequ_platform_consumer_test;
SELECT set_config('app.consumer_account_id','54000000-0000-4000-8000-000000000009',true);

DO $$
DECLARE
  visible_accounts integer;
  visible_carts integer;
  visible_items integer;
  affected_rows integer;
BEGIN
  SELECT count(*) INTO visible_accounts FROM platform_consumer_accounts;
  SELECT count(*) INTO visible_carts FROM shopping_carts;
  SELECT count(*) INTO visible_items FROM shopping_cart_items;
  IF visible_accounts<>1 OR visible_carts<>1 OR visible_items<>1 THEN
    RAISE EXCEPTION 'platform consumer RLS read isolation failed: accounts %, carts %, items %',
      visible_accounts,visible_carts,visible_items;
  END IF;
  UPDATE shopping_cart_items SET quantity=9
   WHERE id='54000000-0000-4000-8000-000000000014';
  GET DIAGNOSTICS affected_rows=ROW_COUNT;
  IF affected_rows<>0 THEN RAISE EXCEPTION 'cross-account cart update succeeded'; END IF;
END
$$;

RESET ROLE;

DO $$
BEGIN
  IF (SELECT quantity FROM shopping_cart_items
       WHERE id='54000000-0000-4000-8000-000000000014')<>1 THEN
    RAISE EXCEPTION 'cross-account cart row changed';
  END IF;
END
$$;

ROLLBACK;

\echo 'Platform consumer cart RLS checks passed'
