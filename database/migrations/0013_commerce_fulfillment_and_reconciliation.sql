BEGIN;

CREATE TABLE merchant_payment_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('WECHAT_PAY','ALIPAY','SANDBOX')),
  provider_account_hash text NOT NULL CHECK (provider_account_hash ~ '^[a-f0-9]{64}$'),
  credential_secret_ref text NOT NULL CHECK (credential_secret_ref ~ '^(kms|secret)://'),
  settlement_subject_ref text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING_CONFIRMATION'
    CHECK (status IN ('PENDING_CONFIRMATION','ACTIVE','SUSPENDED','REVOKED')),
  confirmed_by uuid REFERENCES users(id),
  confirmation_ref text,
  confirmed_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, provider, provider_account_hash),
  UNIQUE (tenant_id, id),
  CHECK ((status='PENDING_CONFIRMATION') = (confirmed_at IS NULL)),
  CHECK ((confirmed_at IS NULL) = (confirmed_by IS NULL)),
  CHECK ((confirmed_at IS NULL) = (confirmation_ref IS NULL))
);

ALTER TABLE orders
  ADD COLUMN order_type text NOT NULL DEFAULT 'GROUP_BUY'
    CHECK (order_type IN ('PHYSICAL_DELIVERY','STORE_PICKUP','GROUP_BUY','SERVICE_APPOINTMENT')),
  ADD COLUMN payment_status text NOT NULL DEFAULT 'UNPAID'
    CHECK (payment_status IN ('UNPAID','PROCESSING','PAID','PARTIALLY_REFUNDED','REFUNDED','FAILED')),
  ADD COLUMN fulfillment_status text NOT NULL DEFAULT 'NOT_STARTED'
    CHECK (fulfillment_status IN ('NOT_STARTED','PREPARING','SHIPPED','READY_FOR_PICKUP','IN_SERVICE','PARTIALLY_FULFILLED','FULFILLED','CANCELLED')),
  ADD COLUMN verification_status text NOT NULL DEFAULT 'NOT_APPLICABLE'
    CHECK (verification_status IN ('NOT_APPLICABLE','PENDING','AVAILABLE','PARTIALLY_USED','FULLY_USED','VOIDED')),
  ADD COLUMN aftercare_status text NOT NULL DEFAULT 'NONE'
    CHECK (aftercare_status IN ('NONE','REQUESTED','PROCESSING','WAITING_CUSTOMER','RESOLVED','REJECTED')),
  ADD COLUMN cancelled_at timestamptz,
  ADD COLUMN inventory_released_at timestamptz,
  ADD CONSTRAINT orders_status_projection_check CHECK (
    (status='PENDING_PAYMENT' AND payment_status IN ('UNPAID','PROCESSING','FAILED')) OR
    (status IN ('PAID','FULFILLING','COMPLETED') AND payment_status IN ('PAID','PARTIALLY_REFUNDED','REFUNDED')) OR
    (status IN ('CANCELLED','CLOSED'))
  );

ALTER TABLE order_items
  ADD COLUMN discount_allocation_cents bigint NOT NULL DEFAULT 0
    CHECK (discount_allocation_cents>=0 AND discount_allocation_cents<=line_amount_cents),
  ADD COLUMN paid_allocation_cents bigint GENERATED ALWAYS AS
    (line_amount_cents-discount_allocation_cents) STORED,
  ADD COLUMN refunded_amount_cents bigint NOT NULL DEFAULT 0 CHECK (refunded_amount_cents>=0),
  ADD CONSTRAINT order_items_refunded_amount_check
    CHECK (refunded_amount_cents<=line_amount_cents-discount_allocation_cents);

CREATE TABLE order_state_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  order_id uuid NOT NULL,
  order_status text NOT NULL,
  payment_status text NOT NULL,
  fulfillment_status text NOT NULL,
  verification_status text NOT NULL,
  aftercare_status text NOT NULL,
  reason_code text NOT NULL,
  actor_type text NOT NULL CHECK (actor_type IN ('CUSTOMER','USER','SYSTEM','PROVIDER')),
  actor_id_hash text NOT NULL CHECK (actor_id_hash ~ '^[a-f0-9]{64}$'),
  trace_id text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, order_id, occurred_at, reason_code),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, order_id) REFERENCES orders(tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE order_fulfillments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  order_id uuid NOT NULL,
  fulfillment_type text NOT NULL
    CHECK (fulfillment_type IN ('PHYSICAL_DELIVERY','STORE_PICKUP','GROUP_BUY','SERVICE_APPOINTMENT')),
  status text NOT NULL DEFAULT 'NOT_STARTED'
    CHECK (status IN ('NOT_STARTED','PREPARING','SHIPPED','READY','IN_SERVICE','PARTIALLY_FULFILLED','FULFILLED','CANCELLED')),
  fulfillment_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(fulfillment_snapshot)='object'),
  carrier_code text,
  tracking_number_hash text,
  scheduled_at timestamptz,
  fulfilled_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, order_id),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, order_id) REFERENCES orders(tenant_id, id) ON DELETE CASCADE,
  CHECK (tracking_number_hash IS NULL OR tracking_number_hash ~ '^[a-f0-9]{64}$'),
  CHECK ((status='FULFILLED') = (fulfilled_at IS NOT NULL))
);

