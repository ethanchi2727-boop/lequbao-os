import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { createHash, randomUUID } from 'node:crypto'
import { ensureProviderDeliveryCase } from './provider-delivery-case-repository.js'

const DEFAULT_DATABASE_PATH = fileURLToPath(
  new URL('../data/lequ-life.sqlite', import.meta.url),
)

export function createDatabase(path = DEFAULT_DATABASE_PATH): DatabaseSync {
  if (path !== ':memory:') {
    mkdirSync(dirname(path), { recursive: true })
  }

  const database = new DatabaseSync(path)
  database.exec('PRAGMA foreign_keys = ON;')
  database.exec('PRAGMA busy_timeout = 5000;')
  if (path !== ':memory:') {
    database.exec('PRAGMA journal_mode = WAL;')
  }

  database.exec(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS tenants (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'SUSPENDED')),
      created_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS organizations (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      parent_id TEXT,
      type TEXT NOT NULL CHECK (type IN ('HQ', 'CITY', 'MERCHANT', 'STORE')),
      name TEXT NOT NULL,
      city_id TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id),
      FOREIGN KEY (parent_id) REFERENCES organizations(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'DISABLED')),
      created_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS memberships (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      tenant_id TEXT NOT NULL,
      organization_id TEXT NOT NULL,
      data_scope TEXT NOT NULL,
      city_ids_json TEXT NOT NULL,
      merchant_ids_json TEXT NOT NULL,
      store_ids_json TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'DISABLED')),
      created_at TEXT NOT NULL,
      UNIQUE (user_id, tenant_id),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id),
      FOREIGN KEY (organization_id) REFERENCES organizations(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS role_assignments (
      id TEXT PRIMARY KEY,
      membership_id TEXT NOT NULL,
      role TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE (membership_id, role),
      FOREIGN KEY (membership_id) REFERENCES memberships(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS auth_sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      tenant_id TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS consumer_cities (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      code TEXT NOT NULL,
      service_level TEXT NOT NULL CHECK (service_level IN ('FULL', 'DISCOVERY')),
      status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'PAUSED')),
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (tenant_id, code),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS consumer_households (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      owner_user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      default_city_id TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (tenant_id, owner_user_id),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id),
      FOREIGN KEY (owner_user_id) REFERENCES users(id),
      FOREIGN KEY (default_city_id) REFERENCES consumer_cities(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS consumer_household_members (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      household_id TEXT NOT NULL,
      linked_user_id TEXT,
      name TEXT NOT NULL,
      relation TEXT NOT NULL,
      mode TEXT NOT NULL CHECK (mode IN ('SELF', 'CHILD', 'ELDER')),
      avatar_key TEXT NOT NULL,
      subtitle TEXT NOT NULL,
      dietary_notes_json TEXT NOT NULL,
      permissions_json TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'PAUSED')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (household_id, name, relation),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id),
      FOREIGN KEY (household_id) REFERENCES consumer_households(id),
      FOREIGN KEY (linked_user_id) REFERENCES users(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS consumer_profiles (
      user_id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      display_name TEXT NOT NULL,
      phone_masked TEXT NOT NULL,
      customer_ref TEXT NOT NULL,
      preferred_city_id TEXT NOT NULL,
      active_household_id TEXT NOT NULL,
      active_household_member_id TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (tenant_id, customer_ref),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id),
      FOREIGN KEY (preferred_city_id) REFERENCES consumer_cities(id),
      FOREIGN KEY (active_household_id) REFERENCES consumer_households(id),
      FOREIGN KEY (active_household_member_id) REFERENCES consumer_household_members(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS consumer_store_publications (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      city_id TEXT NOT NULL,
      merchant_id TEXT NOT NULL,
      store_id TEXT NOT NULL UNIQUE,
      category TEXT NOT NULL,
      visibility_status TEXT NOT NULL CHECK (visibility_status IN ('PUBLISHED', 'PAUSED')),
      authorization_scope TEXT NOT NULL CHECK (authorization_scope = 'PLATFORM_DISPLAY'),
      authorization_snapshot_json TEXT NOT NULL,
      rating REAL NOT NULL CHECK (rating BETWEEN 0 AND 5),
      review_count INTEGER NOT NULL CHECK (review_count >= 0),
      distance_meters INTEGER NOT NULL CHECK (distance_meters >= 0),
      recommendation_reason TEXT NOT NULL,
      badges_json TEXT NOT NULL,
      tags_json TEXT NOT NULL,
      published_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id),
      FOREIGN KEY (store_id) REFERENCES merchant_stores(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS consumer_store_locations (
      store_id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      city_id TEXT NOT NULL,
      latitude REAL NOT NULL CHECK (latitude BETWEEN -90 AND 90),
      longitude REAL NOT NULL CHECK (longitude BETWEEN -180 AND 180),
      geocode_source TEXT NOT NULL,
      confidence REAL NOT NULL CHECK (confidence BETWEEN 0 AND 1),
      version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id),
      FOREIGN KEY (store_id) REFERENCES merchant_stores(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS consumer_deal_publications (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      city_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      spu_id TEXT NOT NULL,
      sku_id TEXT NOT NULL UNIQUE,
      kind TEXT NOT NULL CHECK (kind IN ('GROUP_BUY', 'RESERVATION')),
      status TEXT NOT NULL CHECK (status IN ('PUBLISHED', 'PAUSED')),
      valid_from TEXT NOT NULL,
      valid_until TEXT NOT NULL,
      usable_weekdays_json TEXT NOT NULL,
      daily_start_time TEXT NOT NULL,
      daily_end_time TEXT NOT NULL,
      refund_rule TEXT NOT NULL,
      redemption_rule TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
      published_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (store_id) REFERENCES merchant_stores(id),
      FOREIGN KEY (spu_id) REFERENCES merchant_spus(id),
      FOREIGN KEY (sku_id) REFERENCES merchant_skus(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS consumer_deal_drafts (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      city_id TEXT NOT NULL,
      household_member_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      offer_id TEXT NOT NULL,
      sku_id TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('GROUP_BUY', 'RESERVATION')),
      status TEXT NOT NULL CHECK (status = 'WAITING_CONFIRMATION'),
      title TEXT NOT NULL,
      sku_name TEXT NOT NULL,
      quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 10),
      service_at TEXT,
      unit_price_fen INTEGER NOT NULL CHECK (unit_price_fen >= 0),
      total_amount_fen INTEGER NOT NULL CHECK (total_amount_fen >= 0),
      pricing_rule_version TEXT NOT NULL,
      offer_version INTEGER NOT NULL CHECK (offer_version > 0),
      expires_at TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (household_member_id) REFERENCES consumer_household_members(id),
      FOREIGN KEY (store_id) REFERENCES merchant_stores(id),
      FOREIGN KEY (offer_id) REFERENCES consumer_deal_publications(id),
      FOREIGN KEY (sku_id) REFERENCES merchant_skus(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS consumer_deal_events (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      id TEXT NOT NULL UNIQUE,
      tenant_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      draft_id TEXT NOT NULL,
      type TEXT NOT NULL,
      summary TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (draft_id) REFERENCES consumer_deal_drafts(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS consumer_deal_checkout_states (
      draft_id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('WAITING_CONFIRMATION', 'CONFIRMED', 'EXPIRED')),
      order_id TEXT,
      payment_intent_id TEXT,
      version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
      confirmed_at TEXT,
      expired_at TEXT,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (draft_id) REFERENCES consumer_deal_drafts(id),
      FOREIGN KEY (order_id) REFERENCES merchant_orders(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS consumer_deal_payment_intents (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      draft_id TEXT NOT NULL UNIQUE,
      order_id TEXT NOT NULL UNIQUE,
      provider TEXT NOT NULL CHECK (provider = 'WECHAT_PAY'),
      currency TEXT NOT NULL CHECK (currency = 'CNY'),
      amount_fen INTEGER NOT NULL CHECK (amount_fen > 0),
      status TEXT NOT NULL CHECK (status IN ('PENDING_PROVIDER', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'LATE_SUCCEEDED')),
      provider_request_id TEXT NOT NULL UNIQUE,
      provider_transaction_id TEXT UNIQUE,
      failure_code TEXT,
      late_success INTEGER NOT NULL DEFAULT 0 CHECK (late_success IN (0, 1)),
      succeeded_at TEXT,
      failed_at TEXT,
      cancelled_at TEXT,
      version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (draft_id) REFERENCES consumer_deal_drafts(id),
      FOREIGN KEY (order_id) REFERENCES merchant_orders(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS consumer_deal_fulfillment_holds (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      draft_id TEXT NOT NULL UNIQUE,
      order_id TEXT NOT NULL UNIQUE,
      sku_id TEXT NOT NULL,
      slot_id TEXT,
      quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 10),
      status TEXT NOT NULL CHECK (status IN ('HELD', 'CONSUMED', 'RELEASED', 'FULFILLED')),
      expires_at TEXT NOT NULL,
      consumed_at TEXT,
      released_at TEXT,
      fulfilled_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (draft_id) REFERENCES consumer_deal_drafts(id),
      FOREIGN KEY (order_id) REFERENCES merchant_orders(id),
      FOREIGN KEY (sku_id) REFERENCES merchant_skus(id),
      FOREIGN KEY (slot_id) REFERENCES merchant_service_slots(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS consumer_deal_draft_slot_snapshots (
      draft_id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      slot_id TEXT NOT NULL,
      slot_version INTEGER NOT NULL CHECK (slot_version > 0),
      price_override_fen INTEGER CHECK (price_override_fen IS NULL OR price_override_fen >= 0),
      effective_unit_price_fen INTEGER NOT NULL CHECK (effective_unit_price_fen >= 0),
      service_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (draft_id) REFERENCES consumer_deal_drafts(id),
      FOREIGN KEY (slot_id) REFERENCES merchant_service_slots(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS consumer_deal_order_snapshots (
      draft_id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      order_id TEXT NOT NULL UNIQUE,
      offer_id TEXT NOT NULL,
      sku_id TEXT NOT NULL,
      unit_price_fen INTEGER NOT NULL CHECK (unit_price_fen >= 0),
      quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 10),
      total_amount_fen INTEGER NOT NULL CHECK (total_amount_fen >= 0),
      pricing_rule_version TEXT NOT NULL,
      offer_version INTEGER NOT NULL CHECK (offer_version > 0),
      terms_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (draft_id) REFERENCES consumer_deal_drafts(id),
      FOREIGN KEY (order_id) REFERENCES merchant_orders(id),
      FOREIGN KEY (offer_id) REFERENCES consumer_deal_publications(id),
      FOREIGN KEY (sku_id) REFERENCES merchant_skus(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS consumer_messages (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      household_member_id TEXT,
      category TEXT NOT NULL CHECK (category IN ('TRANSACTION', 'SERVICE', 'FAMILY', 'SYSTEM')),
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      action_label TEXT,
      action_target TEXT,
      read_at TEXT,
      version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
      created_at TEXT NOT NULL,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (household_member_id) REFERENCES consumer_household_members(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS consumer_household_tasks (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      household_id TEXT NOT NULL,
      household_member_id TEXT,
      title TEXT NOT NULL,
      detail TEXT NOT NULL,
      due_at TEXT,
      status TEXT NOT NULL CHECK (status IN ('PENDING', 'DONE', 'CANCELLED')),
      action_target TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id),
      FOREIGN KEY (household_id) REFERENCES consumer_households(id),
      FOREIGN KEY (household_member_id) REFERENCES consumer_household_members(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS consumer_entitlements (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      household_member_id TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('COUPON', 'MEMBERSHIP', 'SERVICE')),
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      value_fen INTEGER NOT NULL CHECK (value_fen >= 0),
      status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'USED', 'EXPIRED')),
      source TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (household_member_id) REFERENCES consumer_household_members(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS consumer_recent_services (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      household_member_id TEXT NOT NULL,
      code TEXT NOT NULL,
      title TEXT NOT NULL,
      icon TEXT NOT NULL,
      action_target TEXT NOT NULL,
      last_used_at TEXT NOT NULL,
      UNIQUE (user_id, household_member_id, code),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (household_member_id) REFERENCES consumer_household_members(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS consumer_search_history (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      id TEXT NOT NULL UNIQUE,
      tenant_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      household_member_id TEXT NOT NULL,
      city_id TEXT NOT NULL,
      query TEXT NOT NULL,
      normalized_query TEXT NOT NULL,
      result_count INTEGER NOT NULL CHECK (result_count >= 0),
      created_at TEXT NOT NULL,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (household_member_id) REFERENCES consumer_household_members(id),
      FOREIGN KEY (city_id) REFERENCES consumer_cities(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS consumer_context_events (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      id TEXT NOT NULL UNIQUE,
      tenant_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      from_city_id TEXT NOT NULL,
      to_city_id TEXT NOT NULL,
      from_member_id TEXT NOT NULL,
      to_member_id TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      summary TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (actor_id) REFERENCES users(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS consumer_assistant_sessions (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      city_id TEXT NOT NULL,
      household_member_id TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'ARCHIVED')),
      version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (city_id) REFERENCES consumer_cities(id),
      FOREIGN KEY (household_member_id) REFERENCES consumer_household_members(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS consumer_assistant_messages (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      id TEXT NOT NULL UNIQUE,
      tenant_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('USER', 'ASSISTANT')),
      content TEXT NOT NULL,
      prompt_hash TEXT,
      model_version TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (session_id) REFERENCES consumer_assistant_sessions(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS consumer_voice_inputs (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      city_id TEXT NOT NULL,
      household_member_id TEXT NOT NULL,
      session_id TEXT,
      file_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      byte_size INTEGER NOT NULL CHECK (byte_size > 0),
      duration_ms INTEGER NOT NULL CHECK (duration_ms BETWEEN 500 AND 60000),
      sha256 TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN (
        'PENDING_TRANSCRIPTION', 'READY_FOR_CONFIRMATION', 'CONFIRMED',
        'DISPATCHED', 'FAILED'
      )),
      provider_request_id TEXT NOT NULL UNIQUE,
      provider_event_id TEXT UNIQUE,
      raw_transcript TEXT,
      confirmed_transcript TEXT,
      confidence REAL CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
      failure_code TEXT,
      version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (city_id) REFERENCES consumer_cities(id),
      FOREIGN KEY (household_member_id) REFERENCES consumer_household_members(id),
      FOREIGN KEY (session_id) REFERENCES consumer_assistant_sessions(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS consumer_voice_blobs (
      voice_input_id TEXT PRIMARY KEY,
      content BLOB NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (voice_input_id) REFERENCES consumer_voice_inputs(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS consumer_voice_events (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      id TEXT NOT NULL UNIQUE,
      tenant_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      voice_input_id TEXT NOT NULL,
      provider_event_id TEXT,
      type TEXT NOT NULL,
      summary TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (voice_input_id) REFERENCES consumer_voice_inputs(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS consumer_image_inputs (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      city_id TEXT NOT NULL,
      household_member_id TEXT NOT NULL,
      session_id TEXT,
      file_name TEXT NOT NULL,
      mime_type TEXT NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
      byte_size INTEGER NOT NULL CHECK (byte_size > 0),
      width INTEGER NOT NULL CHECK (width > 0),
      height INTEGER NOT NULL CHECK (height > 0),
      sha256 TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN (
        'PENDING_RECOGNITION', 'READY_FOR_CONFIRMATION', 'CONFIRMED',
        'DISPATCHED', 'FAILED'
      )),
      provider_request_id TEXT NOT NULL UNIQUE,
      provider_event_id TEXT UNIQUE,
      category TEXT CHECK (category IS NULL OR category IN ('MENU', 'PRODUCT', 'RECEIPT', 'ENVIRONMENT', 'OTHER')),
      raw_description TEXT,
      confirmed_description TEXT,
      confidence REAL CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
      contains_sensitive_data INTEGER CHECK (contains_sensitive_data IS NULL OR contains_sensitive_data IN (0, 1)),
      failure_code TEXT,
      version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (city_id) REFERENCES consumer_cities(id),
      FOREIGN KEY (household_member_id) REFERENCES consumer_household_members(id),
      FOREIGN KEY (session_id) REFERENCES consumer_assistant_sessions(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS consumer_image_blobs (
      image_input_id TEXT PRIMARY KEY,
      content BLOB NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (image_input_id) REFERENCES consumer_image_inputs(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS consumer_image_events (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      id TEXT NOT NULL UNIQUE,
      tenant_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      image_input_id TEXT NOT NULL,
      provider_event_id TEXT,
      type TEXT NOT NULL,
      summary TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (image_input_id) REFERENCES consumer_image_inputs(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS consumer_reservation_drafts (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      city_id TEXT NOT NULL,
      household_member_id TEXT NOT NULL,
      merchant_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      item_summary TEXT NOT NULL,
      party_size INTEGER NOT NULL CHECK (party_size BETWEEN 1 AND 20),
      reservation_at TEXT NOT NULL,
      customer_name TEXT NOT NULL,
      customer_phone_masked TEXT NOT NULL,
      amount_fen INTEGER NOT NULL CHECK (amount_fen >= 0),
      status TEXT NOT NULL CHECK (status IN ('WAITING_CONFIRMATION', 'CONFIRMED')),
      order_id TEXT,
      version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (session_id) REFERENCES consumer_assistant_sessions(id),
      FOREIGN KEY (store_id) REFERENCES merchant_stores(id),
      FOREIGN KEY (order_id) REFERENCES merchant_orders(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS consumer_assistant_events (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      id TEXT NOT NULL UNIQUE,
      tenant_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      draft_id TEXT,
      type TEXT NOT NULL,
      risk_level TEXT NOT NULL CHECK (risk_level IN ('L0', 'L1', 'L2', 'L3')),
      actor_id TEXT NOT NULL,
      summary TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (session_id) REFERENCES consumer_assistant_sessions(id),
      FOREIGN KEY (draft_id) REFERENCES consumer_reservation_drafts(id),
      FOREIGN KEY (actor_id) REFERENCES users(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS consumer_payment_intents (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      draft_id TEXT NOT NULL,
      order_id TEXT NOT NULL,
      provider TEXT NOT NULL CHECK (provider IN ('WECHAT_PAY')),
      currency TEXT NOT NULL CHECK (currency IN ('CNY')),
      amount_fen INTEGER NOT NULL CHECK (amount_fen > 0),
      status TEXT NOT NULL CHECK (status IN ('PENDING_PROVIDER', 'SUCCEEDED', 'FAILED', 'CANCELLED')),
      provider_request_id TEXT NOT NULL UNIQUE,
      provider_transaction_id TEXT,
      failure_code TEXT,
      version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (draft_id) REFERENCES consumer_reservation_drafts(id),
      FOREIGN KEY (order_id) REFERENCES merchant_orders(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS consumer_payment_events (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      id TEXT NOT NULL UNIQUE,
      tenant_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      intent_id TEXT NOT NULL,
      order_id TEXT NOT NULL,
      provider_event_id TEXT UNIQUE,
      type TEXT NOT NULL,
      summary TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (intent_id) REFERENCES consumer_payment_intents(id),
      FOREIGN KEY (order_id) REFERENCES merchant_orders(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS consumer_refund_requests (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      draft_id TEXT NOT NULL,
      order_id TEXT NOT NULL,
      payment_intent_id TEXT NOT NULL,
      amount_fen INTEGER NOT NULL CHECK (amount_fen > 0),
      reason TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('REQUESTED', 'APPROVED_PENDING_PROVIDER', 'REFUNDED', 'FAILED')),
      provider_refund_id TEXT,
      version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (draft_id) REFERENCES consumer_reservation_drafts(id),
      FOREIGN KEY (order_id) REFERENCES merchant_orders(id),
      FOREIGN KEY (payment_intent_id) REFERENCES consumer_payment_intents(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS leads (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      city_id TEXT NOT NULL,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      source TEXT NOT NULL,
      contact_name TEXT NOT NULL,
      contact_phone_masked TEXT NOT NULL,
      address TEXT NOT NULL,
      owner_id TEXT NOT NULL,
      stage TEXT NOT NULL,
      protection_expires_at TEXT NOT NULL,
      dispute_status TEXT NOT NULL DEFAULT 'NONE',
      health_score INTEGER,
      loss_reason TEXT,
      next_action TEXT NOT NULL,
      next_action_at TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id),
      FOREIGN KEY (owner_id) REFERENCES users(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS lead_locations (
      lead_id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      city_id TEXT NOT NULL,
      latitude REAL NOT NULL CHECK (latitude BETWEEN -90 AND 90),
      longitude REAL NOT NULL CHECK (longitude BETWEEN -180 AND 180),
      district TEXT NOT NULL,
      geocode_source TEXT NOT NULL CHECK (
        geocode_source IN ('MANUAL', 'LOCAL_REFERENCE', 'PROVIDER')
      ),
      confidence REAL NOT NULL CHECK (confidence BETWEEN 0 AND 1),
      version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (lead_id) REFERENCES leads(id),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS lead_activities (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      id TEXT NOT NULL UNIQUE,
      tenant_id TEXT NOT NULL,
      lead_id TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      type TEXT NOT NULL,
      summary TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (lead_id) REFERENCES leads(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS lead_followups (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      lead_id TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      channel TEXT NOT NULL CHECK (channel IN ('PHONE', 'WECHAT', 'VISIT', 'VIDEO')),
      summary TEXT NOT NULL,
      next_action TEXT NOT NULL,
      next_action_at TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (lead_id) REFERENCES leads(id),
      FOREIGN KEY (actor_id) REFERENCES users(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS lead_collaborators (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      lead_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('CO_OWNER', 'DELIVERY_PARTNER', 'OBSERVER')),
      created_at TEXT NOT NULL,
      UNIQUE (lead_id, user_id),
      FOREIGN KEY (lead_id) REFERENCES leads(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS lead_appeals (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      lead_id TEXT NOT NULL,
      applicant_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      evidence_json TEXT NOT NULL,
      status TEXT NOT NULL,
      decision_by TEXT,
      decision_note TEXT,
      created_at TEXT NOT NULL,
      decided_at TEXT,
      FOREIGN KEY (lead_id) REFERENCES leads(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS lead_transfer_requests (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      city_id TEXT NOT NULL,
      lead_id TEXT NOT NULL,
      requested_by TEXT NOT NULL,
      current_owner_id TEXT NOT NULL,
      target_owner_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      evidence_json TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
      decision_by TEXT,
      decision_note TEXT,
      decided_at TEXT,
      lead_version_at_request INTEGER NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (lead_id) REFERENCES leads(id),
      FOREIGN KEY (requested_by) REFERENCES users(id),
      FOREIGN KEY (current_owner_id) REFERENCES users(id),
      FOREIGN KEY (target_owner_id) REFERENCES users(id),
      FOREIGN KEY (decision_by) REFERENCES users(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS lead_ownership_events (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      id TEXT NOT NULL UNIQUE,
      tenant_id TEXT NOT NULL,
      lead_id TEXT NOT NULL,
      request_id TEXT,
      actor_id TEXT NOT NULL,
      type TEXT NOT NULL CHECK (
        type IN (
          'TRANSFER_REQUESTED', 'TRANSFER_APPROVED', 'TRANSFER_REJECTED',
          'APPEAL_SUBMITTED', 'APPEAL_APPROVED', 'APPEAL_REJECTED'
        )
      ),
      summary TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (lead_id) REFERENCES leads(id),
      FOREIGN KEY (actor_id) REFERENCES users(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS provider_lead_assignment_events (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      id TEXT NOT NULL UNIQUE,
      tenant_id TEXT NOT NULL,
      city_id TEXT NOT NULL,
      lead_id TEXT NOT NULL,
      previous_owner_id TEXT NOT NULL,
      target_owner_id TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      lead_version INTEGER NOT NULL CHECK (lead_version > 1),
      rule_version TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id),
      FOREIGN KEY (lead_id) REFERENCES leads(id),
      FOREIGN KEY (previous_owner_id) REFERENCES users(id),
      FOREIGN KEY (target_owner_id) REFERENCES users(id),
      FOREIGN KEY (actor_id) REFERENCES users(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS sales_tasks (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      city_id TEXT NOT NULL,
      lead_id TEXT NOT NULL,
      owner_id TEXT NOT NULL,
      title TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (
        kind IN ('FOLLOW_UP', 'DIAGNOSIS', 'CONTRACT', 'ASSET', 'HANDOFF', 'REMINDER')
      ),
      priority TEXT NOT NULL CHECK (priority IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW')),
      status TEXT NOT NULL CHECK (status IN ('PENDING', 'SNOOZED', 'DONE', 'SUPERSEDED')),
      due_at TEXT NOT NULL,
      reminder_at TEXT NOT NULL,
      source TEXT NOT NULL CHECK (source IN ('LEAD_NEXT_ACTION', 'MANUAL')),
      source_ref TEXT NOT NULL,
      lead_version INTEGER NOT NULL,
      completion_note TEXT,
      completed_at TEXT,
      version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (tenant_id, source_ref),
      FOREIGN KEY (lead_id) REFERENCES leads(id),
      FOREIGN KEY (owner_id) REFERENCES users(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS sales_task_events (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      id TEXT NOT NULL UNIQUE,
      tenant_id TEXT NOT NULL,
      task_id TEXT NOT NULL,
      lead_id TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('CREATED', 'COMPLETED', 'SNOOZED', 'SUPERSEDED')),
      summary TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      FOREIGN KEY (task_id) REFERENCES sales_tasks(id),
      FOREIGN KEY (lead_id) REFERENCES leads(id),
      FOREIGN KEY (actor_id) REFERENCES users(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS sales_compensation_rules (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      version TEXT NOT NULL,
      category TEXT NOT NULL CHECK (category IN ('SIGNING', 'RENEWAL', 'TRANSACTION_SHARE')),
      basis TEXT NOT NULL,
      rate_bps INTEGER NOT NULL CHECK (rate_bps BETWEEN 0 AND 10000),
      status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'ARCHIVED')),
      effective_from TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE (tenant_id, version, category),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS sales_target_revisions (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      id TEXT NOT NULL UNIQUE,
      tenant_id TEXT NOT NULL,
      city_id TEXT NOT NULL,
      salesperson_id TEXT NOT NULL,
      period TEXT NOT NULL,
      signing_target_fen INTEGER NOT NULL CHECK (signing_target_fen >= 0),
      renewal_target_fen INTEGER NOT NULL CHECK (renewal_target_fen >= 0),
      transaction_target_fen INTEGER NOT NULL CHECK (transaction_target_fen >= 0),
      version INTEGER NOT NULL CHECK (version > 0),
      previous_revision_id TEXT,
      reason TEXT NOT NULL,
      set_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE (tenant_id, salesperson_id, period, version),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id),
      FOREIGN KEY (salesperson_id) REFERENCES users(id),
      FOREIGN KEY (previous_revision_id) REFERENCES sales_target_revisions(id),
      FOREIGN KEY (set_by) REFERENCES users(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS sales_commission_ledger (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      id TEXT NOT NULL UNIQUE,
      tenant_id TEXT NOT NULL,
      city_id TEXT NOT NULL,
      salesperson_id TEXT NOT NULL,
      lead_id TEXT,
      period TEXT NOT NULL,
      category TEXT NOT NULL CHECK (category IN ('SIGNING', 'RENEWAL', 'TRANSACTION_SHARE')),
      kind TEXT NOT NULL CHECK (kind IN ('RECOGNITION', 'SETTLEMENT', 'REVERSAL')),
      source_id TEXT NOT NULL,
      source_label TEXT NOT NULL,
      original_entry_id TEXT,
      performance_delta_fen INTEGER NOT NULL,
      estimated_commission_delta_fen INTEGER NOT NULL,
      settled_commission_delta_fen INTEGER NOT NULL,
      rule_version TEXT NOT NULL,
      rule_snapshot_json TEXT NOT NULL,
      reason TEXT NOT NULL,
      evidence_json TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id),
      FOREIGN KEY (salesperson_id) REFERENCES users(id),
      FOREIGN KEY (lead_id) REFERENCES leads(id),
      FOREIGN KEY (original_entry_id) REFERENCES sales_commission_ledger(id),
      FOREIGN KEY (actor_id) REFERENCES users(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS sales_team_units (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      city_id TEXT NOT NULL,
      parent_id TEXT,
      kind TEXT NOT NULL CHECK (kind IN ('CITY', 'SQUAD')),
      name TEXT NOT NULL,
      leader_id TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'ARCHIVED')),
      version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id),
      FOREIGN KEY (parent_id) REFERENCES sales_team_units(id),
      FOREIGN KEY (leader_id) REFERENCES users(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS sales_team_members (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      city_id TEXT NOT NULL,
      team_unit_id TEXT NOT NULL,
      salesperson_id TEXT NOT NULL,
      career_level TEXT NOT NULL CHECK (
        career_level IN ('ASSOCIATE', 'CONSULTANT', 'SENIOR', 'EXPERT', 'TEAM_LEAD')
      ),
      employment_status TEXT NOT NULL CHECK (
        employment_status IN ('ACTIVE', 'PROBATION', 'LEAVE')
      ),
      mentor_id TEXT,
      joined_at TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (tenant_id, salesperson_id),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id),
      FOREIGN KEY (team_unit_id) REFERENCES sales_team_units(id),
      FOREIGN KEY (salesperson_id) REFERENCES users(id),
      FOREIGN KEY (mentor_id) REFERENCES users(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS sales_performance_scorecards (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      id TEXT NOT NULL UNIQUE,
      tenant_id TEXT NOT NULL,
      city_id TEXT NOT NULL,
      salesperson_id TEXT NOT NULL,
      period TEXT NOT NULL,
      version INTEGER NOT NULL CHECK (version > 0),
      result_score INTEGER NOT NULL CHECK (result_score BETWEEN 0 AND 100),
      pipeline_score INTEGER NOT NULL CHECK (pipeline_score BETWEEN 0 AND 100),
      process_score INTEGER NOT NULL CHECK (process_score BETWEEN 0 AND 100),
      quality_score INTEGER NOT NULL CHECK (quality_score BETWEEN 0 AND 100),
      compliance_score INTEGER NOT NULL CHECK (compliance_score BETWEEN 0 AND 100),
      overall_score INTEGER NOT NULL CHECK (overall_score BETWEEN 0 AND 100),
      rating TEXT NOT NULL CHECK (
        rating IN ('OUTSTANDING', 'EXCEEDS', 'MEETS', 'DEVELOPING', 'ATTENTION')
      ),
      capability_snapshot_json TEXT NOT NULL,
      source_snapshot_json TEXT NOT NULL,
      model_version TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE (tenant_id, salesperson_id, period, version),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id),
      FOREIGN KEY (salesperson_id) REFERENCES users(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS sales_level_change_events (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      id TEXT NOT NULL UNIQUE,
      tenant_id TEXT NOT NULL,
      city_id TEXT NOT NULL,
      request_id TEXT NOT NULL,
      member_id TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('REQUESTED', 'APPROVED', 'REJECTED')),
      from_level TEXT NOT NULL CHECK (
        from_level IN ('ASSOCIATE', 'CONSULTANT', 'SENIOR', 'EXPERT', 'TEAM_LEAD')
      ),
      to_level TEXT NOT NULL CHECK (
        to_level IN ('ASSOCIATE', 'CONSULTANT', 'SENIOR', 'EXPERT', 'TEAM_LEAD')
      ),
      direction TEXT NOT NULL CHECK (direction IN ('PROMOTION', 'DEMOTION')),
      reason TEXT NOT NULL,
      evidence_json TEXT NOT NULL,
      metrics_snapshot_json TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id),
      FOREIGN KEY (member_id) REFERENCES sales_team_members(id),
      FOREIGN KEY (actor_id) REFERENCES users(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS sales_coaching_plans (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      city_id TEXT NOT NULL,
      member_id TEXT NOT NULL,
      coach_id TEXT NOT NULL,
      title TEXT NOT NULL,
      focus_capability TEXT NOT NULL CHECK (
        focus_capability IN ('DISCOVERY', 'DIAGNOSIS', 'PROPOSAL', 'NEGOTIATION', 'COMPLIANCE')
      ),
      goal TEXT NOT NULL,
      actions_json TEXT NOT NULL,
      success_metric TEXT NOT NULL,
      due_at TEXT NOT NULL,
      next_session_at TEXT,
      status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'COMPLETED', 'CANCELLED')),
      version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id),
      FOREIGN KEY (member_id) REFERENCES sales_team_members(id),
      FOREIGN KEY (coach_id) REFERENCES users(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS sales_coaching_events (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      id TEXT NOT NULL UNIQUE,
      tenant_id TEXT NOT NULL,
      city_id TEXT NOT NULL,
      plan_id TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('CREATED', 'CHECK_IN', 'COMPLETED', 'CANCELLED')),
      note TEXT NOT NULL,
      evidence_json TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id),
      FOREIGN KEY (plan_id) REFERENCES sales_coaching_plans(id),
      FOREIGN KEY (actor_id) REFERENCES users(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS sales_ai_sessions (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      city_id TEXT NOT NULL,
      lead_id TEXT NOT NULL,
      owner_id TEXT NOT NULL,
      mode TEXT NOT NULL CHECK (mode IN ('ARTIFACT', 'ROLEPLAY')),
      objection_type TEXT CHECK (
        objection_type IS NULL OR objection_type IN (
          'PRICE', 'ROI', 'TIMING', 'AUTHORITY', 'COMPETITOR'
        )
      ),
      scenario TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'COMPLETED')),
      model_version TEXT NOT NULL,
      prompt_version TEXT NOT NULL,
      policy_version TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id),
      FOREIGN KEY (lead_id) REFERENCES leads(id),
      FOREIGN KEY (owner_id) REFERENCES users(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS sales_ai_artifact_revisions (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      id TEXT NOT NULL UNIQUE,
      artifact_key TEXT NOT NULL,
      session_id TEXT NOT NULL,
      tenant_id TEXT NOT NULL,
      city_id TEXT NOT NULL,
      lead_id TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (
        kind IN (
          'PRE_VISIT_BRIEF', 'TALK_TRACK', 'MEETING_SUMMARY',
          'NEXT_ACTION', 'PROPOSAL'
        )
      ),
      revision INTEGER NOT NULL CHECK (revision > 0),
      status TEXT NOT NULL CHECK (status IN ('DRAFT', 'CONFIRMED')),
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      content_json TEXT NOT NULL,
      evidence_json TEXT NOT NULL,
      guardrails_json TEXT NOT NULL,
      model_version TEXT NOT NULL,
      prompt_version TEXT NOT NULL,
      policy_version TEXT NOT NULL,
      generated_by TEXT NOT NULL,
      confirmed_by TEXT,
      confirmed_at TEXT,
      created_at TEXT NOT NULL,
      UNIQUE (artifact_key, revision),
      FOREIGN KEY (session_id) REFERENCES sales_ai_sessions(id),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id),
      FOREIGN KEY (lead_id) REFERENCES leads(id),
      FOREIGN KEY (generated_by) REFERENCES users(id),
      FOREIGN KEY (confirmed_by) REFERENCES users(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS sales_ai_roleplay_turns (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      id TEXT NOT NULL UNIQUE,
      tenant_id TEXT NOT NULL,
      city_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      actor TEXT NOT NULL CHECK (actor IN ('CUSTOMER', 'SALES', 'COACH')),
      content TEXT NOT NULL,
      evaluation_json TEXT,
      model_version TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id),
      FOREIGN KEY (session_id) REFERENCES sales_ai_sessions(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS sales_ai_events (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      id TEXT NOT NULL UNIQUE,
      tenant_id TEXT NOT NULL,
      city_id TEXT NOT NULL,
      lead_id TEXT NOT NULL,
      session_id TEXT,
      artifact_key TEXT,
      type TEXT NOT NULL CHECK (
        type IN (
          'ARTIFACT_GENERATED', 'ARTIFACT_CONFIRMED',
          'ROLEPLAY_STARTED', 'ROLEPLAY_TURN_EVALUATED'
        )
      ),
      actor_id TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id),
      FOREIGN KEY (lead_id) REFERENCES leads(id),
      FOREIGN KEY (session_id) REFERENCES sales_ai_sessions(id),
      FOREIGN KEY (actor_id) REFERENCES users(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS diagnosis_reports (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      lead_id TEXT NOT NULL,
      score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 100),
      grade TEXT NOT NULL,
      findings_json TEXT NOT NULL,
      proposal_json TEXT NOT NULL,
      model_version TEXT NOT NULL,
      status TEXT NOT NULL,
      generated_at TEXT NOT NULL,
      UNIQUE (lead_id),
      FOREIGN KEY (lead_id) REFERENCES leads(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS contract_drafts (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      lead_id TEXT NOT NULL,
      package_code TEXT NOT NULL,
      billing_cycle TEXT NOT NULL,
      list_price_fen INTEGER NOT NULL CHECK (list_price_fen >= 0),
      discount_bps INTEGER NOT NULL CHECK (discount_bps BETWEEN 0 AND 10000),
      final_price_fen INTEGER NOT NULL CHECK (final_price_fen >= 0),
      discount_status TEXT NOT NULL,
      status TEXT NOT NULL,
      contract_version TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      signed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (lead_id),
      FOREIGN KEY (lead_id) REFERENCES leads(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS contract_authorizations (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      contract_id TEXT NOT NULL,
      scope TEXT NOT NULL,
      label TEXT NOT NULL,
      status TEXT NOT NULL,
      granted_at TEXT NOT NULL,
      revoked_at TEXT,
      UNIQUE (contract_id, scope),
      FOREIGN KEY (contract_id) REFERENCES contract_drafts(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS onboarding_assets (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      lead_id TEXT NOT NULL,
      asset_type TEXT NOT NULL,
      file_name TEXT NOT NULL,
      confidence REAL NOT NULL CHECK (confidence BETWEEN 0 AND 1),
      ocr_json TEXT NOT NULL,
      corrected_json TEXT,
      status TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (lead_id, asset_type),
      FOREIGN KEY (lead_id) REFERENCES leads(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS onboarding_asset_blobs (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      asset_id TEXT NOT NULL,
      upload_version INTEGER NOT NULL,
      mime_type TEXT NOT NULL,
      byte_size INTEGER NOT NULL CHECK (byte_size > 0),
      sha256 TEXT NOT NULL,
      content BLOB NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE (asset_id, upload_version),
      FOREIGN KEY (asset_id) REFERENCES onboarding_assets(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS miniapp_factory_projects (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      city_id TEXT NOT NULL,
      lead_id TEXT NOT NULL UNIQUE,
      merchant_name TEXT NOT NULL,
      delivery_type TEXT NOT NULL CHECK (delivery_type IN ('MERCHANT_PAGE', 'STANDARD_MINIAPP', 'CHAIN_ENTERPRISE')),
      status TEXT NOT NULL,
      template_code TEXT NOT NULL,
      current_draft_version INTEGER NOT NULL DEFAULT 0,
      current_release_version INTEGER,
      next_action TEXT NOT NULL,
      sla_due_at TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id),
      FOREIGN KEY (lead_id) REFERENCES leads(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS miniapp_factory_versions (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      version INTEGER NOT NULL,
      status TEXT NOT NULL,
      template_code TEXT NOT NULL,
      schema_json TEXT NOT NULL,
      content_json TEXT NOT NULL,
      theme_json TEXT NOT NULL,
      preview_path TEXT NOT NULL,
      merchant_approved_by TEXT,
      merchant_approved_at TEXT,
      reviewed_at TEXT,
      gray_at TEXT,
      published_at TEXT,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE (project_id, version),
      FOREIGN KEY (project_id) REFERENCES miniapp_factory_projects(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS miniapp_factory_events (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      id TEXT NOT NULL UNIQUE,
      tenant_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      type TEXT NOT NULL,
      summary TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES miniapp_factory_projects(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS provider_delivery_cases (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      city_id TEXT NOT NULL,
      lead_id TEXT NOT NULL UNIQUE,
      owner_id TEXT NOT NULL,
      priority TEXT NOT NULL CHECK (priority IN ('CRITICAL', 'HIGH', 'NORMAL')),
      target_due_at TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id),
      FOREIGN KEY (lead_id) REFERENCES leads(id),
      FOREIGN KEY (owner_id) REFERENCES users(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS provider_delivery_case_events (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      id TEXT NOT NULL UNIQUE,
      tenant_id TEXT NOT NULL,
      case_id TEXT NOT NULL,
      lead_id TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      type TEXT NOT NULL CHECK (
        type IN ('CASE_CREATED', 'OWNER_ASSIGNED', 'PRIORITY_CHANGED')
      ),
      summary TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (case_id) REFERENCES provider_delivery_cases(id),
      FOREIGN KEY (lead_id) REFERENCES leads(id),
      FOREIGN KEY (actor_id) REFERENCES users(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS provider_delivery_work_orders (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      city_id TEXT NOT NULL,
      case_id TEXT NOT NULL,
      lead_id TEXT NOT NULL,
      type TEXT NOT NULL CHECK (
        type IN (
          'ASSET_COLLECTION', 'MINIAPP_CONFIGURATION', 'MERCHANT_REVIEW',
          'PLATFORM_REVIEW', 'GEO_OPTIMIZATION', 'SKILL_ACTIVATION',
          'DELIVERY_ACCEPTANCE', 'OTHER'
        )
      ),
      stage TEXT NOT NULL CHECK (
        stage IN (
          'WAITING_CAPTURE', 'CAPTURING', 'MINIAPP_GENERATING',
          'MERCHANT_CONFIRMATION', 'REVIEWING', 'LIVE',
          'GEO_SERVICING', 'SKILL_GENERATING', 'DELIVERED'
        )
      ),
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL CHECK (
        status IN (
          'OPEN', 'IN_PROGRESS', 'WAITING_MERCHANT',
          'CHANGES_REQUESTED', 'COMPLETED'
        )
      ),
      priority TEXT NOT NULL CHECK (priority IN ('CRITICAL', 'HIGH', 'NORMAL')),
      owner_id TEXT NOT NULL,
      due_at TEXT NOT NULL,
      confirmation_required INTEGER NOT NULL CHECK (confirmation_required IN (0, 1)),
      submitted_at TEXT,
      completed_at TEXT,
      version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (case_id) REFERENCES provider_delivery_cases(id),
      FOREIGN KEY (lead_id) REFERENCES leads(id),
      FOREIGN KEY (owner_id) REFERENCES users(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS provider_delivery_work_order_attachments (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      id TEXT NOT NULL UNIQUE,
      tenant_id TEXT NOT NULL,
      work_order_id TEXT NOT NULL,
      category TEXT NOT NULL CHECK (
        category IN ('EVIDENCE', 'DELIVERABLE', 'MERCHANT_FEEDBACK')
      ),
      file_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      byte_size INTEGER NOT NULL CHECK (byte_size > 0),
      sha256 TEXT NOT NULL,
      content BLOB NOT NULL,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE (work_order_id, sha256),
      FOREIGN KEY (work_order_id) REFERENCES provider_delivery_work_orders(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS provider_delivery_work_order_confirmations (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      id TEXT NOT NULL UNIQUE,
      tenant_id TEXT NOT NULL,
      work_order_id TEXT NOT NULL,
      decision TEXT NOT NULL CHECK (decision IN ('APPROVED', 'CHANGES_REQUESTED')),
      confirmer_name TEXT NOT NULL,
      confirmer_role TEXT NOT NULL,
      comment TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      work_order_version INTEGER NOT NULL CHECK (work_order_version > 0),
      created_at TEXT NOT NULL,
      FOREIGN KEY (work_order_id) REFERENCES provider_delivery_work_orders(id),
      FOREIGN KEY (actor_id) REFERENCES users(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS provider_delivery_work_order_events (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      id TEXT NOT NULL UNIQUE,
      tenant_id TEXT NOT NULL,
      work_order_id TEXT NOT NULL,
      case_id TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      type TEXT NOT NULL CHECK (
        type IN (
          'CREATED', 'ASSIGNED', 'STARTED', 'ATTACHMENT_ADDED',
          'SUBMITTED', 'MERCHANT_APPROVED',
          'MERCHANT_CHANGES_REQUESTED', 'RESUMED'
        )
      ),
      summary TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (work_order_id) REFERENCES provider_delivery_work_orders(id),
      FOREIGN KEY (case_id) REFERENCES provider_delivery_cases(id),
      FOREIGN KEY (actor_id) REFERENCES users(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS provider_delivery_sla_incidents (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      city_id TEXT NOT NULL,
      work_order_id TEXT NOT NULL UNIQUE,
      case_id TEXT NOT NULL,
      lead_id TEXT NOT NULL,
      level INTEGER NOT NULL CHECK (level BETWEEN 1 AND 3),
      status TEXT NOT NULL CHECK (status IN ('OPEN', 'ACKNOWLEDGED', 'RESOLVED')),
      due_at TEXT NOT NULL,
      breached_at TEXT NOT NULL,
      response_plan TEXT,
      acknowledged_by TEXT,
      acknowledged_at TEXT,
      resolved_by TEXT,
      resolved_at TEXT,
      resolution_note TEXT,
      version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
      policy_version TEXT NOT NULL,
      first_detected_at TEXT NOT NULL,
      last_escalated_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (work_order_id) REFERENCES provider_delivery_work_orders(id),
      FOREIGN KEY (case_id) REFERENCES provider_delivery_cases(id),
      FOREIGN KEY (lead_id) REFERENCES leads(id),
      FOREIGN KEY (acknowledged_by) REFERENCES users(id),
      FOREIGN KEY (resolved_by) REFERENCES users(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS provider_delivery_sla_events (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      id TEXT NOT NULL UNIQUE,
      tenant_id TEXT NOT NULL,
      incident_id TEXT NOT NULL,
      work_order_id TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      type TEXT NOT NULL CHECK (
        type IN ('DETECTED', 'ESCALATED', 'ACKNOWLEDGED', 'RESOLVED')
      ),
      level INTEGER NOT NULL CHECK (level BETWEEN 1 AND 3),
      summary TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE (incident_id, type, level),
      FOREIGN KEY (incident_id) REFERENCES provider_delivery_sla_incidents(id),
      FOREIGN KEY (work_order_id) REFERENCES provider_delivery_work_orders(id),
      FOREIGN KEY (actor_id) REFERENCES users(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS provider_renewal_cases (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      city_id TEXT NOT NULL,
      lead_id TEXT NOT NULL,
      source TEXT NOT NULL CHECK (source IN ('SIGNED_CONTRACT', 'LEGACY_IMPORT')),
      source_contract_id TEXT,
      current_package_code TEXT NOT NULL CHECK (
        current_package_code IN ('BASIC', 'PRO', 'AGENT', 'CHAIN')
      ),
      current_price_fen INTEGER NOT NULL CHECK (current_price_fen >= 0),
      service_started_at TEXT NOT NULL,
      service_ends_at TEXT NOT NULL,
      status TEXT NOT NULL CHECK (
        status IN ('MONITORING', 'PROPOSAL_READY', 'RENEWED', 'LOST')
      ),
      owner_id TEXT NOT NULL,
      loss_reason TEXT CHECK (
        loss_reason IS NULL OR loss_reason IN (
          'PRICE', 'LOW_USAGE', 'SERVICE_GAP', 'BUSINESS_CLOSED',
          'COMPETITOR', 'CASH_FLOW', 'TIMING', 'OTHER'
        )
      ),
      loss_detail TEXT,
      recoverable INTEGER CHECK (recoverable IS NULL OR recoverable IN (0, 1)),
      recovery_action TEXT,
      renewed_package_code TEXT CHECK (
        renewed_package_code IS NULL OR
        renewed_package_code IN ('BASIC', 'PRO', 'AGENT', 'CHAIN')
      ),
      renewed_price_fen INTEGER CHECK (
        renewed_price_fen IS NULL OR renewed_price_fen >= 0
      ),
      renewed_at TEXT,
      version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
      policy_version TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (lead_id, service_ends_at),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id),
      FOREIGN KEY (lead_id) REFERENCES leads(id),
      FOREIGN KEY (source_contract_id) REFERENCES contract_drafts(id),
      FOREIGN KEY (owner_id) REFERENCES users(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS provider_renewal_proposals (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      id TEXT NOT NULL UNIQUE,
      tenant_id TEXT NOT NULL,
      case_id TEXT NOT NULL,
      version INTEGER NOT NULL CHECK (version > 0),
      current_package_code TEXT NOT NULL CHECK (
        current_package_code IN ('BASIC', 'PRO', 'AGENT', 'CHAIN')
      ),
      recommended_package_code TEXT NOT NULL CHECK (
        recommended_package_code IN ('BASIC', 'PRO', 'AGENT', 'CHAIN')
      ),
      list_price_fen INTEGER NOT NULL CHECK (list_price_fen >= 0),
      offer_price_fen INTEGER NOT NULL CHECK (offer_price_fen >= 0),
      discount_bps INTEGER NOT NULL CHECK (discount_bps BETWEEN 0 AND 3000),
      recommendation TEXT NOT NULL,
      value_narrative TEXT NOT NULL,
      evidence_json TEXT NOT NULL,
      evidence_snapshot_json TEXT NOT NULL,
      policy_version TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE (case_id, version),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id),
      FOREIGN KEY (case_id) REFERENCES provider_renewal_cases(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS provider_renewal_events (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      id TEXT NOT NULL UNIQUE,
      tenant_id TEXT NOT NULL,
      case_id TEXT NOT NULL,
      lead_id TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      type TEXT NOT NULL CHECK (
        type IN (
          'CASE_CREATED', 'REMINDER_30', 'REMINDER_15', 'REMINDER_7',
          'REMINDER_1', 'PROPOSAL_GENERATED', 'RENEWED', 'LOST'
        )
      ),
      dedupe_key TEXT NOT NULL UNIQUE,
      summary TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (case_id) REFERENCES provider_renewal_cases(id),
      FOREIGN KEY (lead_id) REFERENCES leads(id),
      FOREIGN KEY (actor_id) REFERENCES users(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS provider_city_settlement_rules (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      version TEXT NOT NULL,
      signing_share_bps INTEGER NOT NULL CHECK (signing_share_bps BETWEEN 0 AND 10000),
      renewal_share_bps INTEGER NOT NULL CHECK (renewal_share_bps BETWEEN 0 AND 10000),
      transaction_share_bps INTEGER NOT NULL CHECK (transaction_share_bps BETWEEN 0 AND 10000),
      status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'ARCHIVED')),
      effective_from TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE (tenant_id, version),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS provider_city_settlement_statements (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      city_id TEXT NOT NULL,
      period TEXT NOT NULL,
      status TEXT NOT NULL CHECK (
        status IN (
          'PENDING_INVOICE', 'INVOICE_SUBMITTED',
          'READY_FOR_SETTLEMENT', 'SETTLED'
        )
      ),
      currency TEXT NOT NULL CHECK (currency = 'CNY'),
      signing_revenue_fen INTEGER NOT NULL,
      renewal_revenue_fen INTEGER NOT NULL,
      transaction_gmv_fen INTEGER NOT NULL,
      subscription_share_fen INTEGER NOT NULL,
      renewal_share_fen INTEGER NOT NULL,
      transaction_service_share_fen INTEGER NOT NULL,
      approved_adjustment_fen INTEGER NOT NULL DEFAULT 0,
      payable_fen INTEGER NOT NULL,
      rule_version TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
      generated_by TEXT NOT NULL,
      generated_at TEXT NOT NULL,
      settled_by TEXT,
      settled_at TEXT,
      updated_at TEXT NOT NULL,
      UNIQUE (tenant_id, city_id, period),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id),
      FOREIGN KEY (generated_by) REFERENCES users(id),
      FOREIGN KEY (settled_by) REFERENCES users(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS provider_city_settlement_adjustments (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      city_id TEXT NOT NULL,
      statement_id TEXT NOT NULL,
      direction TEXT NOT NULL CHECK (direction IN ('CREDIT', 'DEBIT')),
      amount_fen INTEGER NOT NULL CHECK (amount_fen > 0),
      status TEXT NOT NULL CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
      reason TEXT NOT NULL,
      evidence_json TEXT NOT NULL,
      requested_by TEXT NOT NULL,
      requested_at TEXT NOT NULL,
      decided_by TEXT,
      decision_note TEXT,
      decided_at TEXT,
      FOREIGN KEY (statement_id) REFERENCES provider_city_settlement_statements(id),
      FOREIGN KEY (requested_by) REFERENCES users(id),
      FOREIGN KEY (decided_by) REFERENCES users(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS provider_city_settlement_invoices (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      city_id TEXT NOT NULL,
      statement_id TEXT NOT NULL,
      invoice_no TEXT NOT NULL,
      seller_name TEXT NOT NULL,
      seller_tax_id_masked TEXT NOT NULL,
      amount_fen INTEGER NOT NULL CHECK (amount_fen > 0),
      issued_at TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('SUBMITTED', 'VERIFIED', 'REJECTED')),
      submitted_by TEXT NOT NULL,
      submitted_at TEXT NOT NULL,
      decided_by TEXT,
      decision_note TEXT,
      decided_at TEXT,
      UNIQUE (tenant_id, invoice_no),
      FOREIGN KEY (statement_id) REFERENCES provider_city_settlement_statements(id),
      FOREIGN KEY (submitted_by) REFERENCES users(id),
      FOREIGN KEY (decided_by) REFERENCES users(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS provider_city_settlement_ledger (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      id TEXT NOT NULL UNIQUE,
      tenant_id TEXT NOT NULL,
      city_id TEXT NOT NULL,
      statement_id TEXT NOT NULL,
      category TEXT NOT NULL CHECK (
        category IN (
          'SUBSCRIPTION_SHARE', 'RENEWAL_SHARE',
          'TRANSACTION_SERVICE_SHARE', 'ADJUSTMENT'
        )
      ),
      direction TEXT NOT NULL CHECK (direction IN ('CREDIT', 'DEBIT')),
      amount_fen INTEGER NOT NULL CHECK (amount_fen >= 0),
      source_id TEXT NOT NULL,
      source_label TEXT NOT NULL,
      rule_version TEXT NOT NULL,
      rule_snapshot_json TEXT NOT NULL,
      evidence_json TEXT NOT NULL,
      posted_by TEXT NOT NULL,
      posted_at TEXT NOT NULL,
      UNIQUE (statement_id, category, direction, source_id),
      FOREIGN KEY (statement_id) REFERENCES provider_city_settlement_statements(id),
      FOREIGN KEY (posted_by) REFERENCES users(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS provider_city_settlement_events (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      id TEXT NOT NULL UNIQUE,
      tenant_id TEXT NOT NULL,
      city_id TEXT NOT NULL,
      statement_id TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      type TEXT NOT NULL CHECK (
        type IN (
          'STATEMENT_GENERATED', 'STATEMENT_REFRESHED',
          'ADJUSTMENT_REQUESTED', 'ADJUSTMENT_APPROVED',
          'ADJUSTMENT_REJECTED', 'INVOICE_SUBMITTED',
          'INVOICE_VERIFIED', 'INVOICE_REJECTED', 'SETTLED'
        )
      ),
      dedupe_key TEXT NOT NULL UNIQUE,
      summary TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (statement_id) REFERENCES provider_city_settlement_statements(id),
      FOREIGN KEY (actor_id) REFERENCES users(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS geo_workspaces (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      city_id TEXT NOT NULL,
      project_id TEXT NOT NULL UNIQUE,
      lead_id TEXT NOT NULL UNIQUE,
      merchant_name TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('PENDING', 'SCANNING', 'ISSUE_FOUND', 'FIX_PROPOSED', 'MERCHANT_APPROVAL', 'PUBLISHED', 'MONITORING')),
      score INTEGER CHECK (score BETWEEN 0 AND 100),
      previous_score INTEGER CHECK (previous_score BETWEEN 0 AND 100),
      current_scan_version INTEGER NOT NULL DEFAULT 0,
      next_action TEXT NOT NULL,
      compliance_notice TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES miniapp_factory_projects(id),
      FOREIGN KEY (lead_id) REFERENCES leads(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS geo_identities (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      workspace_id TEXT NOT NULL UNIQUE,
      brand_name TEXT NOT NULL,
      store_name TEXT NOT NULL,
      canonical_poi_id TEXT NOT NULL,
      aliases_json TEXT NOT NULL,
      address TEXT NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      match_status TEXT NOT NULL CHECK (match_status IN ('MATCHED', 'NEEDS_REVIEW')),
      source TEXT NOT NULL,
      confidence REAL NOT NULL CHECK (confidence BETWEEN 0 AND 1),
      version INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (workspace_id) REFERENCES geo_workspaces(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS geo_facts (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      field_key TEXT NOT NULL,
      field_label TEXT NOT NULL,
      value_text TEXT NOT NULL,
      source_type TEXT NOT NULL,
      source_ref TEXT NOT NULL,
      confidence REAL NOT NULL CHECK (confidence BETWEEN 0 AND 1),
      verification_status TEXT NOT NULL CHECK (verification_status IN ('VERIFIED', 'INFERRED', 'NEEDS_REVIEW')),
      version INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL,
      UNIQUE (workspace_id, field_key, source_ref),
      FOREIGN KEY (workspace_id) REFERENCES geo_workspaces(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS geo_channel_snapshots (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      scan_version INTEGER NOT NULL,
      channel TEXT NOT NULL CHECK (channel IN ('MERCHANT_PROFILE', 'MINIAPP', 'MAP_A', 'MAP_B')),
      field_key TEXT NOT NULL,
      field_label TEXT NOT NULL,
      canonical_value TEXT NOT NULL,
      observed_value TEXT NOT NULL,
      consistency_status TEXT NOT NULL CHECK (consistency_status IN ('CONSISTENT', 'DIFF', 'MISSING')),
      captured_at TEXT NOT NULL,
      UNIQUE (workspace_id, scan_version, channel, field_key),
      FOREIGN KEY (workspace_id) REFERENCES geo_workspaces(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS geo_score_snapshots (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      scan_version INTEGER NOT NULL,
      total_score INTEGER NOT NULL CHECK (total_score BETWEEN 0 AND 100),
      dimensions_json TEXT NOT NULL,
      rule_version TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE (workspace_id, scan_version),
      FOREIGN KEY (workspace_id) REFERENCES geo_workspaces(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS geo_issues (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      scan_version INTEGER NOT NULL,
      dimension_key TEXT NOT NULL,
      code TEXT NOT NULL,
      title TEXT NOT NULL,
      severity TEXT NOT NULL CHECK (severity IN ('HIGH', 'MEDIUM', 'LOW')),
      channel TEXT NOT NULL,
      field_key TEXT NOT NULL,
      current_value TEXT NOT NULL,
      recommended_value TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('OPEN', 'FIX_PROPOSED', 'APPROVED', 'PUBLISHED', 'DISMISSED')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (workspace_id, scan_version, code),
      FOREIGN KEY (workspace_id) REFERENCES geo_workspaces(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS geo_content_plans (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      version INTEGER NOT NULL,
      question_terms_json TEXT NOT NULL,
      scenario_terms_json TEXT NOT NULL,
      items_json TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('GENERATED', 'APPROVED', 'PUBLISHED')),
      model_version TEXT NOT NULL,
      approved_by TEXT,
      approved_at TEXT,
      created_at TEXT NOT NULL,
      UNIQUE (workspace_id, version),
      FOREIGN KEY (workspace_id) REFERENCES geo_workspaces(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS geo_observations (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      observation_date TEXT NOT NULL,
      channel TEXT NOT NULL,
      mentions INTEGER NOT NULL CHECK (mentions >= 0),
      visits INTEGER NOT NULL CHECK (visits >= 0),
      inquiries INTEGER NOT NULL CHECK (inquiries >= 0),
      orders INTEGER NOT NULL CHECK (orders >= 0),
      attribution_model TEXT NOT NULL,
      source TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE (workspace_id, observation_date, channel),
      FOREIGN KEY (workspace_id) REFERENCES geo_workspaces(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS geo_events (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      id TEXT NOT NULL UNIQUE,
      tenant_id TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      type TEXT NOT NULL,
      summary TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (workspace_id) REFERENCES geo_workspaces(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS skill_suites (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      city_id TEXT NOT NULL,
      geo_workspace_id TEXT NOT NULL UNIQUE,
      lead_id TEXT NOT NULL UNIQUE,
      merchant_name TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('DRAFT', 'GENERATED', 'TESTED', 'CERT_PENDING', 'CERTIFIED', 'GRAY', 'ONLINE', 'PAUSED')),
      next_action TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (geo_workspace_id) REFERENCES geo_workspaces(id),
      FOREIGN KEY (lead_id) REFERENCES leads(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS skill_network_versions (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      suite_id TEXT NOT NULL,
      skill_id TEXT NOT NULL,
      name TEXT NOT NULL CHECK (name IN ('get_menu', 'find_table', 'reserve_table')),
      semver TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('GENERATED', 'TESTED', 'CERT_PENDING', 'CERTIFIED', 'GRAY', 'ONLINE', 'PAUSED', 'DEPRECATED')),
      maturity TEXT NOT NULL CHECK (maturity IN ('L1', 'L2', 'L3', 'L4')),
      manifest_json TEXT NOT NULL,
      schema_hash TEXT NOT NULL,
      certified_by TEXT,
      certified_at TEXT,
      published_at TEXT,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE (suite_id, skill_id, semver),
      FOREIGN KEY (suite_id) REFERENCES skill_suites(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS skill_test_runs (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      suite_id TEXT NOT NULL,
      skill_version_id TEXT NOT NULL,
      test_type TEXT NOT NULL CHECK (test_type IN ('INPUT_SCHEMA', 'OUTPUT_SCHEMA', 'ADAPTER_CONTRACT', 'RISK_POLICY')),
      status TEXT NOT NULL CHECK (status IN ('PASSED', 'FAILED')),
      latency_ms INTEGER NOT NULL CHECK (latency_ms >= 0),
      assertion_count INTEGER NOT NULL CHECK (assertion_count > 0),
      detail TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE (skill_version_id, test_type),
      FOREIGN KEY (suite_id) REFERENCES skill_suites(id),
      FOREIGN KEY (skill_version_id) REFERENCES skill_network_versions(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS skill_network_invocations (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      suite_id TEXT NOT NULL,
      skill_version_id TEXT NOT NULL,
      idempotency_key TEXT NOT NULL,
      intent TEXT NOT NULL,
      input_json TEXT NOT NULL,
      approval_confirmed INTEGER NOT NULL CHECK (approval_confirmed IN (0, 1)),
      status TEXT NOT NULL CHECK (status IN ('SUCCEEDED', 'FAILED', 'TIMED_OUT')),
      attempt_count INTEGER NOT NULL CHECK (attempt_count > 0),
      latency_ms INTEGER NOT NULL CHECK (latency_ms >= 0),
      result_valid INTEGER NOT NULL CHECK (result_valid IN (0, 1)),
      result_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE (skill_version_id, idempotency_key),
      FOREIGN KEY (suite_id) REFERENCES skill_suites(id),
      FOREIGN KEY (skill_version_id) REFERENCES skill_network_versions(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS skill_network_events (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      id TEXT NOT NULL UNIQUE,
      tenant_id TEXT NOT NULL,
      suite_id TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      type TEXT NOT NULL,
      summary TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (suite_id) REFERENCES skill_suites(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS merchant_stores (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      merchant_id TEXT NOT NULL,
      city_id TEXT NOT NULL,
      name TEXT NOT NULL,
      city_name TEXT NOT NULL,
      address TEXT NOT NULL,
      business_hours TEXT NOT NULL,
      operating_status TEXT NOT NULL CHECK (operating_status IN ('OPEN', 'CLOSED', 'PAUSED')),
      manager_name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS merchant_daily_metrics (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      merchant_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      business_date TEXT NOT NULL,
      revenue_fen INTEGER NOT NULL CHECK (revenue_fen >= 0),
      previous_revenue_fen INTEGER NOT NULL CHECK (previous_revenue_fen >= 0),
      order_count INTEGER NOT NULL CHECK (order_count >= 0),
      new_member_count INTEGER NOT NULL CHECK (new_member_count >= 0),
      issued_verification_count INTEGER NOT NULL CHECK (issued_verification_count >= 0),
      verified_count INTEGER NOT NULL CHECK (verified_count >= 0),
      visitor_count INTEGER NOT NULL CHECK (visitor_count >= 0),
      ai_health_score INTEGER NOT NULL CHECK (ai_health_score BETWEEN 0 AND 100),
      updated_at TEXT NOT NULL,
      UNIQUE (store_id, business_date),
      FOREIGN KEY (store_id) REFERENCES merchant_stores(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS merchant_orders (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      merchant_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      order_no TEXT NOT NULL UNIQUE,
      order_type TEXT NOT NULL CHECK (order_type IN ('RESERVATION', 'GROUP_BUY', 'ECOMMERCE')),
      channel TEXT NOT NULL CHECK (channel IN ('MINIAPP', 'SKILL', 'POS', 'MARKETPLACE')),
      status TEXT NOT NULL CHECK (status IN (
        'PENDING_CONFIRMATION', 'CONFIRMED', 'READY_FOR_SERVICE', 'VERIFIED',
        'COMPLETED', 'REFUND_REQUESTED', 'REFUNDED', 'CANCELLED', 'EXCEPTION'
      )),
      customer_name TEXT NOT NULL,
      customer_phone_masked TEXT NOT NULL,
      item_summary TEXT NOT NULL,
      party_size INTEGER CHECK (party_size IS NULL OR party_size > 0),
      service_at TEXT,
      gross_amount_fen INTEGER NOT NULL CHECK (gross_amount_fen >= 0),
      discount_fen INTEGER NOT NULL CHECK (discount_fen >= 0),
      paid_amount_fen INTEGER NOT NULL CHECK (paid_amount_fen >= 0),
      refund_amount_fen INTEGER NOT NULL DEFAULT 0 CHECK (refund_amount_fen >= 0),
      verification_code_hash TEXT,
      verification_code_masked TEXT,
      exception_code TEXT,
      version INTEGER NOT NULL DEFAULT 1,
      placed_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (store_id) REFERENCES merchant_stores(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS merchant_ai_recommendations (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      merchant_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      business_date TEXT NOT NULL,
      priority INTEGER NOT NULL CHECK (priority BETWEEN 1 AND 9),
      title TEXT NOT NULL,
      rationale TEXT NOT NULL,
      expected_impact TEXT NOT NULL,
      evidence_json TEXT NOT NULL,
      action_label TEXT NOT NULL,
      action_target TEXT NOT NULL CHECK (action_target IN ('ORDERS', 'ANALYTICS', 'CATALOG')),
      risk_level TEXT NOT NULL CHECK (risk_level IN ('L0', 'L1', 'L2', 'L3')),
      model_version TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('OPEN', 'COMPLETED', 'DISMISSED')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (store_id, business_date, priority),
      FOREIGN KEY (store_id) REFERENCES merchant_stores(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS merchant_order_events (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      id TEXT NOT NULL UNIQUE,
      tenant_id TEXT NOT NULL,
      merchant_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      order_id TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      type TEXT NOT NULL,
      summary TEXT NOT NULL,
      from_status TEXT,
      to_status TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (order_id) REFERENCES merchant_orders(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS merchant_catalogs (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      merchant_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      name TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('DRAFT', 'ACTIVE', 'ARCHIVED')),
      version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (store_id),
      FOREIGN KEY (store_id) REFERENCES merchant_stores(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS merchant_spus (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      merchant_id TEXT NOT NULL,
      catalog_id TEXT NOT NULL,
      spu_type TEXT NOT NULL CHECK (spu_type IN ('PRODUCT', 'SERVICE', 'PACKAGE')),
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED')),
      media_completion INTEGER NOT NULL CHECK (media_completion BETWEEN 0 AND 100),
      sort_order INTEGER NOT NULL DEFAULT 0,
      version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (catalog_id, name),
      FOREIGN KEY (catalog_id) REFERENCES merchant_catalogs(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS merchant_skus (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      merchant_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      spu_id TEXT NOT NULL,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      attributes_json TEXT NOT NULL,
      price_fen INTEGER NOT NULL CHECK (price_fen >= 0),
      compare_at_fen INTEGER CHECK (compare_at_fen IS NULL OR compare_at_fen >= 0),
      cost_fen INTEGER CHECK (cost_fen IS NULL OR cost_fen >= 0),
      stock_mode TEXT NOT NULL CHECK (stock_mode IN ('FINITE', 'UNLIMITED', 'SLOT')),
      stock_quantity INTEGER NOT NULL CHECK (stock_quantity >= 0),
      low_stock_threshold INTEGER NOT NULL CHECK (low_stock_threshold >= 0),
      status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'OUT_OF_STOCK', 'PAUSED')),
      pricing_rule_version TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (merchant_id, code),
      FOREIGN KEY (store_id) REFERENCES merchant_stores(id),
      FOREIGN KEY (spu_id) REFERENCES merchant_spus(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS merchant_service_slots (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      merchant_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      sku_id TEXT NOT NULL,
      weekday INTEGER NOT NULL CHECK (weekday BETWEEN 1 AND 7),
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      capacity INTEGER NOT NULL CHECK (capacity >= 0),
      reserved INTEGER NOT NULL DEFAULT 0 CHECK (reserved >= 0),
      price_override_fen INTEGER CHECK (price_override_fen IS NULL OR price_override_fen >= 0),
      status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'PAUSED')),
      version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (sku_id, weekday, start_time),
      FOREIGN KEY (sku_id) REFERENCES merchant_skus(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS merchant_catalog_imports (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      merchant_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      catalog_id TEXT NOT NULL,
      file_name TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('PREVIEWED', 'APPLIED', 'FAILED')),
      rows_json TEXT NOT NULL,
      errors_json TEXT NOT NULL,
      total_rows INTEGER NOT NULL CHECK (total_rows > 0),
      accepted_rows INTEGER NOT NULL CHECK (accepted_rows >= 0),
      version INTEGER NOT NULL DEFAULT 1,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      applied_at TEXT,
      FOREIGN KEY (catalog_id) REFERENCES merchant_catalogs(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS merchant_catalog_events (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      id TEXT NOT NULL UNIQUE,
      tenant_id TEXT NOT NULL,
      merchant_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      catalog_id TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      type TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      summary TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (catalog_id) REFERENCES merchant_catalogs(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS merchant_members (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      merchant_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      customer_ref TEXT NOT NULL,
      display_name TEXT NOT NULL,
      phone_masked TEXT NOT NULL,
      segment TEXT NOT NULL CHECK (segment IN ('NEW', 'ACTIVE', 'DORMANT', 'HIGH_VALUE')),
      segment_rule_version TEXT NOT NULL,
      tags_json TEXT NOT NULL,
      order_count INTEGER NOT NULL CHECK (order_count >= 0),
      lifetime_value_fen INTEGER NOT NULL CHECK (lifetime_value_fen >= 0),
      average_ticket_fen INTEGER NOT NULL CHECK (average_ticket_fen >= 0),
      repurchase_probability REAL NOT NULL CHECK (repurchase_probability BETWEEN 0 AND 100),
      churn_risk TEXT NOT NULL CHECK (churn_risk IN ('LOW', 'MEDIUM', 'HIGH')),
      prediction_model_version TEXT NOT NULL,
      prediction_reasons_json TEXT NOT NULL,
      marketing_consent INTEGER NOT NULL CHECK (marketing_consent IN (0, 1)),
      joined_at TEXT NOT NULL,
      last_visit_at TEXT,
      version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (merchant_id, customer_ref),
      FOREIGN KEY (store_id) REFERENCES merchant_stores(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS merchant_member_timeline (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      id TEXT NOT NULL UNIQUE,
      tenant_id TEXT NOT NULL,
      merchant_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      member_id TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('JOINED', 'ORDER', 'VISIT', 'TAG_CHANGED', 'BENEFIT_GRANTED', 'RECALL_SCHEDULED')),
      title TEXT NOT NULL,
      detail TEXT NOT NULL,
      amount_fen INTEGER CHECK (amount_fen IS NULL OR amount_fen >= 0),
      source TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (member_id) REFERENCES merchant_members(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS merchant_member_benefits (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      merchant_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      member_id TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('COUPON', 'LEVEL', 'EXPERIENCE')),
      title TEXT NOT NULL,
      value_fen INTEGER NOT NULL CHECK (value_fen >= 0),
      status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'USED', 'EXPIRED', 'REVOKED')),
      rule_version TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      granted_by TEXT NOT NULL,
      granted_at TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (member_id) REFERENCES merchant_members(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS merchant_member_recall_tasks (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      merchant_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      name TEXT NOT NULL,
      channel TEXT NOT NULL CHECK (channel IN ('WECHAT', 'SMS')),
      status TEXT NOT NULL CHECK (status IN ('SCHEDULED', 'CANCELLED', 'COMPLETED')),
      member_ids_json TEXT NOT NULL,
      audience_count INTEGER NOT NULL CHECK (audience_count >= 0),
      excluded_no_consent_count INTEGER NOT NULL CHECK (excluded_no_consent_count >= 0),
      content TEXT NOT NULL,
      reason TEXT NOT NULL,
      segment_rule_version TEXT NOT NULL,
      prediction_model_version TEXT NOT NULL,
      approval_confirmed INTEGER NOT NULL CHECK (approval_confirmed IN (0, 1)),
      scheduled_at TEXT NOT NULL,
      created_by TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS merchant_member_events (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      id TEXT NOT NULL UNIQUE,
      tenant_id TEXT NOT NULL,
      merchant_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      member_id TEXT,
      actor_id TEXT NOT NULL,
      type TEXT NOT NULL,
      summary TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (member_id) REFERENCES merchant_members(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS demo_runs (
      run_id TEXT PRIMARY KEY,
      completed_steps INTEGER NOT NULL DEFAULT 0 CHECK (completed_steps BETWEEN 0 AND 12),
      merchant_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS merchants (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      tenant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      city TEXT NOT NULL,
      address TEXT NOT NULL,
      contact_name TEXT NOT NULL,
      state TEXT NOT NULL,
      health_score INTEGER,
      geo_score INTEGER,
      profile_completion INTEGER NOT NULL DEFAULT 24,
      version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (run_id) REFERENCES demo_runs(run_id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS consents (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      tenant_id TEXT NOT NULL,
      merchant_id TEXT NOT NULL,
      scope TEXT NOT NULL,
      label TEXT NOT NULL,
      granted_at TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      UNIQUE (run_id, scope),
      FOREIGN KEY (merchant_id) REFERENCES merchants(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS miniapp_releases (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      tenant_id TEXT NOT NULL,
      merchant_id TEXT NOT NULL,
      version TEXT NOT NULL,
      status TEXT NOT NULL,
      template TEXT NOT NULL,
      preview_path TEXT NOT NULL,
      approved_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (run_id, version),
      FOREIGN KEY (merchant_id) REFERENCES merchants(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS skills (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      tenant_id TEXT NOT NULL,
      merchant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      version TEXT NOT NULL,
      status TEXT NOT NULL,
      success_rate REAL NOT NULL,
      risk_level TEXT NOT NULL,
      schema_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (run_id, name),
      FOREIGN KEY (merchant_id) REFERENCES merchants(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      tenant_id TEXT NOT NULL,
      merchant_id TEXT NOT NULL,
      status TEXT NOT NULL,
      store_name TEXT NOT NULL,
      party_size INTEGER NOT NULL,
      reservation_at TEXT NOT NULL,
      customer_name TEXT NOT NULL,
      customer_phone_masked TEXT NOT NULL,
      note TEXT NOT NULL,
      price_snapshot_json TEXT NOT NULL,
      rule_snapshot_json TEXT NOT NULL,
      merchant_seen_at TEXT,
      version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (run_id),
      FOREIGN KEY (merchant_id) REFERENCES merchants(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS audit_events (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      id TEXT NOT NULL UNIQUE,
      run_id TEXT NOT NULL,
      tenant_id TEXT NOT NULL,
      actor_role TEXT NOT NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      risk_level TEXT NOT NULL,
      result TEXT NOT NULL,
      summary TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS tracking_events (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      id TEXT NOT NULL UNIQUE,
      run_id TEXT NOT NULL,
      tenant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      properties_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS outbox_events (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      id TEXT NOT NULL UNIQUE,
      run_id TEXT NOT NULL,
      tenant_id TEXT NOT NULL,
      topic TEXT NOT NULL,
      aggregate_id TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      published_at TEXT
    ) STRICT;

    CREATE TABLE IF NOT EXISTS idempotency_records (
      key TEXT NOT NULL,
      route TEXT NOT NULL,
      run_id TEXT NOT NULL,
      request_hash TEXT NOT NULL,
      response_json TEXT NOT NULL,
      status_code INTEGER NOT NULL,
      replay_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      PRIMARY KEY (key, route)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS voucher_ledger (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      entry_id TEXT NOT NULL UNIQUE,
      tenant_id TEXT NOT NULL,
      account_id TEXT NOT NULL,
      order_id TEXT,
      direction TEXT NOT NULL CHECK (direction IN ('DEBIT', 'CREDIT')),
      amount_fen INTEGER NOT NULL CHECK (amount_fen >= 0),
      rule_version TEXT NOT NULL,
      snapshot_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    ) STRICT;

    CREATE TRIGGER IF NOT EXISTS audit_events_no_update
    BEFORE UPDATE ON audit_events BEGIN
      SELECT RAISE(ABORT, 'audit_events is append-only');
    END;

    CREATE TRIGGER IF NOT EXISTS audit_events_no_delete
    BEFORE DELETE ON audit_events BEGIN
      SELECT RAISE(ABORT, 'audit_events is append-only');
    END;

    CREATE TRIGGER IF NOT EXISTS consumer_household_members_no_update
    BEFORE UPDATE ON consumer_household_members BEGIN
      SELECT RAISE(ABORT, 'consumer_household_members require versioned replacement');
    END;

    CREATE TRIGGER IF NOT EXISTS consumer_household_members_no_delete
    BEFORE DELETE ON consumer_household_members BEGIN
      SELECT RAISE(ABORT, 'consumer_household_members require versioned replacement');
    END;

    CREATE TRIGGER IF NOT EXISTS consumer_messages_content_immutable
    BEFORE UPDATE OF tenant_id, user_id, household_member_id, category, title,
                     body, action_label, action_target, created_at
    ON consumer_messages BEGIN
      SELECT RAISE(ABORT, 'consumer_messages content is immutable');
    END;

    CREATE TRIGGER IF NOT EXISTS consumer_messages_no_delete
    BEFORE DELETE ON consumer_messages BEGIN
      SELECT RAISE(ABORT, 'consumer_messages cannot be deleted');
    END;

    CREATE TRIGGER IF NOT EXISTS consumer_search_history_no_update
    BEFORE UPDATE ON consumer_search_history BEGIN
      SELECT RAISE(ABORT, 'consumer_search_history is append-only');
    END;

    CREATE TRIGGER IF NOT EXISTS consumer_search_history_no_delete
    BEFORE DELETE ON consumer_search_history BEGIN
      SELECT RAISE(ABORT, 'consumer_search_history is append-only');
    END;

    CREATE TRIGGER IF NOT EXISTS consumer_context_events_no_update
    BEFORE UPDATE ON consumer_context_events BEGIN
      SELECT RAISE(ABORT, 'consumer_context_events is append-only');
    END;

    CREATE TRIGGER IF NOT EXISTS consumer_context_events_no_delete
    BEFORE DELETE ON consumer_context_events BEGIN
      SELECT RAISE(ABORT, 'consumer_context_events is append-only');
    END;

    CREATE TRIGGER IF NOT EXISTS consumer_assistant_messages_no_update
    BEFORE UPDATE ON consumer_assistant_messages BEGIN
      SELECT RAISE(ABORT, 'consumer_assistant_messages is append-only');
    END;

    CREATE TRIGGER IF NOT EXISTS consumer_assistant_messages_no_delete
    BEFORE DELETE ON consumer_assistant_messages BEGIN
      SELECT RAISE(ABORT, 'consumer_assistant_messages is append-only');
    END;

    CREATE TRIGGER IF NOT EXISTS consumer_assistant_events_no_update
    BEFORE UPDATE ON consumer_assistant_events BEGIN
      SELECT RAISE(ABORT, 'consumer_assistant_events is append-only');
    END;

    CREATE TRIGGER IF NOT EXISTS consumer_assistant_events_no_delete
    BEFORE DELETE ON consumer_assistant_events BEGIN
      SELECT RAISE(ABORT, 'consumer_assistant_events is append-only');
    END;

    CREATE TRIGGER IF NOT EXISTS consumer_voice_events_no_update
    BEFORE UPDATE ON consumer_voice_events BEGIN
      SELECT RAISE(ABORT, 'consumer_voice_events is append-only');
    END;

    CREATE TRIGGER IF NOT EXISTS consumer_voice_events_no_delete
    BEFORE DELETE ON consumer_voice_events BEGIN
      SELECT RAISE(ABORT, 'consumer_voice_events is append-only');
    END;

    CREATE TRIGGER IF NOT EXISTS consumer_image_events_no_update
    BEFORE UPDATE ON consumer_image_events BEGIN
      SELECT RAISE(ABORT, 'consumer_image_events is append-only');
    END;

    CREATE TRIGGER IF NOT EXISTS consumer_image_events_no_delete
    BEFORE DELETE ON consumer_image_events BEGIN
      SELECT RAISE(ABORT, 'consumer_image_events is append-only');
    END;

    CREATE TRIGGER IF NOT EXISTS voucher_ledger_no_update
    BEFORE UPDATE ON voucher_ledger BEGIN
      SELECT RAISE(ABORT, 'voucher_ledger is append-only');
    END;

    CREATE TRIGGER IF NOT EXISTS voucher_ledger_no_delete
    BEFORE DELETE ON voucher_ledger BEGIN
      SELECT RAISE(ABORT, 'voucher_ledger is append-only');
    END;

    CREATE TRIGGER IF NOT EXISTS lead_activities_no_update
    BEFORE UPDATE ON lead_activities BEGIN
      SELECT RAISE(ABORT, 'lead_activities is append-only');
    END;

    CREATE TRIGGER IF NOT EXISTS lead_activities_no_delete
    BEFORE DELETE ON lead_activities BEGIN
      SELECT RAISE(ABORT, 'lead_activities is append-only');
    END;

    CREATE TRIGGER IF NOT EXISTS lead_followups_no_update
    BEFORE UPDATE ON lead_followups BEGIN
      SELECT RAISE(ABORT, 'lead_followups is append-only');
    END;

    CREATE TRIGGER IF NOT EXISTS lead_followups_no_delete
    BEFORE DELETE ON lead_followups BEGIN
      SELECT RAISE(ABORT, 'lead_followups is append-only');
    END;

    CREATE TRIGGER IF NOT EXISTS sales_task_events_no_update
    BEFORE UPDATE ON sales_task_events BEGIN
      SELECT RAISE(ABORT, 'sales_task_events is append-only');
    END;

    CREATE TRIGGER IF NOT EXISTS sales_task_events_no_delete
    BEFORE DELETE ON sales_task_events BEGIN
      SELECT RAISE(ABORT, 'sales_task_events is append-only');
    END;

    CREATE TRIGGER IF NOT EXISTS sales_compensation_rules_no_update
    BEFORE UPDATE ON sales_compensation_rules BEGIN
      SELECT RAISE(ABORT, 'sales_compensation_rules is append-only');
    END;

    CREATE TRIGGER IF NOT EXISTS sales_compensation_rules_no_delete
    BEFORE DELETE ON sales_compensation_rules BEGIN
      SELECT RAISE(ABORT, 'sales_compensation_rules is append-only');
    END;

    CREATE TRIGGER IF NOT EXISTS sales_target_revisions_no_update
    BEFORE UPDATE ON sales_target_revisions BEGIN
      SELECT RAISE(ABORT, 'sales_target_revisions is append-only');
    END;

    CREATE TRIGGER IF NOT EXISTS sales_target_revisions_no_delete
    BEFORE DELETE ON sales_target_revisions BEGIN
      SELECT RAISE(ABORT, 'sales_target_revisions is append-only');
    END;

    CREATE TRIGGER IF NOT EXISTS sales_commission_ledger_no_update
    BEFORE UPDATE ON sales_commission_ledger BEGIN
      SELECT RAISE(ABORT, 'sales_commission_ledger is append-only');
    END;

    CREATE TRIGGER IF NOT EXISTS sales_commission_ledger_no_delete
    BEFORE DELETE ON sales_commission_ledger BEGIN
      SELECT RAISE(ABORT, 'sales_commission_ledger is append-only');
    END;

    CREATE TRIGGER IF NOT EXISTS sales_performance_scorecards_no_update
    BEFORE UPDATE ON sales_performance_scorecards BEGIN
      SELECT RAISE(ABORT, 'sales_performance_scorecards is append-only');
    END;

    CREATE TRIGGER IF NOT EXISTS sales_performance_scorecards_no_delete
    BEFORE DELETE ON sales_performance_scorecards BEGIN
      SELECT RAISE(ABORT, 'sales_performance_scorecards is append-only');
    END;

    CREATE TRIGGER IF NOT EXISTS sales_level_change_events_no_update
    BEFORE UPDATE ON sales_level_change_events BEGIN
      SELECT RAISE(ABORT, 'sales_level_change_events is append-only');
    END;

    CREATE TRIGGER IF NOT EXISTS sales_level_change_events_no_delete
    BEFORE DELETE ON sales_level_change_events BEGIN
      SELECT RAISE(ABORT, 'sales_level_change_events is append-only');
    END;

    CREATE TRIGGER IF NOT EXISTS sales_coaching_events_no_update
    BEFORE UPDATE ON sales_coaching_events BEGIN
      SELECT RAISE(ABORT, 'sales_coaching_events is append-only');
    END;

    CREATE TRIGGER IF NOT EXISTS sales_coaching_events_no_delete
    BEFORE DELETE ON sales_coaching_events BEGIN
      SELECT RAISE(ABORT, 'sales_coaching_events is append-only');
    END;

    CREATE TRIGGER IF NOT EXISTS sales_ai_artifact_revisions_no_update
    BEFORE UPDATE ON sales_ai_artifact_revisions BEGIN
      SELECT RAISE(ABORT, 'sales_ai_artifact_revisions is append-only');
    END;

    CREATE TRIGGER IF NOT EXISTS sales_ai_artifact_revisions_no_delete
    BEFORE DELETE ON sales_ai_artifact_revisions BEGIN
      SELECT RAISE(ABORT, 'sales_ai_artifact_revisions is append-only');
    END;

    CREATE TRIGGER IF NOT EXISTS sales_ai_roleplay_turns_no_update
    BEFORE UPDATE ON sales_ai_roleplay_turns BEGIN
      SELECT RAISE(ABORT, 'sales_ai_roleplay_turns is append-only');
    END;

    CREATE TRIGGER IF NOT EXISTS sales_ai_roleplay_turns_no_delete
    BEFORE DELETE ON sales_ai_roleplay_turns BEGIN
      SELECT RAISE(ABORT, 'sales_ai_roleplay_turns is append-only');
    END;

    CREATE TRIGGER IF NOT EXISTS sales_ai_events_no_update
    BEFORE UPDATE ON sales_ai_events BEGIN
      SELECT RAISE(ABORT, 'sales_ai_events is append-only');
    END;

    CREATE TRIGGER IF NOT EXISTS sales_ai_events_no_delete
    BEFORE DELETE ON sales_ai_events BEGIN
      SELECT RAISE(ABORT, 'sales_ai_events is append-only');
    END;

    CREATE TRIGGER IF NOT EXISTS lead_ownership_events_no_update
    BEFORE UPDATE ON lead_ownership_events BEGIN
      SELECT RAISE(ABORT, 'lead_ownership_events is append-only');
    END;

    CREATE TRIGGER IF NOT EXISTS lead_ownership_events_no_delete
    BEFORE DELETE ON lead_ownership_events BEGIN
      SELECT RAISE(ABORT, 'lead_ownership_events is append-only');
    END;

    CREATE TRIGGER IF NOT EXISTS provider_lead_assignment_events_no_update
    BEFORE UPDATE ON provider_lead_assignment_events BEGIN
      SELECT RAISE(ABORT, 'provider_lead_assignment_events is append-only');
    END;

    CREATE TRIGGER IF NOT EXISTS provider_lead_assignment_events_no_delete
    BEFORE DELETE ON provider_lead_assignment_events BEGIN
      SELECT RAISE(ABORT, 'provider_lead_assignment_events is append-only');
    END;

    CREATE TRIGGER IF NOT EXISTS onboarding_asset_blobs_no_update
    BEFORE UPDATE ON onboarding_asset_blobs BEGIN
      SELECT RAISE(ABORT, 'onboarding_asset_blobs is append-only');
    END;

    CREATE TRIGGER IF NOT EXISTS onboarding_asset_blobs_no_delete
    BEFORE DELETE ON onboarding_asset_blobs BEGIN
      SELECT RAISE(ABORT, 'onboarding_asset_blobs is append-only');
    END;

    CREATE TRIGGER IF NOT EXISTS miniapp_factory_events_no_update
    BEFORE UPDATE ON miniapp_factory_events BEGIN
      SELECT RAISE(ABORT, 'miniapp_factory_events is append-only');
    END;

    CREATE TRIGGER IF NOT EXISTS miniapp_factory_events_no_delete
    BEFORE DELETE ON miniapp_factory_events BEGIN
      SELECT RAISE(ABORT, 'miniapp_factory_events is append-only');
    END;

    CREATE TRIGGER IF NOT EXISTS provider_delivery_case_events_no_update
    BEFORE UPDATE ON provider_delivery_case_events BEGIN
      SELECT RAISE(ABORT, 'provider_delivery_case_events is append-only');
    END;

    CREATE TRIGGER IF NOT EXISTS provider_delivery_case_events_no_delete
    BEFORE DELETE ON provider_delivery_case_events BEGIN
      SELECT RAISE(ABORT, 'provider_delivery_case_events is append-only');
    END;

    CREATE TRIGGER IF NOT EXISTS provider_delivery_work_order_attachments_no_update
    BEFORE UPDATE ON provider_delivery_work_order_attachments BEGIN
      SELECT RAISE(ABORT, 'provider_delivery_work_order_attachments is append-only');
    END;

    CREATE TRIGGER IF NOT EXISTS provider_delivery_work_order_attachments_no_delete
    BEFORE DELETE ON provider_delivery_work_order_attachments BEGIN
      SELECT RAISE(ABORT, 'provider_delivery_work_order_attachments is append-only');
    END;

    CREATE TRIGGER IF NOT EXISTS provider_delivery_work_order_confirmations_no_update
    BEFORE UPDATE ON provider_delivery_work_order_confirmations BEGIN
      SELECT RAISE(ABORT, 'provider_delivery_work_order_confirmations is append-only');
    END;

    CREATE TRIGGER IF NOT EXISTS provider_delivery_work_order_confirmations_no_delete
    BEFORE DELETE ON provider_delivery_work_order_confirmations BEGIN
      SELECT RAISE(ABORT, 'provider_delivery_work_order_confirmations is append-only');
    END;

    CREATE TRIGGER IF NOT EXISTS provider_delivery_work_order_events_no_update
    BEFORE UPDATE ON provider_delivery_work_order_events BEGIN
      SELECT RAISE(ABORT, 'provider_delivery_work_order_events is append-only');
    END;

    CREATE TRIGGER IF NOT EXISTS provider_delivery_work_order_events_no_delete
    BEFORE DELETE ON provider_delivery_work_order_events BEGIN
      SELECT RAISE(ABORT, 'provider_delivery_work_order_events is append-only');
    END;

    CREATE TRIGGER IF NOT EXISTS provider_delivery_sla_events_no_update
    BEFORE UPDATE ON provider_delivery_sla_events BEGIN
      SELECT RAISE(ABORT, 'provider_delivery_sla_events is append-only');
    END;

    CREATE TRIGGER IF NOT EXISTS provider_delivery_sla_events_no_delete
    BEFORE DELETE ON provider_delivery_sla_events BEGIN
      SELECT RAISE(ABORT, 'provider_delivery_sla_events is append-only');
    END;

    CREATE TRIGGER IF NOT EXISTS provider_renewal_proposals_no_update
    BEFORE UPDATE ON provider_renewal_proposals BEGIN
      SELECT RAISE(ABORT, 'provider_renewal_proposals is append-only');
    END;

    CREATE TRIGGER IF NOT EXISTS provider_renewal_proposals_no_delete
    BEFORE DELETE ON provider_renewal_proposals BEGIN
      SELECT RAISE(ABORT, 'provider_renewal_proposals is append-only');
    END;

    CREATE TRIGGER IF NOT EXISTS provider_renewal_events_no_update
    BEFORE UPDATE ON provider_renewal_events BEGIN
      SELECT RAISE(ABORT, 'provider_renewal_events is append-only');
    END;

    CREATE TRIGGER IF NOT EXISTS provider_renewal_events_no_delete
    BEFORE DELETE ON provider_renewal_events BEGIN
      SELECT RAISE(ABORT, 'provider_renewal_events is append-only');
    END;

    CREATE TRIGGER IF NOT EXISTS provider_city_settlement_rules_no_update
    BEFORE UPDATE ON provider_city_settlement_rules BEGIN
      SELECT RAISE(ABORT, 'provider_city_settlement_rules are versioned');
    END;

    CREATE TRIGGER IF NOT EXISTS provider_city_settlement_rules_no_delete
    BEFORE DELETE ON provider_city_settlement_rules BEGIN
      SELECT RAISE(ABORT, 'provider_city_settlement_rules are versioned');
    END;

    CREATE TRIGGER IF NOT EXISTS provider_city_settlement_ledger_no_update
    BEFORE UPDATE ON provider_city_settlement_ledger BEGIN
      SELECT RAISE(ABORT, 'provider_city_settlement_ledger is append-only');
    END;

    CREATE TRIGGER IF NOT EXISTS provider_city_settlement_ledger_no_delete
    BEFORE DELETE ON provider_city_settlement_ledger BEGIN
      SELECT RAISE(ABORT, 'provider_city_settlement_ledger is append-only');
    END;

    CREATE TRIGGER IF NOT EXISTS provider_city_settlement_events_no_update
    BEFORE UPDATE ON provider_city_settlement_events BEGIN
      SELECT RAISE(ABORT, 'provider_city_settlement_events is append-only');
    END;

    CREATE TRIGGER IF NOT EXISTS provider_city_settlement_events_no_delete
    BEFORE DELETE ON provider_city_settlement_events BEGIN
      SELECT RAISE(ABORT, 'provider_city_settlement_events is append-only');
    END;

    CREATE TRIGGER IF NOT EXISTS geo_events_no_update
    BEFORE UPDATE ON geo_events BEGIN
      SELECT RAISE(ABORT, 'geo_events is append-only');
    END;

    CREATE TRIGGER IF NOT EXISTS geo_events_no_delete
    BEFORE DELETE ON geo_events BEGIN
      SELECT RAISE(ABORT, 'geo_events is append-only');
    END;

    CREATE TRIGGER IF NOT EXISTS geo_score_snapshots_no_update
    BEFORE UPDATE ON geo_score_snapshots BEGIN
      SELECT RAISE(ABORT, 'geo_score_snapshots is append-only');
    END;

    CREATE TRIGGER IF NOT EXISTS geo_score_snapshots_no_delete
    BEFORE DELETE ON geo_score_snapshots BEGIN
      SELECT RAISE(ABORT, 'geo_score_snapshots is append-only');
    END;

    CREATE TRIGGER IF NOT EXISTS geo_channel_snapshots_no_update
    BEFORE UPDATE ON geo_channel_snapshots BEGIN
      SELECT RAISE(ABORT, 'geo_channel_snapshots is append-only');
    END;

    CREATE TRIGGER IF NOT EXISTS geo_channel_snapshots_no_delete
    BEFORE DELETE ON geo_channel_snapshots BEGIN
      SELECT RAISE(ABORT, 'geo_channel_snapshots is append-only');
    END;

    CREATE TRIGGER IF NOT EXISTS skill_network_events_no_update
    BEFORE UPDATE ON skill_network_events BEGIN
      SELECT RAISE(ABORT, 'skill_network_events is append-only');
    END;

    CREATE TRIGGER IF NOT EXISTS skill_network_events_no_delete
    BEFORE DELETE ON skill_network_events BEGIN
      SELECT RAISE(ABORT, 'skill_network_events is append-only');
    END;

    CREATE TRIGGER IF NOT EXISTS skill_test_runs_no_update
    BEFORE UPDATE ON skill_test_runs BEGIN
      SELECT RAISE(ABORT, 'skill_test_runs is append-only');
    END;

    CREATE TRIGGER IF NOT EXISTS skill_test_runs_no_delete
    BEFORE DELETE ON skill_test_runs BEGIN
      SELECT RAISE(ABORT, 'skill_test_runs is append-only');
    END;

    CREATE TRIGGER IF NOT EXISTS skill_network_invocations_no_update
    BEFORE UPDATE ON skill_network_invocations BEGIN
      SELECT RAISE(ABORT, 'skill_network_invocations is append-only');
    END;

    CREATE TRIGGER IF NOT EXISTS skill_network_invocations_no_delete
    BEFORE DELETE ON skill_network_invocations BEGIN
      SELECT RAISE(ABORT, 'skill_network_invocations is append-only');
    END;

    CREATE TRIGGER IF NOT EXISTS merchant_order_events_no_update
    BEFORE UPDATE ON merchant_order_events BEGIN
      SELECT RAISE(ABORT, 'merchant_order_events is append-only');
    END;

    CREATE TRIGGER IF NOT EXISTS consumer_payment_events_no_update
    BEFORE UPDATE ON consumer_payment_events BEGIN
      SELECT RAISE(ABORT, 'consumer_payment_events is append-only');
    END;

    CREATE TRIGGER IF NOT EXISTS consumer_payment_events_no_delete
    BEFORE DELETE ON consumer_payment_events BEGIN
      SELECT RAISE(ABORT, 'consumer_payment_events is append-only');
    END;

    CREATE TRIGGER IF NOT EXISTS merchant_order_events_no_delete
    BEFORE DELETE ON merchant_order_events BEGIN
      SELECT RAISE(ABORT, 'merchant_order_events is append-only');
    END;

    CREATE TRIGGER IF NOT EXISTS merchant_catalog_events_no_update
    BEFORE UPDATE ON merchant_catalog_events BEGIN
      SELECT RAISE(ABORT, 'merchant_catalog_events is append-only');
    END;

    CREATE TRIGGER IF NOT EXISTS merchant_catalog_events_no_delete
    BEFORE DELETE ON merchant_catalog_events BEGIN
      SELECT RAISE(ABORT, 'merchant_catalog_events is append-only');
    END;

    CREATE TRIGGER IF NOT EXISTS merchant_member_timeline_no_update
    BEFORE UPDATE ON merchant_member_timeline BEGIN
      SELECT RAISE(ABORT, 'merchant_member_timeline is append-only');
    END;

    CREATE TRIGGER IF NOT EXISTS merchant_member_timeline_no_delete
    BEFORE DELETE ON merchant_member_timeline BEGIN
      SELECT RAISE(ABORT, 'merchant_member_timeline is append-only');
    END;

    CREATE TRIGGER IF NOT EXISTS merchant_member_events_no_update
    BEFORE UPDATE ON merchant_member_events BEGIN
      SELECT RAISE(ABORT, 'merchant_member_events is append-only');
    END;

    CREATE TRIGGER IF NOT EXISTS merchant_member_events_no_delete
    BEFORE DELETE ON merchant_member_events BEGIN
      SELECT RAISE(ABORT, 'merchant_member_events is append-only');
    END;

    CREATE INDEX IF NOT EXISTS audit_events_run_sequence_idx
      ON audit_events(run_id, sequence DESC);
    CREATE INDEX IF NOT EXISTS outbox_events_run_sequence_idx
      ON outbox_events(run_id, sequence DESC);
    CREATE INDEX IF NOT EXISTS memberships_tenant_user_idx
      ON memberships(tenant_id, user_id);
    CREATE INDEX IF NOT EXISTS role_assignments_membership_idx
      ON role_assignments(membership_id);
    CREATE INDEX IF NOT EXISTS consumer_cities_tenant_status_idx
      ON consumer_cities(tenant_id, status, sort_order);
    CREATE INDEX IF NOT EXISTS consumer_household_members_household_status_idx
      ON consumer_household_members(household_id, status, created_at);
    CREATE INDEX IF NOT EXISTS consumer_publications_city_status_idx
      ON consumer_store_publications(tenant_id, city_id, visibility_status, rating DESC);
    CREATE INDEX IF NOT EXISTS consumer_store_locations_city_coordinate_idx
      ON consumer_store_locations(tenant_id, city_id, latitude, longitude);
    CREATE INDEX IF NOT EXISTS consumer_messages_user_created_idx
      ON consumer_messages(tenant_id, user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS consumer_messages_user_unread_idx
      ON consumer_messages(tenant_id, user_id, read_at, created_at DESC);
    CREATE INDEX IF NOT EXISTS consumer_tasks_household_status_idx
      ON consumer_household_tasks(household_id, status, due_at);
    CREATE INDEX IF NOT EXISTS consumer_entitlements_user_expiry_idx
      ON consumer_entitlements(user_id, household_member_id, status, expires_at);
    CREATE INDEX IF NOT EXISTS consumer_recent_services_member_used_idx
      ON consumer_recent_services(user_id, household_member_id, last_used_at DESC);
    CREATE INDEX IF NOT EXISTS consumer_search_history_user_sequence_idx
      ON consumer_search_history(user_id, sequence DESC);
    CREATE INDEX IF NOT EXISTS consumer_context_events_user_sequence_idx
      ON consumer_context_events(user_id, sequence DESC);
    CREATE INDEX IF NOT EXISTS consumer_voice_inputs_user_updated_idx
      ON consumer_voice_inputs(tenant_id, user_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS consumer_voice_events_input_sequence_idx
      ON consumer_voice_events(voice_input_id, sequence DESC);
    CREATE INDEX IF NOT EXISTS consumer_image_inputs_user_updated_idx
      ON consumer_image_inputs(tenant_id, user_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS consumer_image_events_input_sequence_idx
      ON consumer_image_events(image_input_id, sequence DESC);
    CREATE INDEX IF NOT EXISTS consumer_payment_intents_order_created_idx
      ON consumer_payment_intents(order_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS consumer_payment_events_intent_sequence_idx
      ON consumer_payment_events(intent_id, sequence DESC);
    CREATE INDEX IF NOT EXISTS consumer_refund_requests_order_created_idx
      ON consumer_refund_requests(order_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS leads_tenant_owner_stage_idx
      ON leads(tenant_id, owner_id, stage, updated_at DESC);
    CREATE INDEX IF NOT EXISTS leads_city_stage_idx
      ON leads(tenant_id, city_id, stage, updated_at DESC);
    CREATE INDEX IF NOT EXISTS lead_locations_city_coordinate_idx
      ON lead_locations(tenant_id, city_id, latitude, longitude);
    CREATE INDEX IF NOT EXISTS lead_activities_lead_sequence_idx
      ON lead_activities(lead_id, sequence DESC);
    CREATE INDEX IF NOT EXISTS lead_followups_lead_occurred_idx
      ON lead_followups(lead_id, occurred_at DESC);
    CREATE INDEX IF NOT EXISTS lead_collaborators_user_idx
      ON lead_collaborators(tenant_id, user_id, lead_id);
    CREATE INDEX IF NOT EXISTS lead_transfer_requests_city_status_idx
      ON lead_transfer_requests(tenant_id, city_id, status, created_at DESC);
    CREATE INDEX IF NOT EXISTS lead_transfer_requests_lead_created_idx
      ON lead_transfer_requests(lead_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS lead_ownership_events_lead_sequence_idx
      ON lead_ownership_events(lead_id, sequence DESC);
    CREATE INDEX IF NOT EXISTS provider_assignment_lead_sequence_idx
      ON provider_lead_assignment_events(lead_id, sequence DESC);
    CREATE INDEX IF NOT EXISTS provider_assignment_city_created_idx
      ON provider_lead_assignment_events(tenant_id, city_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS sales_tasks_owner_due_idx
      ON sales_tasks(tenant_id, owner_id, status, due_at);
    CREATE INDEX IF NOT EXISTS sales_tasks_lead_version_idx
      ON sales_tasks(lead_id, lead_version, updated_at DESC);
    CREATE INDEX IF NOT EXISTS sales_task_events_task_sequence_idx
      ON sales_task_events(task_id, sequence DESC);
    CREATE INDEX IF NOT EXISTS sales_targets_person_period_version_idx
      ON sales_target_revisions(tenant_id, salesperson_id, period, version DESC);
    CREATE INDEX IF NOT EXISTS sales_targets_city_period_idx
      ON sales_target_revisions(tenant_id, city_id, period, sequence DESC);
    CREATE INDEX IF NOT EXISTS sales_commission_person_period_idx
      ON sales_commission_ledger(tenant_id, salesperson_id, period, sequence DESC);
    CREATE INDEX IF NOT EXISTS sales_commission_city_period_idx
      ON sales_commission_ledger(tenant_id, city_id, period, sequence DESC);
    CREATE INDEX IF NOT EXISTS sales_commission_original_idx
      ON sales_commission_ledger(original_entry_id, sequence);
    CREATE INDEX IF NOT EXISTS sales_team_units_city_parent_idx
      ON sales_team_units(tenant_id, city_id, parent_id, sort_order);
    CREATE INDEX IF NOT EXISTS sales_team_members_unit_status_idx
      ON sales_team_members(team_unit_id, employment_status, updated_at DESC);
    CREATE INDEX IF NOT EXISTS sales_scorecards_person_period_idx
      ON sales_performance_scorecards(tenant_id, salesperson_id, period, version DESC);
    CREATE INDEX IF NOT EXISTS sales_level_events_request_sequence_idx
      ON sales_level_change_events(request_id, sequence DESC);
    CREATE INDEX IF NOT EXISTS sales_level_events_member_sequence_idx
      ON sales_level_change_events(member_id, sequence DESC);
    CREATE INDEX IF NOT EXISTS sales_coaching_plans_member_status_idx
      ON sales_coaching_plans(member_id, status, due_at);
    CREATE INDEX IF NOT EXISTS sales_coaching_events_plan_sequence_idx
      ON sales_coaching_events(plan_id, sequence DESC);
    CREATE INDEX IF NOT EXISTS sales_ai_sessions_lead_updated_idx
      ON sales_ai_sessions(tenant_id, lead_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS sales_ai_artifacts_lead_kind_revision_idx
      ON sales_ai_artifact_revisions(tenant_id, lead_id, kind, revision DESC);
    CREATE INDEX IF NOT EXISTS sales_ai_roleplay_session_sequence_idx
      ON sales_ai_roleplay_turns(session_id, sequence);
    CREATE INDEX IF NOT EXISTS sales_ai_events_lead_sequence_idx
      ON sales_ai_events(lead_id, sequence DESC);
    CREATE INDEX IF NOT EXISTS onboarding_asset_blobs_asset_idx
      ON onboarding_asset_blobs(asset_id, upload_version DESC);
    CREATE INDEX IF NOT EXISTS miniapp_factory_projects_city_status_idx
      ON miniapp_factory_projects(tenant_id, city_id, status, updated_at DESC);
    CREATE INDEX IF NOT EXISTS miniapp_factory_events_project_sequence_idx
      ON miniapp_factory_events(project_id, sequence DESC);
    CREATE INDEX IF NOT EXISTS provider_delivery_cases_city_due_idx
      ON provider_delivery_cases(tenant_id, city_id, target_due_at);
    CREATE INDEX IF NOT EXISTS provider_delivery_case_events_case_sequence_idx
      ON provider_delivery_case_events(case_id, sequence DESC);
    CREATE INDEX IF NOT EXISTS provider_delivery_work_orders_city_due_idx
      ON provider_delivery_work_orders(tenant_id, city_id, status, due_at);
    CREATE INDEX IF NOT EXISTS provider_delivery_work_orders_case_status_idx
      ON provider_delivery_work_orders(case_id, status, updated_at DESC);
    CREATE INDEX IF NOT EXISTS provider_delivery_sla_incidents_city_status_idx
      ON provider_delivery_sla_incidents(tenant_id, city_id, status, level, updated_at DESC);
    CREATE INDEX IF NOT EXISTS provider_delivery_sla_events_incident_idx
      ON provider_delivery_sla_events(incident_id, sequence DESC);
    CREATE INDEX IF NOT EXISTS provider_renewal_cases_city_status_end_idx
      ON provider_renewal_cases(tenant_id, city_id, status, service_ends_at);
    CREATE INDEX IF NOT EXISTS provider_renewal_proposals_case_version_idx
      ON provider_renewal_proposals(case_id, version DESC);
    CREATE INDEX IF NOT EXISTS provider_renewal_events_case_sequence_idx
      ON provider_renewal_events(case_id, sequence DESC);
    CREATE INDEX IF NOT EXISTS provider_city_statements_city_period_idx
      ON provider_city_settlement_statements(tenant_id, city_id, period DESC);
    CREATE INDEX IF NOT EXISTS provider_city_adjustments_statement_status_idx
      ON provider_city_settlement_adjustments(statement_id, status, requested_at DESC);
    CREATE INDEX IF NOT EXISTS provider_city_invoices_statement_submitted_idx
      ON provider_city_settlement_invoices(statement_id, submitted_at DESC);
    CREATE INDEX IF NOT EXISTS provider_city_ledger_statement_sequence_idx
      ON provider_city_settlement_ledger(statement_id, sequence DESC);
    CREATE INDEX IF NOT EXISTS provider_city_events_statement_sequence_idx
      ON provider_city_settlement_events(statement_id, sequence DESC);
    CREATE INDEX IF NOT EXISTS provider_delivery_work_order_attachments_order_sequence_idx
      ON provider_delivery_work_order_attachments(work_order_id, sequence DESC);
    CREATE INDEX IF NOT EXISTS provider_delivery_work_order_confirmations_order_sequence_idx
      ON provider_delivery_work_order_confirmations(work_order_id, sequence DESC);
    CREATE INDEX IF NOT EXISTS provider_delivery_work_order_events_order_sequence_idx
      ON provider_delivery_work_order_events(work_order_id, sequence DESC);
    CREATE INDEX IF NOT EXISTS geo_workspaces_city_status_idx
      ON geo_workspaces(tenant_id, city_id, status, updated_at DESC);
    CREATE INDEX IF NOT EXISTS geo_issues_workspace_status_idx
      ON geo_issues(workspace_id, status, severity);
    CREATE INDEX IF NOT EXISTS geo_events_workspace_sequence_idx
      ON geo_events(workspace_id, sequence DESC);
    CREATE INDEX IF NOT EXISTS geo_observations_workspace_date_idx
      ON geo_observations(workspace_id, observation_date DESC);
    CREATE INDEX IF NOT EXISTS skill_suites_city_status_idx
      ON skill_suites(tenant_id, city_id, status, updated_at DESC);
    CREATE INDEX IF NOT EXISTS skill_network_versions_suite_status_idx
      ON skill_network_versions(suite_id, status, name);
    CREATE INDEX IF NOT EXISTS skill_invocations_suite_created_idx
      ON skill_network_invocations(suite_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS skill_events_suite_sequence_idx
      ON skill_network_events(suite_id, sequence DESC);
    CREATE INDEX IF NOT EXISTS merchant_orders_store_status_idx
      ON merchant_orders(store_id, status, updated_at DESC);
    CREATE INDEX IF NOT EXISTS merchant_orders_merchant_placed_idx
      ON merchant_orders(merchant_id, placed_at DESC);
    CREATE INDEX IF NOT EXISTS merchant_daily_metrics_store_date_idx
      ON merchant_daily_metrics(store_id, business_date DESC);
    CREATE INDEX IF NOT EXISTS merchant_order_events_order_sequence_idx
      ON merchant_order_events(order_id, sequence DESC);
    CREATE INDEX IF NOT EXISTS merchant_spus_catalog_status_idx
      ON merchant_spus(catalog_id, status, sort_order, updated_at DESC);
    CREATE INDEX IF NOT EXISTS merchant_skus_spu_status_idx
      ON merchant_skus(spu_id, status, updated_at DESC);
    CREATE INDEX IF NOT EXISTS merchant_slots_sku_weekday_idx
      ON merchant_service_slots(sku_id, weekday, start_time);
    CREATE INDEX IF NOT EXISTS merchant_catalog_events_catalog_sequence_idx
      ON merchant_catalog_events(catalog_id, sequence DESC);
    CREATE INDEX IF NOT EXISTS merchant_members_store_segment_idx
      ON merchant_members(store_id, segment, updated_at DESC);
    CREATE INDEX IF NOT EXISTS merchant_members_store_risk_idx
      ON merchant_members(store_id, churn_risk, repurchase_probability);
    CREATE INDEX IF NOT EXISTS merchant_member_timeline_member_occurred_idx
      ON merchant_member_timeline(member_id, occurred_at DESC);
    CREATE INDEX IF NOT EXISTS merchant_benefits_member_status_idx
      ON merchant_member_benefits(member_id, status, expires_at);
    CREATE INDEX IF NOT EXISTS merchant_recall_tasks_store_scheduled_idx
      ON merchant_member_recall_tasks(store_id, status, scheduled_at DESC);
    CREATE INDEX IF NOT EXISTS merchant_member_events_store_sequence_idx
      ON merchant_member_events(store_id, sequence DESC);
    CREATE INDEX IF NOT EXISTS consumer_deal_publications_store_status_idx
      ON consumer_deal_publications(store_id, status, valid_until);
    CREATE INDEX IF NOT EXISTS consumer_deal_drafts_user_updated_idx
      ON consumer_deal_drafts(user_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS consumer_deal_events_draft_sequence_idx
      ON consumer_deal_events(draft_id, sequence DESC);
    CREATE INDEX IF NOT EXISTS consumer_deal_holds_status_expiry_idx
      ON consumer_deal_fulfillment_holds(status, expires_at);
    CREATE INDEX IF NOT EXISTS consumer_deal_payment_status_idx
      ON consumer_deal_payment_intents(status, updated_at);
    CREATE TRIGGER IF NOT EXISTS consumer_deal_events_no_update
      BEFORE UPDATE ON consumer_deal_events BEGIN
        SELECT RAISE(ABORT, 'consumer_deal_events is append-only');
      END;
    CREATE TRIGGER IF NOT EXISTS consumer_deal_events_no_delete
      BEFORE DELETE ON consumer_deal_events BEGIN
        SELECT RAISE(ABORT, 'consumer_deal_events is append-only');
      END;
    CREATE TRIGGER IF NOT EXISTS consumer_deal_order_snapshots_no_update
      BEFORE UPDATE ON consumer_deal_order_snapshots BEGIN
        SELECT RAISE(ABORT, 'consumer_deal_order_snapshots is append-only');
      END;
    CREATE TRIGGER IF NOT EXISTS consumer_deal_order_snapshots_no_delete
      BEFORE DELETE ON consumer_deal_order_snapshots BEGIN
        SELECT RAISE(ABORT, 'consumer_deal_order_snapshots is append-only');
      END;
    CREATE TRIGGER IF NOT EXISTS consumer_deal_draft_slot_snapshots_no_update
      BEFORE UPDATE ON consumer_deal_draft_slot_snapshots BEGIN
        SELECT RAISE(ABORT, 'consumer_deal_draft_slot_snapshots is append-only');
      END;
    CREATE TRIGGER IF NOT EXISTS consumer_deal_draft_slot_snapshots_no_delete
      BEFORE DELETE ON consumer_deal_draft_slot_snapshots BEGIN
        SELECT RAISE(ABORT, 'consumer_deal_draft_slot_snapshots is append-only');
      END;
  `)

  migrateConsumerDealLifecycle(database)
  migrateLeadOwnershipEvents(database)

  if (process.env.NODE_ENV !== 'production' && process.env.LEQU_SEED_DEMO_AUTH !== 'false') {
    seedDevelopmentIdentity(database)
    seedOnboardingDemo(database)
    seedSalesCrmDemo(database)
    seedSalesWorkbenchDemo(database)
    seedSalesPerformanceDemo(database)
    seedSalesTeamDemo(database)
    seedMerchantOperationsDemo(database)
    seedMerchantCatalogDemo(database)
    seedMerchantMemberDemo(database)
    seedConsumerHomeDemo(database)
    seedConsumerNearbyDemo(database)
    seedConsumerDealDemo(database)
    seedProviderRenewalDemo(database)
    seedProviderCitySettlementDemo(database)
  }

  backfillConsumerDealCheckoutStates(database)
  backfillProviderDeliveryCases(database)

  const current = database
    .prepare("SELECT value FROM app_settings WHERE key = 'current_run_id'")
    .get() as { value: string } | undefined

  if (!current) {
    const now = new Date().toISOString()
    const runId = randomUUID()
    database
      .prepare('INSERT INTO demo_runs (run_id, created_at, updated_at) VALUES (?, ?, ?)')
      .run(runId, now, now)
    database
      .prepare("INSERT INTO app_settings (key, value) VALUES ('current_run_id', ?)")
      .run(runId)
  }

  return database
}

function backfillConsumerDealCheckoutStates(database: DatabaseSync): void {
  database.prepare(
    `INSERT OR IGNORE INTO consumer_deal_checkout_states
     (draft_id, tenant_id, user_id, status, order_id, payment_intent_id,
      version, confirmed_at, expired_at, updated_at)
     SELECT id, tenant_id, user_id, 'WAITING_CONFIRMATION', NULL, NULL,
            version, NULL, NULL, updated_at
     FROM consumer_deal_drafts`,
  ).run()
}

function migrateConsumerDealLifecycle(database: DatabaseSync): void {
  const paymentSchema = database.prepare(
    `SELECT sql FROM sqlite_master
     WHERE type = 'table' AND name = 'consumer_deal_payment_intents'`,
  ).get() as { sql: string } | undefined
  if (
    paymentSchema
    && (!paymentSchema.sql.includes('LATE_SUCCEEDED')
      || !paymentSchema.sql.includes('provider_transaction_id'))
  ) {
    database.exec(`
      BEGIN IMMEDIATE;
      DROP INDEX IF EXISTS consumer_deal_payment_status_idx;
      ALTER TABLE consumer_deal_payment_intents
        RENAME TO consumer_deal_payment_intents_legacy;

      CREATE TABLE consumer_deal_payment_intents (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        draft_id TEXT NOT NULL UNIQUE,
        order_id TEXT NOT NULL UNIQUE,
        provider TEXT NOT NULL CHECK (provider = 'WECHAT_PAY'),
        currency TEXT NOT NULL CHECK (currency = 'CNY'),
        amount_fen INTEGER NOT NULL CHECK (amount_fen > 0),
        status TEXT NOT NULL CHECK (
          status IN ('PENDING_PROVIDER', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'LATE_SUCCEEDED')
        ),
        provider_request_id TEXT NOT NULL UNIQUE,
        provider_transaction_id TEXT UNIQUE,
        failure_code TEXT,
        late_success INTEGER NOT NULL DEFAULT 0 CHECK (late_success IN (0, 1)),
        succeeded_at TEXT,
        failed_at TEXT,
        cancelled_at TEXT,
        version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (draft_id) REFERENCES consumer_deal_drafts(id),
        FOREIGN KEY (order_id) REFERENCES merchant_orders(id)
      ) STRICT;

      INSERT INTO consumer_deal_payment_intents
        (id, tenant_id, user_id, draft_id, order_id, provider, currency,
         amount_fen, status, provider_request_id, provider_transaction_id,
         failure_code, late_success, succeeded_at, failed_at, cancelled_at,
         version, created_at, updated_at)
      SELECT id, tenant_id, user_id, draft_id, order_id, provider, currency,
             amount_fen, status, provider_request_id, NULL, NULL, 0,
             NULL, NULL, CASE WHEN status = 'CANCELLED' THEN updated_at ELSE NULL END,
             version, created_at, updated_at
      FROM consumer_deal_payment_intents_legacy;

      DROP TABLE consumer_deal_payment_intents_legacy;
      CREATE INDEX consumer_deal_payment_status_idx
        ON consumer_deal_payment_intents(status, updated_at);
      COMMIT;
    `)
  }

  const holdSchema = database.prepare(
    `SELECT sql FROM sqlite_master
     WHERE type = 'table' AND name = 'consumer_deal_fulfillment_holds'`,
  ).get() as { sql: string } | undefined
  if (
    holdSchema
    && (!holdSchema.sql.includes('FULFILLED') || !holdSchema.sql.includes('consumed_at'))
  ) {
    database.exec(`
      BEGIN IMMEDIATE;
      DROP INDEX IF EXISTS consumer_deal_holds_status_expiry_idx;
      ALTER TABLE consumer_deal_fulfillment_holds
        RENAME TO consumer_deal_fulfillment_holds_legacy;

      CREATE TABLE consumer_deal_fulfillment_holds (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        draft_id TEXT NOT NULL UNIQUE,
        order_id TEXT NOT NULL UNIQUE,
        sku_id TEXT NOT NULL,
        slot_id TEXT,
        quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 10),
        status TEXT NOT NULL CHECK (status IN ('HELD', 'CONSUMED', 'RELEASED', 'FULFILLED')),
        expires_at TEXT NOT NULL,
        consumed_at TEXT,
        released_at TEXT,
        fulfilled_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (draft_id) REFERENCES consumer_deal_drafts(id),
        FOREIGN KEY (order_id) REFERENCES merchant_orders(id),
        FOREIGN KEY (sku_id) REFERENCES merchant_skus(id),
        FOREIGN KEY (slot_id) REFERENCES merchant_service_slots(id)
      ) STRICT;

      INSERT INTO consumer_deal_fulfillment_holds
        (id, tenant_id, user_id, draft_id, order_id, sku_id, slot_id, quantity,
         status, expires_at, consumed_at, released_at, fulfilled_at, created_at, updated_at)
      SELECT id, tenant_id, user_id, draft_id, order_id, sku_id, slot_id, quantity,
             status, expires_at,
             CASE WHEN status = 'CONSUMED' THEN updated_at ELSE NULL END,
             released_at, NULL, created_at, updated_at
      FROM consumer_deal_fulfillment_holds_legacy;

      DROP TABLE consumer_deal_fulfillment_holds_legacy;
      CREATE INDEX consumer_deal_holds_status_expiry_idx
        ON consumer_deal_fulfillment_holds(status, expires_at);
      COMMIT;
    `)
  }

  database.exec(`
    CREATE TABLE IF NOT EXISTS payment_connector_receipts (
      provider_event_id TEXT PRIMARY KEY,
      request_hash TEXT NOT NULL,
      scope TEXT NOT NULL,
      aggregate_id TEXT NOT NULL,
      response_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS consumer_deal_payment_events (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      id TEXT NOT NULL UNIQUE,
      tenant_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      intent_id TEXT NOT NULL,
      draft_id TEXT NOT NULL,
      order_id TEXT NOT NULL,
      provider_event_id TEXT UNIQUE,
      type TEXT NOT NULL,
      request_hash TEXT NOT NULL,
      outcome TEXT NOT NULL,
      summary TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (intent_id) REFERENCES consumer_deal_payment_intents(id),
      FOREIGN KEY (draft_id) REFERENCES consumer_deal_drafts(id),
      FOREIGN KEY (order_id) REFERENCES merchant_orders(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS consumer_deal_refund_requests (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      draft_id TEXT NOT NULL,
      order_id TEXT NOT NULL,
      payment_intent_id TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('CONSUMER_REQUESTED', 'LATE_PAYMENT_COMPENSATION')),
      amount_fen INTEGER NOT NULL CHECK (amount_fen > 0),
      reason TEXT NOT NULL,
      status TEXT NOT NULL CHECK (
        status IN ('REQUESTED', 'APPROVED_PENDING_PROVIDER', 'REFUNDED', 'FAILED')
      ),
      provider_refund_id TEXT UNIQUE,
      failure_code TEXT,
      version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (draft_id) REFERENCES consumer_deal_drafts(id),
      FOREIGN KEY (order_id) REFERENCES merchant_orders(id),
      FOREIGN KEY (payment_intent_id) REFERENCES consumer_deal_payment_intents(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS consumer_deal_refund_attempts (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      refund_id TEXT NOT NULL,
      provider_request_id TEXT NOT NULL UNIQUE,
      amount_fen INTEGER NOT NULL CHECK (amount_fen > 0),
      currency TEXT NOT NULL CHECK (currency = 'CNY'),
      status TEXT NOT NULL CHECK (status IN ('PENDING_PROVIDER', 'SUCCEEDED', 'FAILED')),
      provider_refund_id TEXT UNIQUE,
      failure_code TEXT,
      version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (refund_id) REFERENCES consumer_deal_refund_requests(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS consumer_deal_redemption_credentials (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      draft_id TEXT NOT NULL UNIQUE,
      order_id TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL CHECK (status IN ('ISSUED', 'REDEEMED', 'REVOKED', 'EXPIRED')),
      code_hash TEXT NOT NULL,
      code_masked TEXT NOT NULL,
      derivation_nonce TEXT NOT NULL UNIQUE,
      key_version TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      issued_at TEXT NOT NULL,
      redeemed_at TEXT,
      revoked_at TEXT,
      version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
      updated_at TEXT NOT NULL,
      FOREIGN KEY (draft_id) REFERENCES consumer_deal_drafts(id),
      FOREIGN KEY (order_id) REFERENCES merchant_orders(id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS consumer_deal_redemption_events (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      id TEXT NOT NULL UNIQUE,
      tenant_id TEXT NOT NULL,
      credential_id TEXT NOT NULL,
      order_id TEXT NOT NULL,
      type TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      summary TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (credential_id) REFERENCES consumer_deal_redemption_credentials(id),
      FOREIGN KEY (order_id) REFERENCES merchant_orders(id)
    ) STRICT;

    CREATE INDEX IF NOT EXISTS consumer_deal_payment_events_intent_sequence_idx
      ON consumer_deal_payment_events(intent_id, sequence DESC);
    CREATE INDEX IF NOT EXISTS consumer_deal_refund_order_status_idx
      ON consumer_deal_refund_requests(order_id, status, updated_at DESC);
    CREATE INDEX IF NOT EXISTS consumer_deal_refund_attempt_refund_created_idx
      ON consumer_deal_refund_attempts(refund_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS consumer_deal_credential_status_expiry_idx
      ON consumer_deal_redemption_credentials(status, expires_at);
    CREATE INDEX IF NOT EXISTS consumer_deal_redemption_order_sequence_idx
      ON consumer_deal_redemption_events(order_id, sequence DESC);

    CREATE TRIGGER IF NOT EXISTS consumer_deal_payment_events_no_update
      BEFORE UPDATE ON consumer_deal_payment_events BEGIN
        SELECT RAISE(ABORT, 'consumer_deal_payment_events is append-only');
      END;
    CREATE TRIGGER IF NOT EXISTS consumer_deal_payment_events_no_delete
      BEFORE DELETE ON consumer_deal_payment_events BEGIN
        SELECT RAISE(ABORT, 'consumer_deal_payment_events is append-only');
      END;
    CREATE TRIGGER IF NOT EXISTS consumer_deal_redemption_events_no_update
      BEFORE UPDATE ON consumer_deal_redemption_events BEGIN
        SELECT RAISE(ABORT, 'consumer_deal_redemption_events is append-only');
      END;
    CREATE TRIGGER IF NOT EXISTS consumer_deal_redemption_events_no_delete
      BEFORE DELETE ON consumer_deal_redemption_events BEGIN
        SELECT RAISE(ABORT, 'consumer_deal_redemption_events is append-only');
      END;
  `)
}

function backfillProviderDeliveryCases(database: DatabaseSync): void {
  const leads = database.prepare(
    `SELECT leads.id, leads.tenant_id, leads.city_id, leads.name,
            leads.owner_id, leads.updated_at
     FROM leads
     WHERE leads.stage IN ('SIGNED', 'ASSET_REVIEW', 'READY_FOR_DELIVERY')
        OR EXISTS (
          SELECT 1 FROM miniapp_factory_projects projects
          WHERE projects.lead_id = leads.id
        )
        OR EXISTS (
          SELECT 1 FROM geo_workspaces workspaces
          WHERE workspaces.lead_id = leads.id
        )
        OR EXISTS (
          SELECT 1 FROM skill_suites suites
          WHERE suites.lead_id = leads.id
        )`,
  ).all() as unknown as Array<{
    id: string
    tenant_id: string
    city_id: string
    name: string
    owner_id: string
    updated_at: string
  }>
  for (const lead of leads) {
    ensureProviderDeliveryCase(database, {
      tenantId: lead.tenant_id,
      cityId: lead.city_id,
      leadId: lead.id,
      merchantName: lead.name,
      actorId: lead.owner_id,
      timestamp: lead.updated_at,
    })
  }
}

function migrateLeadOwnershipEvents(database: DatabaseSync): void {
  const schema = database.prepare(
    `SELECT sql FROM sqlite_master
     WHERE type = 'table' AND name = 'lead_ownership_events'`,
  ).get() as { sql: string } | undefined
  if (!schema || schema.sql.includes('APPEAL_SUBMITTED')) return

  database.exec(`
    BEGIN IMMEDIATE;
    DROP TRIGGER IF EXISTS lead_ownership_events_no_update;
    DROP TRIGGER IF EXISTS lead_ownership_events_no_delete;
    DROP INDEX IF EXISTS lead_ownership_events_lead_sequence_idx;
    ALTER TABLE lead_ownership_events RENAME TO lead_ownership_events_legacy;

    CREATE TABLE lead_ownership_events (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      id TEXT NOT NULL UNIQUE,
      tenant_id TEXT NOT NULL,
      lead_id TEXT NOT NULL,
      request_id TEXT,
      actor_id TEXT NOT NULL,
      type TEXT NOT NULL CHECK (
        type IN (
          'TRANSFER_REQUESTED', 'TRANSFER_APPROVED', 'TRANSFER_REJECTED',
          'APPEAL_SUBMITTED', 'APPEAL_APPROVED', 'APPEAL_REJECTED'
        )
      ),
      summary TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (lead_id) REFERENCES leads(id),
      FOREIGN KEY (actor_id) REFERENCES users(id)
    ) STRICT;

    INSERT INTO lead_ownership_events
      (sequence, id, tenant_id, lead_id, request_id, actor_id, type, summary, payload_json, created_at)
    SELECT sequence, id, tenant_id, lead_id, request_id, actor_id, type, summary, payload_json, created_at
    FROM lead_ownership_events_legacy;

    DROP TABLE lead_ownership_events_legacy;

    CREATE TRIGGER lead_ownership_events_no_update
    BEFORE UPDATE ON lead_ownership_events BEGIN
      SELECT RAISE(ABORT, 'lead_ownership_events is append-only');
    END;

    CREATE TRIGGER lead_ownership_events_no_delete
    BEFORE DELETE ON lead_ownership_events BEGIN
      SELECT RAISE(ABORT, 'lead_ownership_events is append-only');
    END;

    CREATE INDEX lead_ownership_events_lead_sequence_idx
      ON lead_ownership_events(lead_id, sequence DESC);
    COMMIT;
  `)
}

function seedOnboardingDemo(database: DatabaseSync): void {
  const existing = database.prepare('SELECT id FROM leads LIMIT 1').get()
  if (existing) return

  const timestamp = new Date().toISOString()
  const protection = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  const insertLead = database.prepare(
    `INSERT INTO leads
     (id, tenant_id, city_id, name, category, source, contact_name,
      contact_phone_masked, address, owner_id, stage, protection_expires_at,
      next_action, next_action_at, created_at, updated_at)
     VALUES (?, 'tenant-lequ', 'city-shanghai', ?, ?, ?, ?, ?, ?,
             'user-demo-sales', ?, ?, ?, ?, ?, ?)`,
  )
  const insertActivity = database.prepare(
    `INSERT INTO lead_activities
     (id, tenant_id, lead_id, actor_id, type, summary, payload_json, created_at)
     VALUES (?, 'tenant-lequ', ?, 'system', 'LEAD_IMPORTED', ?, '{}', ?)`,
  )

  database.exec('BEGIN;')
  try {
    const seeds = [
      ['lead-yunheli', '云和里·时令餐厅', '江浙融合菜', '销售外拓', '周云岚',
        '138****2068', '静安区愚园路 1088 号', 'NEW', '运行免费 AI 体检'],
      ['lead-muyun', '沐云咖啡研究所', '精品咖啡', '商圈活动', '顾文川',
        '186****7312', '徐汇区安福路 182 号', 'DIAGNOSED', '发送数字化提案'],
      ['lead-luming', '鹿鸣小馆', '创意川菜', '老客转介绍', '何嘉木',
        '139****1169', '长宁区延安西路 1262 号', 'CONTRACT_DRAFT', '确认合同与六层授权'],
    ] as const
    for (const seed of seeds) {
      insertLead.run(
        seed[0], seed[1], seed[2], seed[3], seed[4], seed[5], seed[6], seed[7],
        protection, seed[8], tomorrow, timestamp, timestamp,
      )
      insertActivity.run(randomUUID(), seed[0], `线索已进入销售保护期：${seed[1]}`, timestamp)
    }
    database.exec('COMMIT;')
  } catch (error) {
    database.exec('ROLLBACK;')
    throw error
  }
}

function seedSalesCrmDemo(database: DatabaseSync): void {
  const timestamp = new Date().toISOString()
  const locations = [
    {
      leadId: 'lead-yunheli',
      latitude: 31.2214,
      longitude: 121.4368,
      district: '静安区',
    },
    {
      leadId: 'lead-muyun',
      latitude: 31.2146,
      longitude: 121.4462,
      district: '徐汇区',
    },
    {
      leadId: 'lead-luming',
      latitude: 31.2098,
      longitude: 121.4237,
      district: '长宁区',
    },
  ] as const
  const insert = database.prepare(
    `INSERT OR IGNORE INTO lead_locations
     (lead_id, tenant_id, city_id, latitude, longitude, district,
      geocode_source, confidence, created_at, updated_at)
     SELECT ?, leads.tenant_id, leads.city_id, ?, ?, ?,
            'LOCAL_REFERENCE', 0.96, ?, ?
     FROM leads WHERE leads.id = ?`,
  )
  database.exec('BEGIN;')
  try {
    for (const location of locations) {
      insert.run(
        location.leadId,
        location.latitude,
        location.longitude,
        location.district,
        timestamp,
        timestamp,
        location.leadId,
      )
    }
    database.exec('COMMIT;')
  } catch (error) {
    database.exec('ROLLBACK;')
    throw error
  }
}

function seedSalesWorkbenchDemo(database: DatabaseSync): void {
  const existing = database.prepare('SELECT id FROM sales_tasks LIMIT 1').get()
  if (existing) return

  const timestamp = new Date().toISOString()
  const leads = database.prepare(
    `SELECT id, city_id, owner_id, name, stage, next_action, next_action_at, version
     FROM leads WHERE tenant_id = 'tenant-lequ' ORDER BY id`,
  ).all() as unknown as Array<{
    id: string
    city_id: string
    owner_id: string
    name: string
    stage: string
    next_action: string
    next_action_at: string
    version: number
  }>
  const taskConfiguration: Record<string, {
    id: string
    dueOffsetHours: number
    kind: string
    priority: string
  }> = {
    'lead-yunheli': {
      id: 'sales-task-e6-yunheli',
      dueOffsetHours: -2,
      kind: 'DIAGNOSIS',
      priority: 'CRITICAL',
    },
    'lead-muyun': {
      id: 'sales-task-e6-muyun',
      dueOffsetHours: 1,
      kind: 'CONTRACT',
      priority: 'HIGH',
    },
    'lead-luming': {
      id: 'sales-task-e6-luming',
      dueOffsetHours: 6,
      kind: 'CONTRACT',
      priority: 'HIGH',
    },
  }
  const insertTask = database.prepare(
    `INSERT INTO sales_tasks
     (id, tenant_id, city_id, lead_id, owner_id, title, kind, priority, status,
      due_at, reminder_at, source, source_ref, lead_version, created_at, updated_at)
     VALUES (?, 'tenant-lequ', ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?,
             'MANUAL', ?, ?, ?, ?)`,
  )
  const insertEvent = database.prepare(
    `INSERT INTO sales_task_events
     (id, tenant_id, task_id, lead_id, actor_id, type, summary, payload_json, occurred_at)
     VALUES (?, 'tenant-lequ', ?, ?, 'user-demo-sales', 'CREATED', ?, ?, ?)`,
  )

  database.exec('BEGIN;')
  try {
    for (const lead of leads) {
      const configuration = taskConfiguration[lead.id]
      if (!configuration) continue
      const dueAt = new Date(Date.now() + configuration.dueOffsetHours * 3600000).toISOString()
      const reminderAt = new Date(Date.parse(dueAt) - 3600000).toISOString()
      const actionHash = createHash('sha256')
        .update(JSON.stringify({ action: lead.next_action, dueAt: lead.next_action_at }))
        .digest('hex')
        .slice(0, 12)
      const sourceRef = `lead-next-action:${lead.id}:v${lead.version}:${actionHash}`
      insertTask.run(
        configuration.id,
        lead.city_id,
        lead.id,
        lead.owner_id,
        lead.next_action,
        configuration.kind,
        configuration.priority,
        dueAt,
        reminderAt,
        sourceRef,
        lead.version,
        timestamp,
        timestamp,
      )
      insertEvent.run(
        randomUUID(),
        configuration.id,
        lead.id,
        `已创建今日销售任务：${lead.next_action}`,
        JSON.stringify({ taskRuleVersion: 'sales-task-projection-v1', seeded: true }),
        timestamp,
      )
    }
    database.exec('COMMIT;')
  } catch (error) {
    database.exec('ROLLBACK;')
    throw error
  }
}

function seedSalesPerformanceDemo(database: DatabaseSync): void {
  const existing = database.prepare('SELECT id FROM sales_commission_ledger LIMIT 1').get()
  if (existing) return

  const monthPeriod = (offset: number): string => {
    const date = new Date()
    date.setDate(1)
    date.setMonth(date.getMonth() + offset)
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
  }
  const at = (period: string, day: number, hour = 9): string =>
    `${period}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00:00.000Z`
  const currentPeriod = monthPeriod(0)
  const previousPeriod = monthPeriod(-1)
  const timestamp = new Date().toISOString()

  const insertRule = database.prepare(
    `INSERT INTO sales_compensation_rules
     (id, tenant_id, version, category, basis, rate_bps, status,
      effective_from, created_by, created_at)
     VALUES (?, 'tenant-lequ', 'sales-compensation-demo-v1', ?, ?, ?, 'ACTIVE',
             ?, 'user-demo-hq', ?)`,
  )
  const insertTarget = database.prepare(
    `INSERT INTO sales_target_revisions
     (id, tenant_id, city_id, salesperson_id, period, signing_target_fen,
      renewal_target_fen, transaction_target_fen, version, previous_revision_id,
      reason, set_by, created_at)
     VALUES (?, 'tenant-lequ', 'city-shanghai', ?, ?, ?, ?, ?, 1, NULL, ?,
             'user-demo-city-manager', ?)`,
  )
  const insertLedger = database.prepare(
    `INSERT INTO sales_commission_ledger
     (id, tenant_id, city_id, salesperson_id, lead_id, period, category, kind,
      source_id, source_label, original_entry_id, performance_delta_fen,
      estimated_commission_delta_fen, settled_commission_delta_fen,
      rule_version, rule_snapshot_json, reason, evidence_json, actor_id,
      occurred_at, created_at)
     VALUES (?, 'tenant-lequ', 'city-shanghai', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
             'sales-compensation-demo-v1', ?, ?, ?, ?, ?, ?)`,
  )
  const ruleSnapshot = (
    category: 'SIGNING' | 'RENEWAL' | 'TRANSACTION_SHARE',
    basis: string,
    rateBps: number,
  ): string => JSON.stringify({
    category,
    basis,
    rateBps,
    formula: `服务端确认口径金额 × ${rateBps} / 10000`,
    sourceBoundary: '销售宝只读取确认事实；支付、代金券与结算事实由对应核心域提供',
  })
  const addLedger = (input: {
    id: string
    salespersonId: string
    leadId: string | null
    period: string
    category: 'SIGNING' | 'RENEWAL' | 'TRANSACTION_SHARE'
    kind: 'RECOGNITION' | 'SETTLEMENT' | 'REVERSAL'
    sourceId: string
    sourceLabel: string
    originalEntryId: string | null
    performanceDeltaFen: number
    estimatedCommissionDeltaFen: number
    settledCommissionDeltaFen: number
    basis: string
    rateBps: number
    reason: string
    evidence: string[]
    actorId: string
    occurredAt: string
  }): void => {
    insertLedger.run(
      input.id,
      input.salespersonId,
      input.leadId,
      input.period,
      input.category,
      input.kind,
      input.sourceId,
      input.sourceLabel,
      input.originalEntryId,
      input.performanceDeltaFen,
      input.estimatedCommissionDeltaFen,
      input.settledCommissionDeltaFen,
      ruleSnapshot(input.category, input.basis, input.rateBps),
      input.reason,
      JSON.stringify(input.evidence),
      input.actorId,
      input.occurredAt,
      input.occurredAt,
    )
  }

  database.exec('BEGIN;')
  try {
    insertRule.run(
      'sales-rule-signing-v1', 'SIGNING', '已确认签约收入', 500,
      at(previousPeriod, 1), timestamp,
    )
    insertRule.run(
      'sales-rule-renewal-v1', 'RENEWAL', '已确认续费收入', 400,
      at(previousPeriod, 1), timestamp,
    )
    insertRule.run(
      'sales-rule-transaction-v1', 'TRANSACTION_SHARE', '结算域确认的交易分成基数', 10,
      at(previousPeriod, 1), timestamp,
    )

    insertTarget.run(
      `sales-target-${currentPeriod}-sales-v1`, 'user-demo-sales', currentPeriod,
      150000, 80000, 600000, '城市月度目标拆解', at(currentPeriod, 1),
    )
    insertTarget.run(
      `sales-target-${currentPeriod}-peer-v1`, 'user-demo-sales-peer', currentPeriod,
      120000, 60000, 400000, '城市月度目标拆解', at(currentPeriod, 1),
    )
    insertTarget.run(
      `sales-target-${previousPeriod}-sales-v1`, 'user-demo-sales', previousPeriod,
      200000, 100000, 500000, '上月目标归档', at(previousPeriod, 1),
    )
    insertTarget.run(
      `sales-target-${previousPeriod}-peer-v1`, 'user-demo-sales-peer', previousPeriod,
      120000, 60000, 350000, '上月目标归档', at(previousPeriod, 1),
    )

    addLedger({
      id: `sales-ledger-${currentPeriod}-signing`,
      salespersonId: 'user-demo-sales',
      leadId: 'lead-yunheli',
      period: currentPeriod,
      category: 'SIGNING',
      kind: 'RECOGNITION',
      sourceId: `contract-${currentPeriod}-yunheli`,
      sourceLabel: '云和里·时令餐厅年度服务合同',
      originalEntryId: null,
      performanceDeltaFen: 99800,
      estimatedCommissionDeltaFen: 4990,
      settledCommissionDeltaFen: 0,
      basis: '已确认签约收入',
      rateBps: 500,
      reason: '电子合同与首款确认后计入签约业绩',
      evidence: ['电子合同签署快照', '首款确认事实 #PAY-2607-018'],
      actorId: 'user-demo-hq',
      occurredAt: at(currentPeriod, 3, 10),
    })
    addLedger({
      id: `sales-ledger-${currentPeriod}-signing-settlement`,
      salespersonId: 'user-demo-sales',
      leadId: 'lead-yunheli',
      period: currentPeriod,
      category: 'SIGNING',
      kind: 'SETTLEMENT',
      sourceId: `statement-${currentPeriod}-001`,
      sourceLabel: `${currentPeriod} 第一批佣金结算单`,
      originalEntryId: `sales-ledger-${currentPeriod}-signing`,
      performanceDeltaFen: 0,
      estimatedCommissionDeltaFen: -4990,
      settledCommissionDeltaFen: 4990,
      basis: '已确认签约收入',
      rateBps: 500,
      reason: '财务结算单审核通过，预计佣金转入已结',
      evidence: [`结算批次 SET-${currentPeriod}-001`, '财务复核通过'],
      actorId: 'user-demo-hq',
      occurredAt: at(currentPeriod, 8, 15),
    })
    addLedger({
      id: `sales-ledger-${currentPeriod}-renewal`,
      salespersonId: 'user-demo-sales',
      leadId: 'lead-muyun',
      period: currentPeriod,
      category: 'RENEWAL',
      kind: 'RECOGNITION',
      sourceId: `renewal-${currentPeriod}-muyun`,
      sourceLabel: '沐云咖啡研究所续费确认',
      originalEntryId: null,
      performanceDeltaFen: 49800,
      estimatedCommissionDeltaFen: 1992,
      settledCommissionDeltaFen: 0,
      basis: '已确认续费收入',
      rateBps: 400,
      reason: '续费合同生效，等待月结',
      evidence: ['续费合同 R-2607-006', '服务周期确认'],
      actorId: 'user-demo-hq',
      occurredAt: at(currentPeriod, 11),
    })
    addLedger({
      id: `sales-ledger-${currentPeriod}-transaction`,
      salespersonId: 'user-demo-sales',
      leadId: 'lead-yunheli',
      period: currentPeriod,
      category: 'TRANSACTION_SHARE',
      kind: 'RECOGNITION',
      sourceId: 'order-e5-completed-1',
      sourceLabel: '云和里已完成交易分成',
      originalEntryId: null,
      performanceDeltaFen: 468000,
      estimatedCommissionDeltaFen: 468,
      settledCommissionDeltaFen: 0,
      basis: '结算域确认的交易分成基数',
      rateBps: 10,
      reason: '订单完成且超过售后观察期，等待月结',
      evidence: ['订单 LQ26072309012', '履约完成事实'],
      actorId: 'user-demo-hq',
      occurredAt: at(currentPeriod, 14),
    })
    addLedger({
      id: `sales-ledger-${currentPeriod}-refunded-source`,
      salespersonId: 'user-demo-sales',
      leadId: 'lead-yunheli',
      period: currentPeriod,
      category: 'TRANSACTION_SHARE',
      kind: 'RECOGNITION',
      sourceId: 'order-e5-refund',
      sourceLabel: '午市四人分享套餐交易分成',
      originalEntryId: null,
      performanceDeltaFen: 32800,
      estimatedCommissionDeltaFen: 33,
      settledCommissionDeltaFen: 0,
      basis: '结算域确认的交易分成基数',
      rateBps: 10,
      reason: '订单完成后计入交易业绩',
      evidence: ['订单 LQ26072310003', '原履约完成事实'],
      actorId: 'user-demo-hq',
      occurredAt: at(currentPeriod, 15, 10),
    })
    addLedger({
      id: `sales-ledger-${currentPeriod}-refunded-settlement`,
      salespersonId: 'user-demo-sales',
      leadId: 'lead-yunheli',
      period: currentPeriod,
      category: 'TRANSACTION_SHARE',
      kind: 'SETTLEMENT',
      sourceId: `statement-${currentPeriod}-002`,
      sourceLabel: `${currentPeriod} 第二批佣金结算单`,
      originalEntryId: `sales-ledger-${currentPeriod}-refunded-source`,
      performanceDeltaFen: 0,
      estimatedCommissionDeltaFen: -33,
      settledCommissionDeltaFen: 33,
      basis: '结算域确认的交易分成基数',
      rateBps: 10,
      reason: '交易佣金进入已结批次',
      evidence: [`结算批次 SET-${currentPeriod}-002`],
      actorId: 'user-demo-hq',
      occurredAt: at(currentPeriod, 16, 16),
    })
    addLedger({
      id: `sales-ledger-${currentPeriod}-refunded-reversal`,
      salespersonId: 'user-demo-sales',
      leadId: 'lead-yunheli',
      period: currentPeriod,
      category: 'TRANSACTION_SHARE',
      kind: 'REVERSAL',
      sourceId: 'refund-order-e5-refund',
      sourceLabel: '午市四人分享套餐全额退款冲正',
      originalEntryId: `sales-ledger-${currentPeriod}-refunded-source`,
      performanceDeltaFen: -32800,
      estimatedCommissionDeltaFen: 0,
      settledCommissionDeltaFen: -33,
      basis: '结算域确认的交易分成基数',
      rateBps: 10,
      reason: '顾客全额退款，业绩与已结佣金同步冲正',
      evidence: ['退款单 RF-2607-003', '原订单 LQ26072310003', '财务复核通过'],
      actorId: 'user-demo-hq',
      occurredAt: at(currentPeriod, 18, 14),
    })

    addLedger({
      id: `sales-ledger-${currentPeriod}-peer-signing`,
      salespersonId: 'user-demo-sales-peer',
      leadId: 'lead-muyun',
      period: currentPeriod,
      category: 'SIGNING',
      kind: 'RECOGNITION',
      sourceId: `contract-${currentPeriod}-peer-001`,
      sourceLabel: '同城精品商家年度服务合同',
      originalEntryId: null,
      performanceDeltaFen: 99800,
      estimatedCommissionDeltaFen: 4990,
      settledCommissionDeltaFen: 0,
      basis: '已确认签约收入',
      rateBps: 500,
      reason: '电子合同与首款确认后计入签约业绩',
      evidence: ['电子合同签署快照', '首款确认事实'],
      actorId: 'user-demo-hq',
      occurredAt: at(currentPeriod, 7),
    })
    addLedger({
      id: `sales-ledger-${currentPeriod}-peer-transaction`,
      salespersonId: 'user-demo-sales-peer',
      leadId: 'lead-muyun',
      period: currentPeriod,
      category: 'TRANSACTION_SHARE',
      kind: 'RECOGNITION',
      sourceId: `transaction-${currentPeriod}-peer-001`,
      sourceLabel: '同城商家已完成交易分成',
      originalEntryId: null,
      performanceDeltaFen: 198000,
      estimatedCommissionDeltaFen: 198,
      settledCommissionDeltaFen: 0,
      basis: '结算域确认的交易分成基数',
      rateBps: 10,
      reason: '结算域确认交易分成基数',
      evidence: ['结算事实 TX-2607-021'],
      actorId: 'user-demo-hq',
      occurredAt: at(currentPeriod, 13),
    })

    const previousEntries = [
      ['signing', 'SIGNING', 'lead-yunheli', 199600, 9980, '上月签约收入归档', 500],
      ['renewal', 'RENEWAL', 'lead-muyun', 99800, 3992, '上月续费收入归档', 400],
      ['transaction', 'TRANSACTION_SHARE', 'lead-yunheli', 520000, 520, '上月交易分成归档', 10],
    ] as const
    for (const [suffix, category, leadId, performance, commission, label, rateBps] of previousEntries) {
      const recognitionId = `sales-ledger-${previousPeriod}-${suffix}`
      const basis = category === 'SIGNING'
        ? '已确认签约收入'
        : category === 'RENEWAL'
          ? '已确认续费收入'
          : '结算域确认的交易分成基数'
      addLedger({
        id: recognitionId,
        salespersonId: 'user-demo-sales',
        leadId,
        period: previousPeriod,
        category,
        kind: 'RECOGNITION',
        sourceId: `archive-${previousPeriod}-${suffix}`,
        sourceLabel: label,
        originalEntryId: null,
        performanceDeltaFen: performance,
        estimatedCommissionDeltaFen: commission,
        settledCommissionDeltaFen: 0,
        basis,
        rateBps,
        reason: '历史确认事实归档',
        evidence: [`${previousPeriod} 业务确认清单`],
        actorId: 'user-demo-hq',
        occurredAt: at(previousPeriod, 6),
      })
      addLedger({
        id: `${recognitionId}-settlement`,
        salespersonId: 'user-demo-sales',
        leadId,
        period: previousPeriod,
        category,
        kind: 'SETTLEMENT',
        sourceId: `statement-${previousPeriod}-${suffix}`,
        sourceLabel: `${previousPeriod} 月结单`,
        originalEntryId: recognitionId,
        performanceDeltaFen: 0,
        estimatedCommissionDeltaFen: -commission,
        settledCommissionDeltaFen: commission,
        basis,
        rateBps,
        reason: '月结批次审核完成',
        evidence: [`月结单 SET-${previousPeriod}`],
        actorId: 'user-demo-hq',
        occurredAt: at(previousPeriod, 26, 16),
      })
    }
    database.exec('COMMIT;')
  } catch (error) {
    database.exec('ROLLBACK;')
    throw error
  }
}

function seedSalesTeamDemo(database: DatabaseSync): void {
  const existing = database.prepare(
    "SELECT id FROM sales_team_units WHERE id = 'sales-team-shanghai'",
  ).get()
  if (existing) return

  const monthPeriod = (offset: number): string => {
    const date = new Date()
    date.setDate(1)
    date.setMonth(date.getMonth() + offset)
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
  }
  const dateAt = (offsetDays: number, hour = 10): string => {
    const date = new Date()
    date.setDate(date.getDate() + offsetDays)
    date.setHours(hour, 0, 0, 0)
    return date.toISOString()
  }
  const timestamp = new Date().toISOString()
  const currentPeriod = monthPeriod(0)
  const previousPeriod = monthPeriod(-1)

  const insertScorecard = database.prepare(
    `INSERT INTO sales_performance_scorecards
     (id, tenant_id, city_id, salesperson_id, period, version,
      result_score, pipeline_score, process_score, quality_score,
      compliance_score, overall_score, rating, capability_snapshot_json,
      source_snapshot_json, model_version, created_at)
     VALUES (?, 'tenant-lequ', 'city-shanghai', ?, ?, 1, ?, ?, ?, ?, ?, ?, ?,
             ?, ?, 'sales-scorecard-v1', ?)`,
  )
  const scorecard = (input: {
    id: string
    salespersonId: string
    period: string
    scores: [number, number, number, number, number, number]
    rating: 'OUTSTANDING' | 'EXCEEDS' | 'MEETS'
    capabilities: Array<{ key: string; label: string; score: number; delta: number }>
    source: Record<string, unknown>
    createdAt: string
  }): void => {
    insertScorecard.run(
      input.id, input.salespersonId, input.period, ...input.scores,
      input.rating, JSON.stringify(input.capabilities),
      JSON.stringify(input.source), input.createdAt,
    )
  }

  database.exec('BEGIN;')
  try {
    database.prepare(
      `INSERT INTO sales_team_units
       (id, tenant_id, city_id, parent_id, kind, name, leader_id, sort_order,
        status, version, created_at, updated_at)
       VALUES (?, 'tenant-lequ', 'city-shanghai', ?, ?, ?, ?, ?, 'ACTIVE', 1, ?, ?)`,
    ).run(
      'sales-team-shanghai', null, 'CITY', '上海销售中心',
      'user-demo-city-manager', 10, timestamp, timestamp,
    )
    database.prepare(
      `INSERT INTO sales_team_units
       (id, tenant_id, city_id, parent_id, kind, name, leader_id, sort_order,
        status, version, created_at, updated_at)
       VALUES (?, 'tenant-lequ', 'city-shanghai', ?, ?, ?, ?, ?, 'ACTIVE', 1, ?, ?)`,
    ).run(
      'sales-team-shanghai-one', 'sales-team-shanghai', 'SQUAD', '上海一队',
      'user-demo-city-manager', 20, timestamp, timestamp,
    )

    const insertMember = database.prepare(
      `INSERT INTO sales_team_members
       (id, tenant_id, city_id, team_unit_id, salesperson_id, career_level,
        employment_status, mentor_id, joined_at, version, created_at, updated_at)
       VALUES (?, 'tenant-lequ', 'city-shanghai', 'sales-team-shanghai-one', ?, ?,
               ?, 'user-demo-city-manager', ?, 1, ?, ?)`,
    )
    insertMember.run(
      'sales-member-yifan', 'user-demo-sales', 'SENIOR', 'ACTIVE',
      dateAt(-420), timestamp, timestamp,
    )
    insertMember.run(
      'sales-member-ningan', 'user-demo-sales-peer', 'CONSULTANT', 'PROBATION',
      dateAt(-165), timestamp, timestamp,
    )

    scorecard({
      id: `scorecard-${previousPeriod}-yifan`,
      salespersonId: 'user-demo-sales',
      period: previousPeriod,
      scores: [88, 81, 86, 84, 97, 87],
      rating: 'EXCEEDS',
      capabilities: [
        { key: 'DISCOVERY', label: '商机洞察', score: 84, delta: 0 },
        { key: 'DIAGNOSIS', label: '诊断提案', score: 88, delta: 0 },
        { key: 'PROPOSAL', label: '价值呈现', score: 85, delta: 0 },
        { key: 'NEGOTIATION', label: '商务谈判', score: 76, delta: 0 },
        { key: 'COMPLIANCE', label: '合规质量', score: 97, delta: 0 },
      ],
      source: { archived: true, period: previousPeriod },
      createdAt: `${previousPeriod}-28T10:00:00.000Z`,
    })
    scorecard({
      id: `scorecard-${currentPeriod}-yifan`,
      salespersonId: 'user-demo-sales',
      period: currentPeriod,
      scores: [89, 87, 92, 90, 98, 91],
      rating: 'OUTSTANDING',
      capabilities: [
        { key: 'DISCOVERY', label: '商机洞察', score: 89, delta: 5 },
        { key: 'DIAGNOSIS', label: '诊断提案', score: 92, delta: 4 },
        { key: 'PROPOSAL', label: '价值呈现', score: 91, delta: 6 },
        { key: 'NEGOTIATION', label: '商务谈判', score: 82, delta: 6 },
        { key: 'COMPLIANCE', label: '合规质量', score: 98, delta: 1 },
      ],
      source: {
        targetRuleVersion: 'sales-target-revision-v1',
        commissionLedgerVersion: 'sales-commission-ledger-v1',
        processFacts: 12,
        qualityReviews: 6,
      },
      createdAt: dateAt(-1, 18),
    })
    scorecard({
      id: `scorecard-${previousPeriod}-ningan`,
      salespersonId: 'user-demo-sales-peer',
      period: previousPeriod,
      scores: [65, 72, 79, 87, 98, 79],
      rating: 'MEETS',
      capabilities: [
        { key: 'DISCOVERY', label: '商机洞察', score: 76, delta: 0 },
        { key: 'DIAGNOSIS', label: '诊断提案', score: 72, delta: 0 },
        { key: 'PROPOSAL', label: '价值呈现', score: 78, delta: 0 },
        { key: 'NEGOTIATION', label: '商务谈判', score: 79, delta: 0 },
        { key: 'COMPLIANCE', label: '合规质量', score: 98, delta: 0 },
      ],
      source: { archived: true, period: previousPeriod },
      createdAt: `${previousPeriod}-28T10:00:00.000Z`,
    })
    scorecard({
      id: `scorecard-${currentPeriod}-ningan`,
      salespersonId: 'user-demo-sales-peer',
      period: currentPeriod,
      scores: [78, 84, 88, 91, 99, 87],
      rating: 'EXCEEDS',
      capabilities: [
        { key: 'DISCOVERY', label: '商机洞察', score: 84, delta: 8 },
        { key: 'DIAGNOSIS', label: '诊断提案', score: 82, delta: 10 },
        { key: 'PROPOSAL', label: '价值呈现', score: 86, delta: 8 },
        { key: 'NEGOTIATION', label: '商务谈判', score: 83, delta: 4 },
        { key: 'COMPLIANCE', label: '合规质量', score: 99, delta: 1 },
      ],
      source: {
        targetRuleVersion: 'sales-target-revision-v1',
        commissionLedgerVersion: 'sales-commission-ledger-v1',
        processFacts: 9,
        qualityReviews: 4,
      },
      createdAt: dateAt(-1, 18),
    })

    const insertLevelEvent = database.prepare(
      `INSERT INTO sales_level_change_events
       (id, tenant_id, city_id, request_id, member_id, kind, from_level, to_level,
        direction, reason, evidence_json, metrics_snapshot_json, actor_id,
        occurred_at, created_at)
       VALUES (?, 'tenant-lequ', 'city-shanghai', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    insertLevelEvent.run(
      'level-event-yifan-requested', 'level-request-yifan-senior', 'sales-member-yifan',
      'REQUESTED', 'CONSULTANT', 'SENIOR', 'PROMOTION',
      '连续两个周期目标达成且客户质量稳定',
      JSON.stringify(['两期绩效归档', '合规复核通过']),
      JSON.stringify({ overallScore: 87, complianceScore: 97, eligible: true }),
      'user-demo-city-manager', dateAt(-75), dateAt(-75),
    )
    insertLevelEvent.run(
      'level-event-yifan-approved', 'level-request-yifan-senior', 'sales-member-yifan',
      'APPROVED', 'CONSULTANT', 'SENIOR', 'PROMOTION',
      '总部人才校准会审批通过',
      JSON.stringify(['人才校准会纪要 #TC-2026-04']),
      JSON.stringify({ overallScore: 87, complianceScore: 97, eligible: true }),
      'user-demo-hq', dateAt(-68), dateAt(-68),
    )
    insertLevelEvent.run(
      'level-event-ningan-requested', 'level-request-ningan-senior', 'sales-member-ningan',
      'REQUESTED', 'CONSULTANT', 'SENIOR', 'PROMOTION',
      '诊断与提案能力提升明显，申请进入高级顾问校准',
      JSON.stringify(['本月绩效卡 v1', '4 次陪访复盘', '合规检查通过']),
      JSON.stringify({
        overallScore: 87, complianceScore: 99, achievementRate: 51.3, eligible: true,
      }),
      'user-demo-city-manager', dateAt(-2), dateAt(-2),
    )

    const insertPlan = database.prepare(
      `INSERT INTO sales_coaching_plans
       (id, tenant_id, city_id, member_id, coach_id, title, focus_capability,
        goal, actions_json, success_metric, due_at, next_session_at, status,
        version, created_at, updated_at)
       VALUES (?, 'tenant-lequ', 'city-shanghai', ?, 'user-demo-city-manager', ?,
               ?, ?, ?, ?, ?, ?, 'ACTIVE', 1, ?, ?)`,
    )
    insertPlan.run(
      'coaching-plan-yifan-negotiation', 'sales-member-yifan',
      '复杂决策链谈判突破', 'NEGOTIATION',
      '把多决策人商机的方案确认率提升到 70%',
      JSON.stringify(['复盘 2 个复杂商机', '完成 1 次异议模拟', '经理陪访重点提案']),
      '连续 4 个复杂商机中至少 3 个进入合同阶段',
      dateAt(28), dateAt(3, 16), dateAt(-12), dateAt(-1),
    )
    insertPlan.run(
      'coaching-plan-ningan-diagnosis', 'sales-member-ningan',
      '诊断提案结构化训练', 'DIAGNOSIS',
      '独立完成高质量 AI 体检讲解与价值映射',
      JSON.stringify(['完成 3 份体检讲解', '旁听高级顾问提案', '每周一次案例复盘']),
      '经理抽检 3 份提案，平均质量分达到 90',
      dateAt(35), dateAt(5, 15), dateAt(-18), dateAt(-2),
    )

    const insertCoachingEvent = database.prepare(
      `INSERT INTO sales_coaching_events
       (id, tenant_id, city_id, plan_id, kind, note, evidence_json,
        actor_id, occurred_at, created_at)
       VALUES (?, 'tenant-lequ', 'city-shanghai', ?, ?, ?, ?, ?, ?, ?)`,
    )
    insertCoachingEvent.run(
      'coaching-event-yifan-created', 'coaching-plan-yifan-negotiation', 'CREATED',
      '基于能力雷达与商机阶段转化创建培养计划',
      JSON.stringify(['能力雷达 NEGOTIATION=76']), 'user-demo-city-manager',
      dateAt(-12), dateAt(-12),
    )
    insertCoachingEvent.run(
      'coaching-event-yifan-checkin', 'coaching-plan-yifan-negotiation', 'CHECK_IN',
      '已完成首轮复杂商机复盘，下一步强化价格异议拆解',
      JSON.stringify(['复盘纪要 #COACH-0718']), 'user-demo-city-manager',
      dateAt(-1), dateAt(-1),
    )
    insertCoachingEvent.run(
      'coaching-event-ningan-created', 'coaching-plan-ningan-diagnosis', 'CREATED',
      '结合晋升准备期建立结构化诊断培养计划',
      JSON.stringify(['晋升准备评估']), 'user-demo-city-manager',
      dateAt(-18), dateAt(-18),
    )
    insertCoachingEvent.run(
      'coaching-event-ningan-checkin', 'coaching-plan-ningan-diagnosis', 'CHECK_IN',
      '第二份提案质量分达到 92，讲解结构显著改善',
      JSON.stringify(['提案抽检 #QA-2607-021']), 'user-demo-city-manager',
      dateAt(-2), dateAt(-2),
    )
    database.exec('COMMIT;')
  } catch (error) {
    database.exec('ROLLBACK;')
    throw error
  }
}

function seedMerchantOperationsDemo(database: DatabaseSync): void {
  const existing = database.prepare(
    "SELECT id FROM merchant_stores WHERE id = 'store-demo-jingan'",
  ).get()
  if (existing) return

  const timestamp = new Date().toISOString()
  const dateAt = (daysAgo: number, hour: number, minute = 0): string => {
    const date = new Date()
    date.setDate(date.getDate() - daysAgo)
    date.setHours(hour, minute, 0, 0)
    return date.toISOString()
  }
  const businessDate = (daysAgo: number): string => dateAt(daysAgo, 12).slice(0, 10)
  const today = businessDate(0)
  const verificationHash = sha256('682941')

  database.exec('BEGIN;')
  try {
    database.prepare(
      `INSERT INTO merchant_stores
       (id, tenant_id, merchant_id, city_id, name, city_name, address, business_hours,
        operating_status, manager_name, created_at, updated_at)
       VALUES ('store-demo-jingan', 'tenant-lequ', 'merchant-demo', 'city-shanghai',
        '云和里·静安店', '上海', '静安区愚园路 1088 号', '11:00–22:00',
        'OPEN', '周云岚', ?, ?)`,
    ).run(timestamp, timestamp)

    const metricInsert = database.prepare(
      `INSERT INTO merchant_daily_metrics
       (id, tenant_id, merchant_id, store_id, business_date, revenue_fen,
        previous_revenue_fen, order_count, new_member_count, issued_verification_count,
        verified_count, visitor_count, ai_health_score, updated_at)
       VALUES (?, 'tenant-lequ', 'merchant-demo', 'store-demo-jingan', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    const daily = [
      [0, 1268000, 1126100, 156, 18, 166, 160, 2418, 88],
      [1, 1126100, 1050000, 143, 14, 150, 144, 2186, 84],
      [2, 1050000, 1184000, 137, 16, 145, 137, 2098, 82],
      [3, 1184000, 1098000, 149, 17, 153, 147, 2274, 85],
      [4, 1098000, 1216000, 141, 13, 148, 140, 2155, 83],
      [5, 1216000, 1162000, 152, 19, 159, 151, 2328, 86],
      [6, 1162000, 1039000, 146, 15, 151, 144, 2214, 84],
    ] as const
    for (const item of daily) {
      metricInsert.run(
        randomUUID(), businessDate(item[0]), item[1], item[2], item[3], item[4],
        item[5], item[6], item[7], item[8], timestamp,
      )
    }

    const orderInsert = database.prepare(
      `INSERT INTO merchant_orders
       (id, tenant_id, merchant_id, store_id, order_no, order_type, channel, status,
        customer_name, customer_phone_masked, item_summary, party_size, service_at,
        gross_amount_fen, discount_fen, paid_amount_fen, refund_amount_fen,
        verification_code_hash, verification_code_masked, exception_code,
        placed_at, created_at, updated_at)
       VALUES (?, 'tenant-lequ', 'merchant-demo', 'store-demo-jingan', ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    const orders = [
      ['order-e5-pending', 'LQ26072310001', 'RESERVATION', 'SKILL', 'PENDING_CONFIRMATION',
        '陈知夏', '138****2068', '时令双人晚餐 · 靠窗座', 2, dateAt(-1, 18, 30),
        86800, 10000, 76800, 0, verificationHash, '•• 2941', null, dateAt(0, 10, 8)],
      ['order-e5-confirmed', 'LQ26072310002', 'RESERVATION', 'MINIAPP', 'CONFIRMED',
        '林一凡', '186****7312', '主厨尝鲜双人套餐', 2, dateAt(0, 19, 0),
        62800, 0, 62800, 0, verificationHash, '•• 2941', null, dateAt(0, 9, 42)],
      ['order-e5-refund', 'LQ26072310003', 'GROUP_BUY', 'MARKETPLACE', 'REFUND_REQUESTED',
        '何嘉木', '139****1169', '午市四人分享套餐', 4, dateAt(0, 12, 0),
        32800, 0, 32800, 32800, verificationHash, '•• 2941', null, dateAt(0, 9, 15)],
      ['order-e5-exception', 'LQ26072310004', 'ECOMMERCE', 'MINIAPP', 'EXCEPTION',
        '顾文川', '137****5086', '江南时令礼盒 × 2', null, null,
        128800, 0, 128800, 0, null, null, 'INVENTORY_LOCK_TIMEOUT', dateAt(0, 8, 56)],
      ['order-e5-completed-1', 'LQ26072309012', 'GROUP_BUY', 'POS', 'COMPLETED',
        '王女士', '135****8120', '十味宴四人套餐', 4, dateAt(0, 12, 30),
        468000, 0, 468000, 0, verificationHash, '•• 2941', null, dateAt(0, 8, 10)],
      ['order-e5-completed-2', 'LQ26072309011', 'GROUP_BUY', 'MINIAPP', 'VERIFIED',
        '张先生', '189****6630', '春江双人套餐', 2, dateAt(0, 12, 0),
        328000, 0, 328000, 0, verificationHash, '•• 2941', null, dateAt(0, 7, 48)],
      ['order-e5-completed-3', 'LQ26072309010', 'RESERVATION', 'SKILL', 'COMPLETED',
        '沈女士', '158****3017', '纪念日晚餐 · 双人', 2, dateAt(0, 11, 45),
        198000, 0, 198000, 0, verificationHash, '•• 2941', null, dateAt(0, 7, 26)],
      ['order-e5-completed-4', 'LQ26072309009', 'ECOMMERCE', 'MINIAPP', 'COMPLETED',
        '陆先生', '136****7715', '云和里甄选礼盒', null, null,
        274000, 0, 274000, 0, null, null, null, dateAt(0, 7, 2)],
    ] as const
    for (const order of orders) {
      orderInsert.run(...order, timestamp, timestamp)
    }

    const recommendationInsert = database.prepare(
      `INSERT INTO merchant_ai_recommendations
       (id, tenant_id, merchant_id, store_id, business_date, priority, title,
        rationale, expected_impact, evidence_json, action_label, action_target,
        risk_level, model_version, status, created_at, updated_at)
       VALUES (?, 'tenant-lequ', 'merchant-demo', 'store-demo-jingan', ?, ?, ?, ?, ?, ?,
        ?, ?, ?, 'merchant-copilot-2026.07', 'OPEN', ?, ?)`,
    )
    const recommendations = [
      [1, '先确认 18:30 的订座', '高峰时段仅剩 2 张双人桌，确认后可降低顾客等待与流失。',
        '预计减少 1 笔高峰流失', ['订单 LQ26072310001 等待 18 分钟', '18:00–20:00 桌位占用率 87%'],
        '立即确认', 'ORDERS', 'L1'],
      [2, '处理待退款，避免超时升级', '该退款已接近 45 分钟服务时限，需要主理人强确认。',
        '避免平台介入与体验扣分', ['退款金额 ¥328', '已等待 42 分钟'],
        '审核退款', 'ORDERS', 'L2'],
      [3, '补齐晚餐套餐主图', '3 个高浏览套餐缺少统一场景主图，午后访问转化低于近 7 日均值。',
        '预计提升套餐详情转化 3%–6%', ['详情访问 328 次', '访问到下单转化 6.5%'],
        '查看经营分析', 'ANALYTICS', 'L1'],
    ] as const
    for (const item of recommendations) {
      recommendationInsert.run(
        randomUUID(), today, item[0], item[1], item[2], item[3],
        JSON.stringify(item[4]), item[5], item[6], item[7], timestamp, timestamp,
      )
    }
    database.exec('COMMIT;')
  } catch (error) {
    database.exec('ROLLBACK;')
    throw error
  }
}

function seedMerchantCatalogDemo(database: DatabaseSync): void {
  const existing = database.prepare(
    "SELECT id FROM merchant_catalogs WHERE id = 'catalog-e5-demo'",
  ).get()
  if (existing) return

  const timestamp = new Date().toISOString()
  database.exec('BEGIN;')
  try {
    database.prepare(
      `INSERT INTO merchant_catalogs
       (id, tenant_id, merchant_id, store_id, name, status, version, created_at, updated_at)
       VALUES ('catalog-e5-demo', 'tenant-lequ', 'merchant-demo', 'store-demo-jingan',
        '云和里·静安店商品目录', 'ACTIVE', 1, ?, ?)`,
    ).run(timestamp, timestamp)

    const insertSpu = database.prepare(
      `INSERT INTO merchant_spus
       (id, tenant_id, merchant_id, catalog_id, spu_type, name, category, description,
        status, media_completion, sort_order, created_at, updated_at)
       VALUES (?, 'tenant-lequ', 'merchant-demo', 'catalog-e5-demo', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    insertSpu.run(
      'spu-e5-dinner', 'PACKAGE', '春江时令双人晚餐', '晚餐套餐',
      '六道时令菜与双人茶饮，适合约会及纪念日场景。', 'ACTIVE', 72, 10,
      timestamp, timestamp,
    )
    insertSpu.run(
      'spu-e5-tasting', 'SERVICE', '主厨时令尝鲜席', '预约服务',
      '按时段预约的主厨体验，每席 2–4 人。', 'ACTIVE', 94, 20,
      timestamp, timestamp,
    )
    insertSpu.run(
      'spu-e5-gift', 'PRODUCT', '江南时令礼盒', '零售礼盒',
      '门店自提与同城配送的季节限定礼盒。', 'ACTIVE', 88, 30,
      timestamp, timestamp,
    )
    insertSpu.run(
      'spu-e5-lunch', 'PACKAGE', '工作日午市套餐', '午餐套餐',
      '工作日限定快捷套餐，等待新一季菜单确认。', 'PAUSED', 61, 40,
      timestamp, timestamp,
    )

    const insertSku = database.prepare(
      `INSERT INTO merchant_skus
       (id, tenant_id, merchant_id, store_id, spu_id, code, name, attributes_json,
        price_fen, compare_at_fen, cost_fen, stock_mode, stock_quantity,
        low_stock_threshold, status, pricing_rule_version, created_at, updated_at)
       VALUES (?, 'tenant-lequ', 'merchant-demo', 'store-demo-jingan', ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, 'price-rule-v1', ?, ?)`,
    )
    insertSku.run(
      'sku-e5-dinner-2', 'spu-e5-dinner', 'YHL-DINNER-2', '双人标准版',
      JSON.stringify({ 人数: '2人', 包间: '否' }), 62800, 68800, 29800,
      'FINITE', 18, 5, 'ACTIVE', timestamp, timestamp,
    )
    insertSku.run(
      'sku-e5-dinner-window', 'spu-e5-dinner', 'YHL-DINNER-WINDOW', '双人靠窗版',
      JSON.stringify({ 人数: '2人', 座位: '靠窗' }), 76800, 82800, 33800,
      'FINITE', 6, 4, 'ACTIVE', timestamp, timestamp,
    )
    insertSku.run(
      'sku-e5-tasting', 'spu-e5-tasting', 'YHL-TASTING', '主厨席位',
      JSON.stringify({ 人数: '2–4人', 服务: '主厨席' }), 98800, null, 42800,
      'SLOT', 0, 0, 'ACTIVE', timestamp, timestamp,
    )
    insertSku.run(
      'sku-e5-gift', 'spu-e5-gift', 'YHL-GIFT-SUMMER', '夏季限定版',
      JSON.stringify({ 规格: '8件装', 配送: '自提/同城' }), 32800, 36800, 15800,
      'FINITE', 3, 5, 'ACTIVE', timestamp, timestamp,
    )
    insertSku.run(
      'sku-e5-lunch', 'spu-e5-lunch', 'YHL-LUNCH-WEEKDAY', '工作日单人版',
      JSON.stringify({ 人数: '1人', 日期: '工作日' }), 12800, null, 5800,
      'FINITE', 0, 10, 'PAUSED', timestamp, timestamp,
    )

    const insertSlot = database.prepare(
      `INSERT INTO merchant_service_slots
       (id, tenant_id, merchant_id, store_id, sku_id, weekday, start_time, end_time,
        capacity, reserved, price_override_fen, status, created_at, updated_at)
       VALUES (?, 'tenant-lequ', 'merchant-demo', 'store-demo-jingan',
        'sku-e5-tasting', ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)`,
    )
    const slots = [
      ['slot-e5-thu-1800', 4, '18:00', '19:30', 8, 6, null],
      ['slot-e5-thu-2000', 4, '20:00', '21:30', 8, 3, 108800],
      ['slot-e5-fri-1800', 5, '18:00', '19:30', 10, 7, null],
      ['slot-e5-fri-2000', 5, '20:00', '21:30', 10, 5, 108800],
    ] as const
    for (const slot of slots) {
      insertSlot.run(...slot, timestamp, timestamp)
    }
    database.exec('COMMIT;')
  } catch (error) {
    database.exec('ROLLBACK;')
    throw error
  }
}

function seedMerchantMemberDemo(database: DatabaseSync): void {
  const existing = database.prepare(
    "SELECT id FROM merchant_members WHERE id = 'member-e5-high-value'",
  ).get()
  if (existing) return

  const timestamp = new Date().toISOString()
  const dateAt = (daysAgo: number, hour = 12): string => {
    const value = new Date()
    value.setDate(value.getDate() - daysAgo)
    value.setHours(hour, 0, 0, 0)
    return value.toISOString()
  }
  const insertMember = database.prepare(
    `INSERT INTO merchant_members
     (id, tenant_id, merchant_id, store_id, customer_ref, display_name, phone_masked,
      segment, segment_rule_version, tags_json, order_count, lifetime_value_fen,
      average_ticket_fen, repurchase_probability, churn_risk, prediction_model_version,
      prediction_reasons_json, marketing_consent, joined_at, last_visit_at,
      created_at, updated_at)
     VALUES (?, 'tenant-lequ', 'merchant-demo', 'store-demo-jingan', ?, ?, ?, ?,
      'member-segment-v1', ?, ?, ?, ?, ?, ?, 'repurchase-local-v1', ?, ?, ?, ?, ?, ?)`,
  )
  const members = [
    [
      'member-e5-high-value', 'customer-shen', '沈知微', '158****3017', 'HIGH_VALUE',
      ['纪念日', '主厨席', '高客单'], 24, 2688000, 112000, 92, 'LOW',
      ['近 30 天到店 3 次', '主厨席偏好稳定', '客单价位于门店前 5%'], 1, dateAt(420), dateAt(3, 19),
    ],
    [
      'member-e5-active', 'customer-lin', '林一凡', '186****7312', 'ACTIVE',
      ['双人餐', '靠窗', '微信会员'], 8, 628000, 78500, 78, 'LOW',
      ['近 14 天已完成消费', '近三次均选择晚餐套餐'], 1, dateAt(180), dateAt(8, 20),
    ],
    [
      'member-e5-dormant', 'customer-gu', '顾文川', '137****5086', 'DORMANT',
      ['礼盒', '企业采购', '待召回'], 5, 488000, 97600, 31, 'HIGH',
      ['距上次消费 86 天', '历史高客单但近期无互动'], 1, dateAt(360), dateAt(86, 13),
    ],
    [
      'member-e5-new', 'customer-chen', '陈知夏', '138****2068', 'NEW',
      ['新客', 'Skill 订座'], 1, 76800, 76800, 68, 'MEDIUM',
      ['首次预约已确认', '尚未形成稳定品类偏好'], 1, dateAt(2), dateAt(1, 18),
    ],
    [
      'member-e5-dormant-no-consent', 'customer-wang', '王女士', '135****8120', 'DORMANT',
      ['午市', '家庭聚餐'], 2, 198000, 99000, 22, 'HIGH',
      ['距上次消费 121 天', '营销授权已撤回'], 0, dateAt(280), dateAt(121, 12),
    ],
  ] as const

  database.exec('BEGIN;')
  try {
    for (const member of members) {
      insertMember.run(
        member[0], member[1], member[2], member[3], member[4],
        JSON.stringify(member[5]), member[6], member[7], member[8], member[9], member[10],
        JSON.stringify(member[11]), member[12], member[13], member[14], member[13], timestamp,
      )
    }

    const insertTimeline = database.prepare(
      `INSERT INTO merchant_member_timeline
       (id, tenant_id, merchant_id, store_id, member_id, type, title, detail,
        amount_fen, source, occurred_at, created_at)
       VALUES (?, 'tenant-lequ', 'merchant-demo', 'store-demo-jingan', ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    for (const member of members) {
      insertTimeline.run(
        randomUUID(), member[0], 'JOINED', '加入云和里会员',
        '经交易支付会员独立授权进入门店会员资产', null, 'MINIAPP',
        member[13], timestamp,
      )
      if (member[14]) {
        insertTimeline.run(
          randomUUID(), member[0], 'ORDER', '完成门店消费',
          `累计 ${member[6]} 笔订单，最近一次形成可解释复购特征`,
          member[8], 'ORDER', member[14], timestamp,
        )
      }
    }

    const insertBenefit = database.prepare(
      `INSERT INTO merchant_member_benefits
       (id, tenant_id, merchant_id, store_id, member_id, kind, title, value_fen,
        status, rule_version, expires_at, granted_by, granted_at, created_at, updated_at)
       VALUES (?, 'tenant-lequ', 'merchant-demo', 'store-demo-jingan', ?, ?, ?, ?,
        'ACTIVE', 'member-benefit-v1', ?, 'system', ?, ?, ?)`,
    )
    insertBenefit.run(
      'benefit-e5-high-value', 'member-e5-high-value', 'LEVEL', '云和里臻享会员',
      0, dateAt(-180), dateAt(90), dateAt(90), timestamp,
    )
    insertBenefit.run(
      'benefit-e5-active', 'member-e5-active', 'EXPERIENCE', '主厨席优先预约权',
      0, dateAt(-60), dateAt(20), dateAt(20), timestamp,
    )
    database.exec('COMMIT;')
  } catch (error) {
    database.exec('ROLLBACK;')
    throw error
  }
}

function seedConsumerHomeDemo(database: DatabaseSync): void {
  const existing = database.prepare(
    "SELECT user_id FROM consumer_profiles WHERE user_id = 'user-demo-consumer'",
  ).get()
  if (existing) return

  const timestamp = new Date().toISOString()
  const atHours = (offsetHours: number): string =>
    new Date(Date.now() + offsetHours * 60 * 60 * 1000).toISOString()
  const atDays = (offsetDays: number): string =>
    new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000).toISOString()

  database.exec('BEGIN;')
  try {
    const insertCity = database.prepare(
      `INSERT INTO consumer_cities
       (id, tenant_id, name, code, service_level, status, sort_order, created_at, updated_at)
       VALUES (?, 'tenant-lequ', ?, ?, ?, 'ACTIVE', ?, ?, ?)`,
    )
    insertCity.run('city-shanghai', '上海', '310000', 'FULL', 10, timestamp, timestamp)
    insertCity.run('city-hangzhou', '杭州', '330100', 'DISCOVERY', 20, timestamp, timestamp)
    insertCity.run('city-suzhou', '苏州', '320500', 'DISCOVERY', 30, timestamp, timestamp)

    database.prepare(
      `INSERT INTO consumer_households
       (id, tenant_id, owner_user_id, name, default_city_id, version, created_at, updated_at)
       VALUES ('household-chen', 'tenant-lequ', 'user-demo-consumer',
               '知夏一家', 'city-shanghai', 1, ?, ?)`,
    ).run(timestamp, timestamp)

    const insertMember = database.prepare(
      `INSERT INTO consumer_household_members
       (id, tenant_id, household_id, linked_user_id, name, relation, mode,
        avatar_key, subtitle, dietary_notes_json, permissions_json, status,
        created_at, updated_at)
       VALUES (?, 'tenant-lequ', 'household-chen', ?, ?, ?, ?, ?, ?, ?, ?,
               'ACTIVE', ?, ?)`,
    )
    insertMember.run(
      'household-member-chen-self',
      'user-demo-consumer',
      '知夏',
      '本人',
      'SELF',
      'ZX',
      '家庭生活主理人',
      JSON.stringify(['花生不耐受']),
      JSON.stringify(['全部服务', '订单确认', '家庭管理']),
      timestamp,
      timestamp,
    )
    insertMember.run(
      'household-member-chen-child',
      null,
      '安安',
      '女儿',
      'CHILD',
      'AA',
      '儿童模式 · 8 岁',
      JSON.stringify(['少辣', '不含酒精']),
      JSON.stringify(['亲子服务', '收藏', '需监护人确认']),
      timestamp,
      timestamp,
    )
    insertMember.run(
      'household-member-chen-elder',
      null,
      '陈阿姨',
      '母亲',
      'ELDER',
      'CY',
      '长辈模式 · 大字优先',
      JSON.stringify(['低盐', '少糖']),
      JSON.stringify(['康养服务', '家庭共享', '需代付款']),
      timestamp,
      timestamp,
    )

    database.prepare(
      `INSERT INTO consumer_profiles
       (user_id, tenant_id, display_name, phone_masked, customer_ref,
        preferred_city_id, active_household_id, active_household_member_id,
        version, created_at, updated_at)
       VALUES ('user-demo-consumer', 'tenant-lequ', '陈知夏', '138****2068',
               'customer-chen', 'city-shanghai', 'household-chen',
               'household-member-chen-self', 1, ?, ?)`,
    ).run(timestamp, timestamp)

    database.prepare(
      `INSERT INTO consumer_store_publications
       (id, tenant_id, city_id, merchant_id, store_id, category,
        visibility_status, authorization_scope, authorization_snapshot_json,
        rating, review_count, distance_meters, recommendation_reason,
        badges_json, tags_json, published_at, updated_at)
       VALUES ('consumer-publication-yunheli', 'tenant-lequ', 'city-shanghai',
               'merchant-demo', 'store-demo-jingan', '江浙融合菜', 'PUBLISHED',
               'PLATFORM_DISPLAY', ?, 4.8, 1286, 860, ?,
               ?, ?, ?, ?)`,
    ).run(
      JSON.stringify({
        scope: 'PLATFORM_DISPLAY',
        label: '乐趣生活展示',
        status: 'GRANTED',
        version: 'consumer-publication-consent-v1',
        grantedBy: '云和里商户主理人',
      }),
      '与你的“少辣、安静座位”家庭偏好匹配，且今晚仍有可预约服务。',
      JSON.stringify(['Skill 可订', '家庭友好', '已验真']),
      JSON.stringify(['晚餐', '约会', '家庭聚餐', '江浙菜', '靠窗', '主厨席']),
      atDays(-30),
      timestamp,
    )

    const insertMessage = database.prepare(
      `INSERT INTO consumer_messages
       (id, tenant_id, user_id, household_member_id, category, title, body,
        action_label, action_target, read_at, version, created_at)
       VALUES (?, 'tenant-lequ', 'user-demo-consumer', ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
    )
    insertMessage.run(
      'consumer-message-reservation',
      'household-member-chen-self',
      'TRANSACTION',
      '今晚的靠窗座已为你保留',
      '云和里·静安店正在确认 18:30 的双人晚餐预约，确认后会第一时间通知你。',
      '查看预约',
      '/pages/module/index?path=orders',
      null,
      atHours(-1),
    )
    insertMessage.run(
      'consumer-message-benefit',
      'household-member-chen-self',
      'SERVICE',
      '一张家庭餐饮权益将在 3 天后到期',
      '¥50 家庭晚餐权益可用于已授权门店，使用前仍会展示完整规则。',
      '查看权益',
      '/pages/module/index?path=orders/wallet',
      null,
      atHours(-5),
    )
    insertMessage.run(
      'consumer-message-family',
      'household-member-chen-child',
      'FAMILY',
      '安安的周末亲子计划待确认',
      '家庭清单新增“周六下午亲子手作”，需要主理人确认时间。',
      '查看家庭待办',
      '/pages/module/index?path=family/sharing',
      null,
      atHours(-20),
    )
    insertMessage.run(
      'consumer-message-system',
      null,
      'SYSTEM',
      '家庭隐私设置已完成升级',
      '儿童与长辈身份现在会分别应用饮食禁忌、内容范围和确认权限。',
      '查看设置',
      '/pages/module/index?path=family/permissions',
      atHours(-36),
      atHours(-48),
    )

    database.prepare(
      `INSERT INTO consumer_household_tasks
       (id, tenant_id, household_id, household_member_id, title, detail,
        due_at, status, action_target, created_at, updated_at)
       VALUES ('consumer-task-weekend', 'tenant-lequ', 'household-chen',
               'household-member-chen-child', '确认安安的周末亲子计划',
               '周六下午亲子手作，需要确认时间与出行方式。', ?,
               'PENDING', '/pages/module/index?path=family/sharing', ?, ?)`,
    ).run(atDays(2), timestamp, timestamp)

    database.prepare(
      `INSERT INTO consumer_entitlements
       (id, tenant_id, user_id, household_member_id, kind, title, description,
        value_fen, status, source, expires_at, created_at, updated_at)
       VALUES ('consumer-entitlement-dinner', 'tenant-lequ', 'user-demo-consumer',
               'household-member-chen-self', 'COUPON', '家庭晚餐 ¥50 权益',
               '适用于已授权餐饮门店，结算前展示完整使用规则。', 5000,
               'ACTIVE', '乐趣生活家庭权益', ?, ?, ?)`,
    ).run(atDays(3), timestamp, timestamp)

    const insertRecent = database.prepare(
      `INSERT INTO consumer_recent_services
       (id, tenant_id, user_id, household_member_id, code, title, icon,
        action_target, last_used_at)
       VALUES (?, 'tenant-lequ', 'user-demo-consumer',
               'household-member-chen-self', ?, ?, ?, ?, ?)`,
    )
    const recents = [
      ['consumer-recent-dining', 'DINING', '订晚餐', '食', '/pages/search/index?query=晚餐', atHours(-8)],
      ['consumer-recent-topup', 'TOP_UP', '手机充值', '充', '/pages/module/index?path=services/utility', atDays(-3)],
      ['consumer-recent-grocery', 'GROCERY', '生鲜到家', '鲜', '/pages/search/index?query=生鲜', atDays(-7)],
      ['consumer-recent-ticket', 'TICKET', '电影票', '影', '/pages/module/index?path=services/tickets', atDays(-12)],
    ] as const
    for (const recent of recents) insertRecent.run(...recent)

    database.exec('COMMIT;')
  } catch (error) {
    database.exec('ROLLBACK;')
    throw error
  }
}

function seedConsumerNearbyDemo(database: DatabaseSync): void {
  const timestamp = new Date().toISOString()
  const authorization = JSON.stringify({
    scope: 'PLATFORM_DISPLAY',
    label: '乐趣生活展示',
    status: 'GRANTED',
    version: 'consumer-nearby-consent-v1',
    grantedBy: '商户主理人',
  })
  database.exec('BEGIN;')
  try {
    const insertStore = database.prepare(
      `INSERT OR IGNORE INTO merchant_stores
       (id, tenant_id, merchant_id, city_id, name, city_name, address,
        business_hours, operating_status, manager_name, created_at, updated_at)
       VALUES (?, 'tenant-lequ', ?, 'city-shanghai', ?, '上海', ?, ?,
               'OPEN', ?, ?, ?)`,
    )
    insertStore.run(
      'store-consumer-xuhui',
      'merchant-consumer-xuhui',
      '青禾小馆·徐汇店',
      '徐汇区永嘉路 312 号',
      '10:30–21:30',
      '许青禾',
      timestamp,
      timestamp,
    )
    insertStore.run(
      'store-consumer-changning',
      'merchant-consumer-changning',
      '木棉亲子空间·长宁店',
      '长宁区愚园路 1398 号',
      '09:30–20:00',
      '梁木棉',
      timestamp,
      timestamp,
    )
    insertStore.run(
      'store-consumer-huangpu',
      'merchant-consumer-huangpu',
      '栖野咖啡·黄浦店',
      '黄浦区南昌路 86 号',
      '08:00–20:30',
      '周栖野',
      timestamp,
      timestamp,
    )

    const insertPublication = database.prepare(
      `INSERT OR IGNORE INTO consumer_store_publications
       (id, tenant_id, city_id, merchant_id, store_id, category,
        visibility_status, authorization_scope, authorization_snapshot_json,
        rating, review_count, distance_meters, recommendation_reason,
        badges_json, tags_json, published_at, updated_at)
       VALUES (?, 'tenant-lequ', 'city-shanghai', ?, ?, ?, 'PUBLISHED',
               'PLATFORM_DISPLAY', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    const publications = [
      [
        'consumer-publication-qinghe',
        'merchant-consumer-xuhui',
        'store-consumer-xuhui',
        '轻食简餐',
        4.7,
        842,
        3200,
        '低盐选项和安静小桌获得较多家庭用户好评。',
        ['家庭友好', '低盐可选', '已验真'],
        ['轻食', '低盐', '安静', '家庭简餐'],
      ],
      [
        'consumer-publication-mumian',
        'merchant-consumer-changning',
        'store-consumer-changning',
        '亲子活动',
        4.9,
        623,
        2800,
        '提供分龄活动空间，适合当前儿童家庭身份。',
        ['亲子友好', '分龄活动', '已验真'],
        ['亲子', '手作', '儿童活动', '家庭周末'],
      ],
      [
        'consumer-publication-qiye',
        'merchant-consumer-huangpu',
        'store-consumer-huangpu',
        '咖啡茶饮',
        4.6,
        1164,
        5100,
        '环境安静并提供无咖啡因饮品，适合短时休息。',
        ['安静空间', '无咖啡因', '已验真'],
        ['咖啡', '茶饮', '安静', '休息'],
      ],
    ] as const
    for (const publication of publications) {
      insertPublication.run(
        publication[0],
        publication[1],
        publication[2],
        publication[3],
        authorization,
        publication[4],
        publication[5],
        publication[6],
        publication[7],
        JSON.stringify(publication[8]),
        JSON.stringify(publication[9]),
        timestamp,
        timestamp,
      )
    }

    const insertLocation = database.prepare(
      `INSERT OR IGNORE INTO consumer_store_locations
       (store_id, tenant_id, city_id, latitude, longitude, geocode_source,
        confidence, version, created_at, updated_at)
       VALUES (?, 'tenant-lequ', 'city-shanghai', ?, ?, 'MERCHANT_CONFIRMED_GCJ02',
               ?, 1, ?, ?)`,
    )
    const locations = [
      ['store-demo-jingan', 31.22142, 121.43681, 0.99],
      ['store-consumer-xuhui', 31.20561, 121.44582, 0.97],
      ['store-consumer-changning', 31.21922, 121.41818, 0.96],
      ['store-consumer-huangpu', 31.22669, 121.47908, 0.98],
    ] as const
    for (const location of locations) {
      insertLocation.run(...location, timestamp, timestamp)
    }
    database.exec('COMMIT;')
  } catch (error) {
    database.exec('ROLLBACK;')
    throw error
  }
}

function seedConsumerDealDemo(database: DatabaseSync): void {
  const timestamp = new Date().toISOString()
  const atDay = (offsetDays: number): string =>
    new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000).toISOString()
  const insert = database.prepare(
    `INSERT OR IGNORE INTO consumer_deal_publications
     (id, tenant_id, city_id, store_id, spu_id, sku_id, kind, status,
      valid_from, valid_until, usable_weekdays_json, daily_start_time,
      daily_end_time, refund_rule, redemption_rule, version, published_at, updated_at)
     VALUES (?, 'tenant-lequ', 'city-shanghai', 'store-demo-jingan', ?, ?, ?,
             'PUBLISHED', ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
  )
  insert.run(
    'consumer-deal-yunheli-dinner',
    'spu-e5-dinner',
    'sku-e5-dinner-2',
    'GROUP_BUY',
    atDay(-1),
    atDay(90),
    JSON.stringify([1, 2, 3, 4, 5, 6, 7]),
    '11:00',
    '20:30',
    '未使用且未过有效期可申请退款；实际退款须进入商家审批和支付连接器流程。',
    '到店后由本人出示核销凭证；草稿阶段不会生成凭证或占用库存。',
    timestamp,
    timestamp,
  )
  insert.run(
    'consumer-deal-yunheli-tasting',
    'spu-e5-tasting',
    'sku-e5-tasting',
    'RESERVATION',
    atDay(-1),
    atDay(90),
    JSON.stringify([2, 3, 4, 5, 6, 7]),
    '17:30',
    '20:30',
    '预约确认前可取消；商家确认后按服务开始时间进入取消或退款规则。',
    '需选择有效时段并等待商家确认；建立草稿不代表预约成功。',
    timestamp,
    timestamp,
  )
}

interface DevelopmentIdentity {
  readonly id: string
  readonly name: string
  readonly organizationId: string
  readonly dataScope: string
  readonly cityIds: readonly string[]
  readonly merchantIds: readonly string[]
  readonly storeIds: readonly string[]
  readonly roles: readonly string[]
  readonly token: string
}

const developmentIdentities: readonly DevelopmentIdentity[] = [
  {
    id: 'user-demo-hq', name: '总部超级管理员', organizationId: 'org-hq',
    dataScope: 'PLATFORM', cityIds: [], merchantIds: [], storeIds: [],
    roles: ['HQ_SUPER_ADMIN'], token: 'dev-hq-super-2026',
  },
  {
    id: 'user-demo-city-manager', name: '上海城市负责人', organizationId: 'org-city-shanghai',
    dataScope: 'CITY', cityIds: ['city-shanghai'], merchantIds: [], storeIds: [],
    roles: ['CITY_MANAGER'], token: 'dev-city-manager-2026',
  },
  {
    id: 'user-demo-sales', name: '上海销售顾问', organizationId: 'org-city-shanghai',
    dataScope: 'OWNED_MERCHANTS', cityIds: ['city-shanghai'],
    merchantIds: ['merchant-demo'], storeIds: [], roles: ['CITY_SALES'],
    token: 'dev-city-sales-2026',
  },
  {
    id: 'user-demo-sales-peer', name: '上海销售顾问·宁安', organizationId: 'org-city-shanghai',
    dataScope: 'OWNED_MERCHANTS', cityIds: ['city-shanghai'],
    merchantIds: [], storeIds: [], roles: ['CITY_SALES'],
    token: 'dev-city-sales-peer-2026',
  },
  {
    id: 'user-demo-provider', name: '上海城市服务商管理员', organizationId: 'org-city-shanghai',
    dataScope: 'CITY', cityIds: ['city-shanghai'], merchantIds: [], storeIds: [],
    roles: ['CITY_PROVIDER_ADMIN'], token: 'dev-city-delivery-2026',
  },
  {
    id: 'user-demo-delivery', name: '上海交付顾问·周澄', organizationId: 'org-city-shanghai',
    dataScope: 'CITY', cityIds: ['city-shanghai'], merchantIds: [], storeIds: [],
    roles: ['CITY_DELIVERY'], token: 'dev-city-worker-2026',
  },
  {
    id: 'user-demo-merchant', name: '云和里商户主理人', organizationId: 'org-merchant-demo',
    dataScope: 'MERCHANT', cityIds: ['city-shanghai'],
    merchantIds: ['merchant-demo'], storeIds: ['store-demo-jingan'],
    roles: ['MERCHANT_OWNER'], token: 'dev-merchant-owner-2026',
  },
  {
    id: 'user-demo-manager', name: '云和里静安店店长', organizationId: 'org-store-demo',
    dataScope: 'STORE', cityIds: ['city-shanghai'],
    merchantIds: ['merchant-demo'], storeIds: ['store-demo-jingan'],
    roles: ['STORE_MANAGER'], token: 'dev-store-manager-2026',
  },
  {
    id: 'user-demo-clerk', name: '云和里门店员工', organizationId: 'org-store-demo',
    dataScope: 'STORE', cityIds: ['city-shanghai'],
    merchantIds: ['merchant-demo'], storeIds: ['store-demo-jingan'],
    roles: ['STORE_CLERK'], token: 'dev-store-clerk-2026',
  },
  {
    id: 'user-demo-consumer', name: '陈知夏', organizationId: 'org-city-shanghai',
    dataScope: 'SELF', cityIds: ['city-shanghai'],
    merchantIds: [], storeIds: [],
    roles: ['CONSUMER'], token: 'dev-consumer-2026',
  },
]

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function seedProviderRenewalDemo(database: DatabaseSync): void {
  const existing = database.prepare('SELECT id FROM provider_renewal_cases LIMIT 1').get()
  if (existing) return

  const timestamp = new Date().toISOString()
  const day = 24 * 60 * 60 * 1000
  const iso = (offsetDays: number): string =>
    new Date(Date.now() + offsetDays * day).toISOString()
  const insertCase = database.prepare(
    `INSERT INTO provider_renewal_cases
     (id, tenant_id, city_id, lead_id, source, source_contract_id,
      current_package_code, current_price_fen, service_started_at,
      service_ends_at, status, owner_id, loss_reason, loss_detail,
      recoverable, recovery_action, renewed_package_code, renewed_price_fen,
      renewed_at, version, policy_version, created_at, updated_at)
     VALUES (?, 'tenant-lequ', 'city-shanghai', ?, 'LEGACY_IMPORT', NULL,
             ?, ?, ?, ?, ?, 'user-demo-sales', ?, ?, ?, ?, ?, ?, ?, 1,
             'provider-renewal-policy-v1', ?, ?)`,
  )
  const insertEvent = database.prepare(
    `INSERT INTO provider_renewal_events
     (id, tenant_id, case_id, lead_id, actor_id, type, dedupe_key,
      summary, payload_json, created_at)
     VALUES (?, 'tenant-lequ', ?, ?, 'user-demo-hq', ?, ?, ?, ?, ?)`,
  )
  const cases = [
    {
      id: 'provider-renewal-yunheli-current',
      leadId: 'lead-yunheli',
      packageCode: 'PRO',
      priceFen: 99_800,
      startedAt: iso(-359),
      endsAt: iso(6),
      status: 'MONITORING',
      lossReason: null,
      lossDetail: null,
      recoverable: null,
      recoveryAction: null,
      renewedPackageCode: null,
      renewedPriceFen: null,
      renewedAt: null,
    },
    {
      id: 'provider-renewal-muyun-current',
      leadId: 'lead-muyun',
      packageCode: 'BASIC',
      priceFen: 49_800,
      startedAt: iso(-351),
      endsAt: iso(14),
      status: 'MONITORING',
      lossReason: null,
      lossDetail: null,
      recoverable: null,
      recoveryAction: null,
      renewedPackageCode: null,
      renewedPriceFen: null,
      renewedAt: null,
    },
    {
      id: 'provider-renewal-luming-current',
      leadId: 'lead-luming',
      packageCode: 'PRO',
      priceFen: 99_800,
      startedAt: iso(-337),
      endsAt: iso(28),
      status: 'MONITORING',
      lossReason: null,
      lossDetail: null,
      recoverable: null,
      recoveryAction: null,
      renewedPackageCode: null,
      renewedPriceFen: null,
      renewedAt: null,
    },
    {
      id: 'provider-renewal-yunheli-history',
      leadId: 'lead-yunheli',
      packageCode: 'BASIC',
      priceFen: 49_800,
      startedAt: iso(-724),
      endsAt: iso(-359),
      status: 'RENEWED',
      lossReason: null,
      lossDetail: null,
      recoverable: null,
      recoveryAction: null,
      renewedPackageCode: 'PRO',
      renewedPriceFen: 99_800,
      renewedAt: iso(-366),
    },
    {
      id: 'provider-renewal-luming-history',
      leadId: 'lead-luming',
      packageCode: 'BASIC',
      priceFen: 49_800,
      startedAt: iso(-755),
      endsAt: iso(-390),
      status: 'LOST',
      lossReason: 'COMPETITOR',
      lossDetail: '历史周期因竞品捆绑硬件方案流失，保留下一财季回访机会。',
      recoverable: 1,
      recoveryAction: '下一财季以开放 Skill 与免硬件迁移方案重新评估。',
      renewedPackageCode: null,
      renewedPriceFen: null,
      renewedAt: null,
    },
  ] as const

  database.exec('BEGIN;')
  try {
    for (const item of cases) {
      insertCase.run(
        item.id,
        item.leadId,
        item.packageCode,
        item.priceFen,
        item.startedAt,
        item.endsAt,
        item.status,
        item.lossReason,
        item.lossDetail,
        item.recoverable,
        item.recoveryAction,
        item.renewedPackageCode,
        item.renewedPriceFen,
        item.renewedAt,
        timestamp,
        timestamp,
      )
      insertEvent.run(
        randomUUID(),
        item.id,
        item.leadId,
        'CASE_CREATED',
        `${item.id}:CASE_CREATED`,
        '历史服务周期已导入续费经营中心',
        JSON.stringify({
          source: 'LEGACY_IMPORT',
          currentPackageCode: item.packageCode,
          serviceEndsAt: item.endsAt,
        }),
        timestamp,
      )
      if (item.status === 'RENEWED') {
        insertEvent.run(
          randomUUID(),
          item.id,
          item.leadId,
          'RENEWED',
          `${item.id}:RENEWED`,
          '历史续费结果已确认',
          JSON.stringify({
            renewedPackageCode: item.renewedPackageCode,
            renewedPriceFen: item.renewedPriceFen,
          }),
          item.renewedAt,
        )
      }
      if (item.status === 'LOST') {
        insertEvent.run(
          randomUUID(),
          item.id,
          item.leadId,
          'LOST',
          `${item.id}:LOST`,
          '历史流失原因已结构化归档',
          JSON.stringify({
            reason: item.lossReason,
            recoverable: true,
            recoveryAction: item.recoveryAction,
          }),
          item.endsAt,
        )
      }
    }
    database.exec('COMMIT;')
  } catch (error) {
    database.exec('ROLLBACK;')
    throw error
  }
}

function seedProviderCitySettlementDemo(database: DatabaseSync): void {
  const timestamp = new Date().toISOString()
  const ruleVersion = 'provider-city-settlement-2026.07-v1'
  const signingShareBps = 6000
  const renewalShareBps = 6500
  const transactionShareBps = 50
  const monthPeriod = (offset: number): string => {
    const value = new Date()
    value.setDate(1)
    value.setMonth(value.getMonth() + offset)
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}`
  }
  const amount = (baseFen: number, rateBps: number): number =>
    Math.round(baseFen * rateBps / 10_000)
  const sourceFor = (period: string) => database.prepare(
    `SELECT
       COALESCE(SUM(CASE WHEN category = 'SIGNING'
                         THEN performance_delta_fen ELSE 0 END), 0) AS signing,
       COALESCE(SUM(CASE WHEN category = 'RENEWAL'
                         THEN performance_delta_fen ELSE 0 END), 0) AS renewal,
       COALESCE(SUM(CASE WHEN category = 'TRANSACTION_SHARE'
                         THEN performance_delta_fen ELSE 0 END), 0) AS transaction_gmv
     FROM sales_commission_ledger
     WHERE tenant_id = 'tenant-lequ' AND city_id = 'city-shanghai'
       AND period = ? AND kind IN ('RECOGNITION', 'REVERSAL')`,
  ).get(period) as unknown as {
    signing: number
    renewal: number
    transaction_gmv: number
  }

  database.exec('BEGIN;')
  try {
    database.prepare(
      `INSERT OR IGNORE INTO provider_city_settlement_rules
       (id, tenant_id, version, signing_share_bps, renewal_share_bps,
        transaction_share_bps, status, effective_from, created_by, created_at)
       VALUES ('provider-city-settlement-rule-demo', 'tenant-lequ', ?, ?, ?, ?,
               'ACTIVE', ?, 'user-demo-hq', ?)`,
    ).run(ruleVersion, signingShareBps, renewalShareBps, transactionShareBps, timestamp, timestamp)

    for (const [offset, status] of [[0, 'PENDING_INVOICE'], [-1, 'SETTLED']] as const) {
      const period = monthPeriod(offset)
      const statementId = `provider-city-settlement-shanghai-${period}`
      const source = sourceFor(period)
      const subscriptionShare = amount(source.signing, signingShareBps)
      const renewalShare = amount(source.renewal, renewalShareBps)
      const transactionShare = amount(source.transaction_gmv, transactionShareBps)
      const payable = subscriptionShare + renewalShare + transactionShare
      const occurredAt = offset === 0
        ? timestamp
        : new Date(Date.now() - 25 * 24 * 60 * 60 * 1000).toISOString()
      const inserted = database.prepare(
        `INSERT OR IGNORE INTO provider_city_settlement_statements
         (id, tenant_id, city_id, period, status, currency,
          signing_revenue_fen, renewal_revenue_fen, transaction_gmv_fen,
          subscription_share_fen, renewal_share_fen,
          transaction_service_share_fen, approved_adjustment_fen,
          payable_fen, rule_version, version, generated_by, generated_at,
          settled_by, settled_at, updated_at)
         VALUES (?, 'tenant-lequ', 'city-shanghai', ?, ?, 'CNY', ?, ?, ?, ?, ?, ?,
                 0, ?, ?, 1, 'user-demo-provider', ?, ?, ?, ?)`,
      ).run(
        statementId,
        period,
        status,
        source.signing,
        source.renewal,
        source.transaction_gmv,
        subscriptionShare,
        renewalShare,
        transactionShare,
        payable,
        ruleVersion,
        occurredAt,
        status === 'SETTLED' ? 'user-demo-hq' : null,
        status === 'SETTLED' ? occurredAt : null,
        occurredAt,
      )
      if (inserted.changes === 0) continue

      database.prepare(
        `INSERT INTO provider_city_settlement_events
         (id, tenant_id, city_id, statement_id, actor_id, type, dedupe_key,
          summary, payload_json, created_at)
         VALUES (?, 'tenant-lequ', 'city-shanghai', ?, 'user-demo-provider',
                 'STATEMENT_GENERATED', ?, '月度城市收益结算单已生成', ?, ?)`,
      ).run(
        randomUUID(),
        statementId,
        `${statementId}:STATEMENT_GENERATED`,
        JSON.stringify({ period, ruleVersion, payableFen: payable }),
        occurredAt,
      )

      if (status !== 'SETTLED') continue
      const invoiceId = `provider-city-invoice-shanghai-${period}`
      database.prepare(
        `INSERT INTO provider_city_settlement_invoices
         (id, tenant_id, city_id, statement_id, invoice_no, seller_name,
          seller_tax_id_masked, amount_fen, issued_at, status, submitted_by,
          submitted_at, decided_by, decision_note, decided_at)
         VALUES (?, 'tenant-lequ', 'city-shanghai', ?, ?, '上海乐趣城市服务有限公司',
                 '9131**********6X', ?, ?, 'VERIFIED', 'user-demo-provider', ?,
                 'user-demo-hq', '发票抬头、税号与结算金额核验一致', ?)`,
      ).run(
        invoiceId,
        statementId,
        `SH-LQ-${period.replace('-', '')}-001`,
        payable,
        occurredAt,
        occurredAt,
        occurredAt,
      )
      const snapshot = JSON.stringify({
        version: ruleVersion,
        signingShareBps,
        renewalShareBps,
        transactionShareBps,
        formula: '确认业务净额 × 对应分成基点 / 10000',
      })
      const ledgerRows = [
        ['SUBSCRIPTION_SHARE', subscriptionShare, `${period}:SIGNING`, '签约订阅分成'],
        ['RENEWAL_SHARE', renewalShare, `${period}:RENEWAL`, '续费服务分成'],
        ['TRANSACTION_SERVICE_SHARE', transactionShare, `${period}:TRANSACTION`, '交易服务分成'],
      ] as const
      for (const [category, value, sourceId, label] of ledgerRows) {
        if (value === 0) continue
        database.prepare(
          `INSERT INTO provider_city_settlement_ledger
           (id, tenant_id, city_id, statement_id, category, direction, amount_fen,
            source_id, source_label, rule_version, rule_snapshot_json,
            evidence_json, posted_by, posted_at)
           VALUES (?, 'tenant-lequ', 'city-shanghai', ?, ?, 'CREDIT', ?, ?, ?, ?,
                   ?, ?, 'user-demo-hq', ?)`,
        ).run(
          randomUUID(),
          statementId,
          category,
          value,
          sourceId,
          label,
          ruleVersion,
          snapshot,
          JSON.stringify([`账期 ${period}`, `发票 ${invoiceId}`, '已完成总部复核']),
          occurredAt,
        )
      }
      const eventInsert = database.prepare(
        `INSERT INTO provider_city_settlement_events
         (id, tenant_id, city_id, statement_id, actor_id, type, dedupe_key,
          summary, payload_json, created_at)
         VALUES (?, 'tenant-lequ', 'city-shanghai', ?, ?, ?, ?, ?, ?, ?)`,
      )
      eventInsert.run(
        randomUUID(), statementId, 'user-demo-provider', 'INVOICE_SUBMITTED',
        `${statementId}:INVOICE_SUBMITTED:seed`, '城市服务商已提交结算发票',
        JSON.stringify({ invoiceId, amountFen: payable }), occurredAt,
      )
      eventInsert.run(
        randomUUID(), statementId, 'user-demo-hq', 'INVOICE_VERIFIED',
        `${statementId}:INVOICE_VERIFIED:seed`, '总部已核验结算发票',
        JSON.stringify({ invoiceId, amountFen: payable }), occurredAt,
      )
      eventInsert.run(
        randomUUID(), statementId, 'user-demo-hq', 'SETTLED',
        `${statementId}:SETTLED`, '城市收益已完成结算并写入只追加账本',
        JSON.stringify({ invoiceId, payableFen: payable, event: 'settlement.completed.v1' }),
        occurredAt,
      )
    }
    database.exec('COMMIT;')
  } catch (error) {
    database.exec('ROLLBACK;')
    throw error
  }
}

function seedDevelopmentIdentity(database: DatabaseSync): void {
  const timestamp = new Date().toISOString()
  const expiresAt = '2099-12-31T23:59:59.000Z'
  database.exec('BEGIN;')
  try {
    database.prepare(
      `INSERT OR IGNORE INTO tenants (id, name, status, created_at)
       VALUES ('tenant-lequ', '乐趣生活演示租户', 'ACTIVE', ?)`,
    ).run(timestamp)
    const organizationInsert = database.prepare(
      `INSERT OR IGNORE INTO organizations
       (id, tenant_id, parent_id, type, name, city_id, created_at)
       VALUES (?, 'tenant-lequ', ?, ?, ?, ?, ?)`,
    )
    organizationInsert.run('org-hq', null, 'HQ', '乐趣生活总部', null, timestamp)
    organizationInsert.run(
      'org-city-shanghai', 'org-hq', 'CITY', '上海城市中心', 'city-shanghai', timestamp,
    )
    organizationInsert.run(
      'org-merchant-demo', 'org-city-shanghai', 'MERCHANT', '云和里餐饮',
      'city-shanghai', timestamp,
    )
    organizationInsert.run(
      'org-store-demo', 'org-merchant-demo', 'STORE', '云和里静安店',
      'city-shanghai', timestamp,
    )

    const userInsert = database.prepare(
      `INSERT INTO users (id, display_name, status, created_at)
       VALUES (?, ?, 'ACTIVE', ?)
       ON CONFLICT(id) DO UPDATE SET display_name = excluded.display_name`,
    )
    const membershipInsert = database.prepare(
      `INSERT OR IGNORE INTO memberships
       (id, user_id, tenant_id, organization_id, data_scope, city_ids_json,
        merchant_ids_json, store_ids_json, status, created_at)
       VALUES (?, ?, 'tenant-lequ', ?, ?, ?, ?, ?, 'ACTIVE', ?)`,
    )
    const roleInsert = database.prepare(
      `INSERT OR IGNORE INTO role_assignments (id, membership_id, role, created_at)
       VALUES (?, ?, ?, ?)`,
    )
    const sessionInsert = database.prepare(
      `INSERT OR IGNORE INTO auth_sessions
       (token_hash, user_id, tenant_id, expires_at, created_at)
       VALUES (?, ?, 'tenant-lequ', ?, ?)`,
    )

    for (const identity of developmentIdentities) {
      const membershipId = `membership-${identity.id}`
      userInsert.run(identity.id, identity.name, timestamp)
      membershipInsert.run(
        membershipId,
        identity.id,
        identity.organizationId,
        identity.dataScope,
        JSON.stringify(identity.cityIds),
        JSON.stringify(identity.merchantIds),
        JSON.stringify(identity.storeIds),
        timestamp,
      )
      for (const role of identity.roles) {
        roleInsert.run(`role-${identity.id}-${role}`, membershipId, role, timestamp)
      }
      sessionInsert.run(sha256(identity.token), identity.id, expiresAt, timestamp)
    }
    database.prepare(
      `DELETE FROM role_assignments
       WHERE membership_id = 'membership-user-demo-provider'
         AND role = 'CITY_DELIVERY'`,
    ).run()
    database.exec('COMMIT;')
  } catch (error) {
    database.exec('ROLLBACK;')
    throw error
  }
}

export function createFreshRun(
  database: DatabaseSync,
  withinTransaction = false,
): string {
  const runId = randomUUID()
  const now = new Date().toISOString()
  if (!withinTransaction) database.exec('BEGIN IMMEDIATE;')
  try {
    database
      .prepare('INSERT INTO demo_runs (run_id, created_at, updated_at) VALUES (?, ?, ?)')
      .run(runId, now, now)
    database
      .prepare("UPDATE app_settings SET value = ? WHERE key = 'current_run_id'")
      .run(runId)
    if (!withinTransaction) database.exec('COMMIT;')
    return runId
  } catch (error) {
    if (!withinTransaction) database.exec('ROLLBACK;')
    throw error
  }
}

export function getCurrentRunId(database: DatabaseSync): string {
  const row = database
    .prepare("SELECT value FROM app_settings WHERE key = 'current_run_id'")
    .get() as { value: string } | undefined

  if (!row) {
    throw new Error('Current demo run is missing')
  }

  return row.value
}