CREATE TABLE aftercare_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  order_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  request_type text NOT NULL
    CHECK (request_type IN ('UNSHIPPED_REFUND','RETURN_REFUND','UNUSED_GROUP_BUY_REFUND','SERVICE_DISPUTE','OTHER')),
  reason_code text NOT NULL,
  description_object_ref text,
  evidence_object_refs text[] NOT NULL DEFAULT '{}',
  responsibility text CHECK (responsibility IN ('MERCHANT','CUSTOMER','PLATFORM','PROVIDER','UNDETERMINED')),
  status text NOT NULL DEFAULT 'REQUESTED'
    CHECK (status IN ('REQUESTED','PROCESSING','WAITING_CUSTOMER','RESOLVED','REJECTED','CANCELLED')),
  due_at timestamptz NOT NULL,
  resolved_by uuid REFERENCES users(id),
  resolution_code text,
  resolved_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, order_id) REFERENCES orders(tenant_id, id),
  FOREIGN KEY (tenant_id, customer_id) REFERENCES customer_profiles(tenant_id, id),
  CHECK ((status IN ('RESOLVED','REJECTED','CANCELLED')) = (resolved_at IS NOT NULL)),
  CHECK ((resolved_at IS NULL) = (resolution_code IS NULL))
);

ALTER TABLE payment_transactions
  ADD CONSTRAINT payment_transactions_tenant_id_id_unique UNIQUE (tenant_id, id);

ALTER TABLE payment_intents
  ADD COLUMN merchant_payment_account_id uuid,
  ADD COLUMN provider_request_object_ref text,
  ADD COLUMN last_query_at timestamptz,
  ADD COLUMN failure_code text,
  ADD CONSTRAINT payment_intents_merchant_account_fk
    FOREIGN KEY (tenant_id, merchant_payment_account_id)
    REFERENCES merchant_payment_accounts(tenant_id, id),
  ADD CONSTRAINT payment_intents_terminal_fields_check CHECK (
    (status IN ('SUCCEEDED','PARTIALLY_REFUNDED','REFUNDED')) = (succeeded_at IS NOT NULL)
  );

CREATE TABLE payment_callback_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider text NOT NULL,
  provider_event_id text NOT NULL,
  provider_event_hash text NOT NULL CHECK (provider_event_hash ~ '^[a-f0-9]{64}$'),
  payload_object_ref text NOT NULL,
  payload_hash text NOT NULL CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
  signature_verified boolean NOT NULL CHECK (signature_verified),
  event_type text NOT NULL CHECK (event_type IN ('PAYMENT_SUCCEEDED','PAYMENT_FAILED','REFUND_SUCCEEDED','REFUND_FAILED')),
  payment_intent_id uuid,
  refund_id uuid,
  processing_status text NOT NULL DEFAULT 'RECEIVED'
    CHECK (processing_status IN ('RECEIVED','APPLIED','REJECTED','FAILED_RETRYABLE')),
  error_code text,
  provider_occurred_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  applied_at timestamptz,
  UNIQUE (provider, provider_event_id),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, payment_intent_id) REFERENCES payment_intents(tenant_id, id),
  FOREIGN KEY (tenant_id, refund_id) REFERENCES refunds(tenant_id, id),
  CHECK ((event_type LIKE 'PAYMENT_%') = (payment_intent_id IS NOT NULL)),
  CHECK ((event_type LIKE 'REFUND_%') = (refund_id IS NOT NULL)),
  CHECK ((processing_status='APPLIED') = (applied_at IS NOT NULL)),
  CHECK (processing_status <> 'FAILED_RETRYABLE' OR error_code IS NOT NULL)
);

ALTER TABLE refunds
  ADD COLUMN aftercare_request_id uuid,
  ADD COLUMN requested_by_customer_id uuid,
  ADD COLUMN approval_policy_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(approval_policy_snapshot)='object'),
  ADD COLUMN submitted_at timestamptz,
  ADD COLUMN failure_code text,
  ADD CONSTRAINT refunds_aftercare_fk
    FOREIGN KEY (tenant_id, aftercare_request_id) REFERENCES aftercare_requests(tenant_id, id),
  ADD CONSTRAINT refunds_requester_customer_fk
    FOREIGN KEY (tenant_id, requested_by_customer_id) REFERENCES customer_profiles(tenant_id, id),
  ADD CONSTRAINT refunds_one_requester_check
    CHECK (num_nonnulls(requested_by,requested_by_customer_id)=1),
  ADD CONSTRAINT refunds_provider_state_check CHECK (
    (status='SUCCEEDED') = (succeeded_at IS NOT NULL)
  );

CREATE TABLE refund_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  refund_id uuid NOT NULL,
  requested_by uuid REFERENCES users(id),
  requested_by_customer_id uuid,
  decided_by uuid REFERENCES users(id),
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED','EXPIRED')),
  request_reason text NOT NULL,
  decision_reason text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  expires_at timestamptz NOT NULL,
  UNIQUE (tenant_id, refund_id),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, refund_id) REFERENCES refunds(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, requested_by_customer_id) REFERENCES customer_profiles(tenant_id, id),
  CHECK (num_nonnulls(requested_by,requested_by_customer_id)=1),
  CHECK (requested_by IS NULL OR requested_by IS DISTINCT FROM decided_by),
  CHECK ((status='PENDING') = (decided_at IS NULL)),
  CHECK ((decided_at IS NULL) = (decision_reason IS NULL)),
  CHECK (expires_at > requested_at)
);

CREATE TABLE refund_provider_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  refund_id uuid NOT NULL,
  attempt_no integer NOT NULL CHECK (attempt_no > 0),
  idempotency_key text NOT NULL,
  provider_request_id text,
  request_digest text NOT NULL CHECK (request_digest ~ '^[a-f0-9]{64}$'),
  status text NOT NULL CHECK (status IN ('SUBMITTED','PROCESSING','SUCCEEDED','FAILED','UNKNOWN')),
  response_summary jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(response_summary)='object'),
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (tenant_id, refund_id, attempt_no),
  UNIQUE (tenant_id, idempotency_key),
  UNIQUE NULLS NOT DISTINCT (tenant_id, provider_request_id),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, refund_id) REFERENCES refunds(tenant_id, id),
  CHECK ((status IN ('SUCCEEDED','FAILED')) = (completed_at IS NOT NULL)),
  CHECK (status <> 'FAILED' OR error_code IS NOT NULL)
);

ALTER TABLE verification_entitlements
  ADD COLUMN order_id uuid,
  ADD COLUMN allowed_store_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN token_generation integer NOT NULL DEFAULT 1 CHECK (token_generation > 0),
  ADD COLUMN void_reason text,
  ADD CONSTRAINT verification_entitlements_order_fk
    FOREIGN KEY (tenant_id, order_id) REFERENCES orders(tenant_id, id),
  ADD CONSTRAINT verification_entitlements_validity_check
    CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until > valid_from),
  ADD CONSTRAINT verification_entitlements_void_check
    CHECK ((status='VOIDED') = (void_reason IS NOT NULL));

ALTER TABLE verification_uses
  ADD COLUMN token_digest text CHECK (token_digest IS NULL OR token_digest ~ '^[a-f0-9]{64}$'),
  ADD COLUMN device_risk_level text NOT NULL DEFAULT 'NORMAL'
    CHECK (device_risk_level IN ('NORMAL','ELEVATED','HIGH','BLOCKED')),
  ADD COLUMN trace_id text NOT NULL DEFAULT 'legacy',
  ADD CONSTRAINT verification_uses_tenant_id_id_unique UNIQUE (tenant_id, id);

ALTER TABLE ledger_transactions
  ADD COLUMN original_transaction_id uuid,
  ADD COLUMN reason_code text,
  ADD CONSTRAINT ledger_transactions_original_fk
    FOREIGN KEY (tenant_id, original_transaction_id)
    REFERENCES ledger_transactions(tenant_id, id),
  ADD CONSTRAINT ledger_transactions_reversal_check CHECK (
    (transaction_type='REWARD_REVERSE') = (original_transaction_id IS NOT NULL)
  );

ALTER TABLE ledger_entries
  ADD CONSTRAINT ledger_entries_tenant_id_id_unique UNIQUE (tenant_id, id);

CREATE TABLE commerce_reconciliation_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  business_date date NOT NULL,
  provider text NOT NULL,
  provider_bill_object_ref text NOT NULL,
  provider_bill_hash text NOT NULL CHECK (provider_bill_hash ~ '^[a-f0-9]{64}$'),
  status text NOT NULL DEFAULT 'CALCULATING'
    CHECK (status IN ('CALCULATING','BALANCED','DIFFERENCE_FOUND','REVIEWING','RESOLVED','FAILED')),
  order_paid_cents bigint NOT NULL DEFAULT 0 CHECK (order_paid_cents >= 0),
  provider_paid_cents bigint NOT NULL DEFAULT 0 CHECK (provider_paid_cents >= 0),
  order_refunded_cents bigint NOT NULL DEFAULT 0 CHECK (order_refunded_cents >= 0),
  provider_refunded_cents bigint NOT NULL DEFAULT 0 CHECK (provider_refunded_cents >= 0),
  reward_net_cents bigint NOT NULL DEFAULT 0,
  verification_count bigint NOT NULL DEFAULT 0 CHECK (verification_count >= 0),
  difference_cents bigint NOT NULL DEFAULT 0,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, business_date, provider),
  UNIQUE (tenant_id, id),
  CHECK (difference_cents =
    (provider_paid_cents-provider_refunded_cents) - (order_paid_cents-order_refunded_cents)),
  CHECK ((status IN ('BALANCED','DIFFERENCE_FOUND','RESOLVED')) = (completed_at IS NOT NULL)),
  CHECK (status <> 'BALANCED' OR difference_cents=0)
);

CREATE TABLE commerce_reconciliation_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  batch_id uuid NOT NULL,
  line_type text NOT NULL CHECK (line_type IN ('PAYMENT','REFUND','REWARD','VERIFICATION')),
  business_id uuid NOT NULL,
  provider_reference_hash text,
  platform_amount_cents bigint NOT NULL,
  provider_amount_cents bigint,
  difference_cents bigint NOT NULL,
  evidence_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(evidence_snapshot)='object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, batch_id, line_type, business_id),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, batch_id) REFERENCES commerce_reconciliation_batches(tenant_id, id) ON DELETE CASCADE,
  CHECK (provider_reference_hash IS NULL OR provider_reference_hash ~ '^[a-f0-9]{64}$'),
  CHECK (difference_cents = COALESCE(provider_amount_cents,0)-platform_amount_cents)
);

CREATE TABLE commerce_reconciliation_discrepancies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  batch_id uuid NOT NULL,
  line_id uuid,
  reason_code text NOT NULL,
  amount_cents bigint NOT NULL CHECK (amount_cents <> 0),
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','INVESTIGATING','RESOLVED','ACCEPTED_KNOWN')),
  assigned_user_id uuid REFERENCES users(id),
  resolution_note_ref text,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, batch_id) REFERENCES commerce_reconciliation_batches(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, line_id) REFERENCES commerce_reconciliation_lines(tenant_id, id),
  CHECK ((status IN ('RESOLVED','ACCEPTED_KNOWN')) = (resolved_at IS NOT NULL)),
  CHECK ((resolved_at IS NULL) = (resolution_note_ref IS NULL))
);

CREATE OR REPLACE FUNCTION app.reject_commerce_evidence_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END;
$$;

CREATE TRIGGER inventory_ledger_immutable
BEFORE UPDATE OR DELETE ON inventory_ledger
FOR EACH ROW EXECUTE FUNCTION app.reject_commerce_evidence_mutation();
CREATE TRIGGER order_state_history_immutable
BEFORE UPDATE OR DELETE ON order_state_history
FOR EACH ROW EXECUTE FUNCTION app.reject_commerce_evidence_mutation();
CREATE TRIGGER payment_transactions_immutable
BEFORE UPDATE OR DELETE ON payment_transactions
FOR EACH ROW EXECUTE FUNCTION app.reject_commerce_evidence_mutation();
CREATE TRIGGER refund_items_immutable
BEFORE UPDATE OR DELETE ON refund_items
FOR EACH ROW EXECUTE FUNCTION app.reject_commerce_evidence_mutation();
CREATE TRIGGER verification_uses_immutable
BEFORE UPDATE OR DELETE ON verification_uses
FOR EACH ROW EXECUTE FUNCTION app.reject_commerce_evidence_mutation();
DROP TRIGGER IF EXISTS ledger_transactions_immutable ON ledger_transactions;
CREATE TRIGGER ledger_transactions_immutable
BEFORE UPDATE OR DELETE ON ledger_transactions
FOR EACH ROW EXECUTE FUNCTION app.reject_commerce_evidence_mutation();
DROP TRIGGER IF EXISTS ledger_entries_immutable ON ledger_entries;
CREATE TRIGGER ledger_entries_immutable
BEFORE UPDATE OR DELETE ON ledger_entries
FOR EACH ROW EXECUTE FUNCTION app.reject_commerce_evidence_mutation();
CREATE TRIGGER commerce_reconciliation_lines_immutable
BEFORE UPDATE OR DELETE ON commerce_reconciliation_lines
FOR EACH ROW EXECUTE FUNCTION app.reject_commerce_evidence_mutation();

CREATE OR REPLACE FUNCTION app.assert_payment_callback_receipt_transition()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'payment callback receipts cannot be deleted'; END IF;
  IF OLD.processing_status NOT IN ('RECEIVED','FAILED_RETRYABLE') OR
     NEW.processing_status NOT IN ('APPLIED','REJECTED','FAILED_RETRYABLE') OR
     OLD.tenant_id<>NEW.tenant_id OR OLD.provider<>NEW.provider OR
     OLD.provider_event_id<>NEW.provider_event_id OR
     OLD.provider_event_hash<>NEW.provider_event_hash OR
     OLD.payload_object_ref<>NEW.payload_object_ref OR OLD.payload_hash<>NEW.payload_hash OR
     OLD.signature_verified<>NEW.signature_verified OR OLD.event_type<>NEW.event_type OR
     OLD.payment_intent_id IS DISTINCT FROM NEW.payment_intent_id OR
     OLD.refund_id IS DISTINCT FROM NEW.refund_id OR
     OLD.provider_occurred_at<>NEW.provider_occurred_at OR OLD.received_at<>NEW.received_at THEN
    RAISE EXCEPTION 'invalid payment callback receipt transition';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER payment_callback_receipt_transition_check
BEFORE UPDATE OR DELETE ON payment_callback_receipts
FOR EACH ROW EXECUTE FUNCTION app.assert_payment_callback_receipt_transition();

CREATE OR REPLACE FUNCTION app.assert_order_commerce_transition()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.tenant_id<>NEW.tenant_id OR OLD.store_id<>NEW.store_id OR
     OLD.customer_id<>NEW.customer_id OR OLD.source_channel<>NEW.source_channel OR
     OLD.order_type<>NEW.order_type OR OLD.goods_amount_cents<>NEW.goods_amount_cents OR
     OLD.discount_amount_cents<>NEW.discount_amount_cents OR
     OLD.payable_amount_cents<>NEW.payable_amount_cents OR OLD.currency<>NEW.currency THEN
    RAISE EXCEPTION 'order commercial snapshot is immutable';
  END IF;
  IF OLD.status<>NEW.status AND NOT (
    (OLD.status='PENDING_PAYMENT' AND NEW.status IN ('PAID','CANCELLED')) OR
    (OLD.status='PAID' AND NEW.status IN ('FULFILLING','COMPLETED','CLOSED')) OR
    (OLD.status='FULFILLING' AND NEW.status IN ('COMPLETED','CLOSED')) OR
    (OLD.status='COMPLETED' AND NEW.status='CLOSED')
  ) THEN RAISE EXCEPTION 'invalid order transition % -> %',OLD.status,NEW.status; END IF;
  IF NEW.paid_amount_cents<OLD.paid_amount_cents OR
     NEW.refunded_amount_cents<OLD.refunded_amount_cents THEN
    RAISE EXCEPTION 'order money projections cannot decrease';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER order_commerce_transition_check
BEFORE UPDATE ON orders
FOR EACH ROW EXECUTE FUNCTION app.assert_order_commerce_transition();

CREATE OR REPLACE FUNCTION app.assert_payment_intent_transition()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.tenant_id<>NEW.tenant_id OR OLD.order_id<>NEW.order_id OR OLD.provider<>NEW.provider OR
     OLD.merchant_payment_account_ref<>NEW.merchant_payment_account_ref OR
     OLD.merchant_payment_account_id IS DISTINCT FROM NEW.merchant_payment_account_id OR
     OLD.amount_cents<>NEW.amount_cents OR OLD.currency<>NEW.currency OR
     OLD.idempotency_key<>NEW.idempotency_key OR OLD.client_request_hash<>NEW.client_request_hash OR
     (OLD.provider_payment_id IS NOT NULL AND OLD.provider_payment_id IS DISTINCT FROM NEW.provider_payment_id) THEN
    RAISE EXCEPTION 'payment intent commercial snapshot is immutable';
  END IF;
  IF OLD.status<>NEW.status AND NOT (
    (OLD.status='CREATED' AND NEW.status IN ('PROCESSING','FAILED','EXPIRED')) OR
    (OLD.status='PROCESSING' AND NEW.status IN ('SUCCEEDED','FAILED','EXPIRED')) OR
    (OLD.status='SUCCEEDED' AND NEW.status IN ('PARTIALLY_REFUNDED','REFUNDED')) OR
    (OLD.status='PARTIALLY_REFUNDED' AND NEW.status='REFUNDED')
  ) THEN RAISE EXCEPTION 'invalid payment transition % -> %',OLD.status,NEW.status; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER payment_intent_transition_check
BEFORE UPDATE ON payment_intents
FOR EACH ROW EXECUTE FUNCTION app.assert_payment_intent_transition();

CREATE OR REPLACE FUNCTION app.assert_refund_transition()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.tenant_id<>NEW.tenant_id OR OLD.order_id<>NEW.order_id OR
     OLD.payment_intent_id<>NEW.payment_intent_id OR OLD.amount_cents<>NEW.amount_cents OR
     OLD.reason_code<>NEW.reason_code OR OLD.idempotency_key<>NEW.idempotency_key OR
     OLD.requested_by IS DISTINCT FROM NEW.requested_by OR
     OLD.requested_by_customer_id IS DISTINCT FROM NEW.requested_by_customer_id OR
     (OLD.provider_refund_id IS NOT NULL AND OLD.provider_refund_id IS DISTINCT FROM NEW.provider_refund_id) THEN
    RAISE EXCEPTION 'refund request snapshot is immutable';
  END IF;
  IF OLD.status<>NEW.status AND NOT (
    (OLD.status='REQUESTED' AND NEW.status IN ('APPROVAL_REQUIRED','SUBMITTING','REJECTED')) OR
    (OLD.status='APPROVAL_REQUIRED' AND NEW.status IN ('SUBMITTING','REJECTED')) OR
    (OLD.status='SUBMITTING' AND NEW.status IN ('PROCESSING','SUCCEEDED','FAILED')) OR
    (OLD.status='PROCESSING' AND NEW.status IN ('SUCCEEDED','FAILED')) OR
    (OLD.status='FAILED' AND NEW.status='SUBMITTING')
  ) THEN RAISE EXCEPTION 'invalid refund transition % -> %',OLD.status,NEW.status; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER refund_transition_check
BEFORE UPDATE ON refunds
FOR EACH ROW EXECUTE FUNCTION app.assert_refund_transition();

CREATE OR REPLACE FUNCTION app.apply_inventory_ledger_entry()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE balance inventory_balances%ROWTYPE; prior inventory_ledger%ROWTYPE;
BEGIN
  SELECT * INTO prior FROM inventory_ledger
   WHERE tenant_id=NEW.tenant_id AND idempotency_key=NEW.idempotency_key;
  IF FOUND THEN
    IF prior.variant_id=NEW.variant_id AND prior.operation=NEW.operation AND
       prior.quantity=NEW.quantity AND prior.business_type=NEW.business_type AND
       prior.business_id=NEW.business_id THEN RETURN NULL; END IF;
    RAISE EXCEPTION 'inventory idempotency conflict';
  END IF;
  SELECT * INTO balance FROM inventory_balances
   WHERE tenant_id=NEW.tenant_id AND variant_id=NEW.variant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'inventory balance is missing'; END IF;
  IF NEW.operation IN ('RESERVE','RELEASE','CONSUME','INCREASE') AND NEW.quantity<=0 THEN
    RAISE EXCEPTION 'inventory operation quantity must be positive';
  END IF;
  IF NEW.operation='RESERVE' THEN
    IF balance.on_hand-balance.reserved<NEW.quantity THEN
      RAISE EXCEPTION 'insufficient sellable inventory';
    END IF;
    UPDATE inventory_balances SET reserved=reserved+NEW.quantity,version=version+1,updated_at=now()
     WHERE tenant_id=NEW.tenant_id AND variant_id=NEW.variant_id;
  ELSIF NEW.operation='RELEASE' THEN
    IF balance.reserved<NEW.quantity THEN RAISE EXCEPTION 'inventory release exceeds reservation'; END IF;
    UPDATE inventory_balances SET reserved=reserved-NEW.quantity,version=version+1,updated_at=now()
     WHERE tenant_id=NEW.tenant_id AND variant_id=NEW.variant_id;
  ELSIF NEW.operation='CONSUME' THEN
    IF balance.reserved<NEW.quantity OR balance.on_hand<NEW.quantity THEN
      RAISE EXCEPTION 'inventory consume exceeds reservation';
    END IF;
    UPDATE inventory_balances SET on_hand=on_hand-NEW.quantity,reserved=reserved-NEW.quantity,
           version=version+1,updated_at=now()
     WHERE tenant_id=NEW.tenant_id AND variant_id=NEW.variant_id;
  ELSIF NEW.operation='INCREASE' THEN
    UPDATE inventory_balances SET on_hand=on_hand+NEW.quantity,version=version+1,updated_at=now()
     WHERE tenant_id=NEW.tenant_id AND variant_id=NEW.variant_id;
  ELSE
    IF balance.on_hand+NEW.quantity<balance.reserved OR balance.on_hand+NEW.quantity<0 THEN
      RAISE EXCEPTION 'inventory adjustment violates balance';
    END IF;
    UPDATE inventory_balances SET on_hand=on_hand+NEW.quantity,version=version+1,updated_at=now()
     WHERE tenant_id=NEW.tenant_id AND variant_id=NEW.variant_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER inventory_ledger_apply
BEFORE INSERT ON inventory_ledger
FOR EACH ROW EXECUTE FUNCTION app.apply_inventory_ledger_entry();

CREATE OR REPLACE FUNCTION app.apply_verification_use()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE entitlement verification_entitlements%ROWTYPE; prior verification_uses%ROWTYPE;
BEGIN
  SELECT * INTO prior FROM verification_uses
   WHERE tenant_id=NEW.tenant_id AND idempotency_key=NEW.idempotency_key;
  IF FOUND THEN
    IF prior.entitlement_id=NEW.entitlement_id AND prior.store_id=NEW.store_id AND
       prior.quantity=NEW.quantity AND prior.token_digest=NEW.token_digest THEN RETURN NULL; END IF;
    RAISE EXCEPTION 'verification idempotency conflict';
  END IF;
  SELECT * INTO entitlement FROM verification_entitlements
   WHERE tenant_id=NEW.tenant_id AND id=NEW.entitlement_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'verification entitlement is missing'; END IF;
  IF NEW.device_risk_level='BLOCKED' THEN RAISE EXCEPTION 'verification device is blocked'; END IF;
  IF NEW.token_digest IS NULL OR NEW.token_digest<>entitlement.verification_code_hash THEN
    RAISE EXCEPTION 'verification token is invalid';
  END IF;
  IF entitlement.status NOT IN ('AVAILABLE','PARTIALLY_USED') OR
     (entitlement.valid_from IS NOT NULL AND entitlement.valid_from>now()) OR
     (entitlement.valid_until IS NOT NULL AND entitlement.valid_until<=now()) THEN
    RAISE EXCEPTION 'verification entitlement is unavailable';
  END IF;
  IF cardinality(entitlement.allowed_store_ids)>0 AND
     NOT NEW.store_id=ANY(entitlement.allowed_store_ids) THEN
    RAISE EXCEPTION 'verification store is not allowed';
  END IF;
  IF entitlement.used_uses+NEW.quantity>entitlement.total_uses THEN
    RAISE EXCEPTION 'verification quantity exceeds remaining uses';
  END IF;
  UPDATE verification_entitlements
     SET used_uses=used_uses+NEW.quantity,
         status=CASE WHEN used_uses+NEW.quantity=total_uses THEN 'FULLY_USED' ELSE 'PARTIALLY_USED' END,
         version=version+1,updated_at=now()
   WHERE tenant_id=NEW.tenant_id AND id=NEW.entitlement_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER verification_use_apply
BEFORE INSERT ON verification_uses
FOR EACH ROW EXECUTE FUNCTION app.apply_verification_use();

CREATE OR REPLACE FUNCTION app.assert_refund_items_reconcile()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_refund uuid; requested bigint; item_total bigint;
BEGIN
  target_refund := CASE WHEN TG_TABLE_NAME='refunds' THEN NEW.id ELSE NEW.refund_id END;
  SELECT amount_cents INTO requested FROM refunds WHERE id=target_refund;
  SELECT COALESCE(sum(amount_cents),0) INTO item_total FROM refund_items WHERE refund_id=target_refund;
  IF requested IS NOT NULL AND requested <> item_total THEN
    RAISE EXCEPTION 'refund % items do not reconcile: expected %, got %',target_refund,requested,item_total;
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER refund_header_items_reconcile
AFTER INSERT OR UPDATE OF amount_cents ON refunds
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.assert_refund_items_reconcile();
CREATE CONSTRAINT TRIGGER refund_item_header_reconcile
AFTER INSERT ON refund_items
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.assert_refund_items_reconcile();

CREATE OR REPLACE FUNCTION app.assert_refund_scope()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE ordered_qty integer; prior_qty integer; line_total bigint; prior_amount bigint;
BEGIN
  SELECT quantity,line_amount_cents INTO ordered_qty,line_total
    FROM order_items WHERE tenant_id=NEW.tenant_id AND id=NEW.order_item_id;
  SELECT COALESCE(sum(item.quantity),0),COALESCE(sum(item.amount_cents),0)
    INTO prior_qty,prior_amount
    FROM refund_items item JOIN refunds refund
      ON refund.tenant_id=item.tenant_id AND refund.id=item.refund_id
   WHERE item.tenant_id=NEW.tenant_id AND item.order_item_id=NEW.order_item_id
     AND item.id<>NEW.id AND refund.status NOT IN ('FAILED','REJECTED');
  IF ordered_qty IS NULL OR prior_qty+NEW.quantity>ordered_qty OR
     prior_amount+NEW.amount_cents>line_total THEN
    RAISE EXCEPTION 'refund item exceeds original order scope';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER refund_item_scope_check
BEFORE INSERT ON refund_items
FOR EACH ROW EXECUTE FUNCTION app.assert_refund_scope();

ALTER TABLE merchant_payment_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY merchant_payment_accounts_tenant_isolation ON merchant_payment_accounts
  USING (tenant_id=app.current_tenant_id()) WITH CHECK (tenant_id=app.current_tenant_id());
ALTER TABLE order_state_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY order_state_history_tenant_isolation ON order_state_history
  USING (tenant_id=app.current_tenant_id()) WITH CHECK (tenant_id=app.current_tenant_id());
ALTER TABLE order_fulfillments ENABLE ROW LEVEL SECURITY;
CREATE POLICY order_fulfillments_tenant_isolation ON order_fulfillments
  USING (tenant_id=app.current_tenant_id()) WITH CHECK (tenant_id=app.current_tenant_id());
ALTER TABLE aftercare_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY aftercare_requests_tenant_isolation ON aftercare_requests
  USING (tenant_id=app.current_tenant_id()) WITH CHECK (tenant_id=app.current_tenant_id());
ALTER TABLE payment_callback_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY payment_callback_receipts_tenant_isolation ON payment_callback_receipts
  USING (tenant_id=app.current_tenant_id()) WITH CHECK (tenant_id=app.current_tenant_id());
ALTER TABLE refund_approvals ENABLE ROW LEVEL SECURITY;
CREATE POLICY refund_approvals_tenant_isolation ON refund_approvals
  USING (tenant_id=app.current_tenant_id()) WITH CHECK (tenant_id=app.current_tenant_id());
ALTER TABLE refund_provider_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY refund_provider_attempts_tenant_isolation ON refund_provider_attempts
  USING (tenant_id=app.current_tenant_id()) WITH CHECK (tenant_id=app.current_tenant_id());
ALTER TABLE commerce_reconciliation_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY commerce_reconciliation_batches_tenant_isolation ON commerce_reconciliation_batches
  USING (tenant_id=app.current_tenant_id()) WITH CHECK (tenant_id=app.current_tenant_id());
ALTER TABLE commerce_reconciliation_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY commerce_reconciliation_lines_tenant_isolation ON commerce_reconciliation_lines
  USING (tenant_id=app.current_tenant_id()) WITH CHECK (tenant_id=app.current_tenant_id());
ALTER TABLE commerce_reconciliation_discrepancies ENABLE ROW LEVEL SECURITY;
CREATE POLICY commerce_reconciliation_discrepancies_tenant_isolation ON commerce_reconciliation_discrepancies
  USING (tenant_id=app.current_tenant_id()) WITH CHECK (tenant_id=app.current_tenant_id());

INSERT INTO schema_migrations(version,checksum)
VALUES ('0013_commerce_fulfillment_and_reconciliation',encode(digest('lequbao-v6.1-0013','sha256'),'hex'))
ON CONFLICT (version) DO NOTHING;

COMMIT;
