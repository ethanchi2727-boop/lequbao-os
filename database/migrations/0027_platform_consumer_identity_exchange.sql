BEGIN;

ALTER TABLE platform_consumer_sessions
  ADD COLUMN assertion_id_hash text CHECK (assertion_id_hash IS NULL OR assertion_id_hash ~ '^[a-f0-9]{64}$'),
  ADD COLUMN device_fingerprint_hash text CHECK (device_fingerprint_hash IS NULL OR device_fingerprint_hash ~ '^[a-f0-9]{64}$'),
  ADD COLUMN refresh_token_hash text CHECK (refresh_token_hash IS NULL OR refresh_token_hash ~ '^[a-f0-9]{64}$'),
  ADD COLUMN provider text CHECK (provider IS NULL OR provider IN ('WECHAT','MOBILE_OTP'));

CREATE UNIQUE INDEX platform_consumer_sessions_assertion_uidx
ON platform_consumer_sessions(assertion_id_hash) WHERE assertion_id_hash IS NOT NULL;

CREATE OR REPLACE FUNCTION app.guard_platform_consumer_session_identity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF ROW(
    NEW.session_id,NEW.account_id,NEW.auth_subject_hash,NEW.auth_level,
    NEW.expires_at,NEW.created_at,NEW.assertion_id_hash,
    NEW.device_fingerprint_hash,NEW.provider
  ) IS DISTINCT FROM ROW(
    OLD.session_id,OLD.account_id,OLD.auth_subject_hash,OLD.auth_level,
    OLD.expires_at,OLD.created_at,OLD.assertion_id_hash,
    OLD.device_fingerprint_hash,OLD.provider
  ) THEN
    RAISE EXCEPTION 'platform consumer session identity evidence is immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER platform_consumer_sessions_identity_immutable
BEFORE UPDATE ON platform_consumer_sessions
FOR EACH ROW EXECUTE FUNCTION app.guard_platform_consumer_session_identity();

CREATE OR REPLACE FUNCTION app.issue_platform_consumer_session(
  p_union_identifier_hash text,
  p_mobile_hash text,
  p_auth_subject_hash text,
  p_auth_level text,
  p_session_id text,
  p_expires_at timestamptz,
  p_assertion_id_hash text,
  p_device_fingerprint_hash text,
  p_refresh_token_hash text,
  p_provider text
)
RETURNS TABLE(account_id uuid, session_id text, auth_level text, expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  v_account platform_consumer_accounts%ROWTYPE;
BEGIN
  IF p_union_identifier_hash !~ '^[a-f0-9]{64}$'
     OR p_auth_subject_hash !~ '^[a-f0-9]{64}$'
     OR p_assertion_id_hash !~ '^[a-f0-9]{64}$'
     OR p_device_fingerprint_hash !~ '^[a-f0-9]{64}$'
     OR p_refresh_token_hash !~ '^[a-f0-9]{64}$'
     OR p_auth_level NOT IN ('WECHAT','PHONE_BOUND')
     OR p_provider NOT IN ('WECHAT','MOBILE_OTP')
     OR (p_provider='MOBILE_OTP' AND (p_auth_level<>'PHONE_BOUND' OR p_mobile_hash IS NULL))
     OR (p_mobile_hash IS NOT NULL AND p_mobile_hash !~ '^[a-f0-9]{64}$')
     OR p_expires_at <= now()
     OR p_expires_at > now() + interval '31 days'
  THEN
    RAISE EXCEPTION 'invalid platform consumer identity evidence' USING ERRCODE='22023';
  END IF;

  INSERT INTO platform_consumer_accounts(union_identifier_hash,mobile_hash)
  VALUES (p_union_identifier_hash,p_mobile_hash)
  ON CONFLICT (union_identifier_hash) DO NOTHING;

  SELECT * INTO STRICT v_account
    FROM platform_consumer_accounts
   WHERE union_identifier_hash=p_union_identifier_hash
   FOR UPDATE;

  IF v_account.status <> 'ACTIVE' THEN
    RAISE EXCEPTION 'platform consumer account is inactive' USING ERRCODE='28000';
  ELSIF v_account.mobile_hash IS NOT NULL AND p_mobile_hash IS NOT NULL
        AND v_account.mobile_hash <> p_mobile_hash THEN
    RAISE EXCEPTION 'platform consumer mobile binding mismatch' USING ERRCODE='28000';
  ELSIF v_account.mobile_hash IS NULL AND p_mobile_hash IS NOT NULL THEN
    UPDATE platform_consumer_accounts
       SET mobile_hash=p_mobile_hash,version=version+1,updated_at=now()
     WHERE id=v_account.id;
  END IF;

  INSERT INTO platform_consumer_sessions(
    session_id,account_id,auth_subject_hash,auth_level,expires_at,
    assertion_id_hash,device_fingerprint_hash,refresh_token_hash,provider
  ) VALUES (
    p_session_id,v_account.id,p_auth_subject_hash,p_auth_level,p_expires_at,
    p_assertion_id_hash,p_device_fingerprint_hash,p_refresh_token_hash,p_provider
  );

  RETURN QUERY SELECT v_account.id,p_session_id,p_auth_level,p_expires_at;
END;
$$;

REVOKE ALL ON FUNCTION app.issue_platform_consumer_session(text,text,text,text,text,timestamptz,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.issue_platform_consumer_session(text,text,text,text,text,timestamptz,text,text,text,text) TO CURRENT_USER;

CREATE OR REPLACE FUNCTION app.refresh_platform_consumer_session(
  p_account_id uuid,
  p_session_id text,
  p_current_refresh_token_hash text,
  p_device_fingerprint_hash text,
  p_next_refresh_token_hash text
)
RETURNS TABLE(account_id uuid, session_id text, auth_level text, expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  v_session platform_consumer_sessions%ROWTYPE;
BEGIN
  IF p_current_refresh_token_hash !~ '^[a-f0-9]{64}$'
     OR p_device_fingerprint_hash !~ '^[a-f0-9]{64}$'
     OR p_next_refresh_token_hash !~ '^[a-f0-9]{64}$'
  THEN
    RAISE EXCEPTION 'invalid platform consumer refresh evidence' USING ERRCODE='22023';
  END IF;

  SELECT session.* INTO v_session
    FROM platform_consumer_sessions session
    JOIN platform_consumer_accounts account ON account.id=session.account_id
   WHERE session.account_id=p_account_id
     AND session.session_id=p_session_id
     AND session.refresh_token_hash=p_current_refresh_token_hash
     AND session.device_fingerprint_hash=p_device_fingerprint_hash
     AND session.revoked_at IS NULL
     AND session.expires_at>now()
     AND account.status='ACTIVE'
   FOR UPDATE OF session;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'platform consumer refresh rejected' USING ERRCODE='28000';
  END IF;

  UPDATE platform_consumer_sessions
     SET refresh_token_hash=p_next_refresh_token_hash,last_seen_at=now()
   WHERE platform_consumer_sessions.session_id=p_session_id;
  RETURN QUERY SELECT v_session.account_id,v_session.session_id,v_session.auth_level,v_session.expires_at;
END;
$$;

REVOKE ALL ON FUNCTION app.refresh_platform_consumer_session(uuid,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.refresh_platform_consumer_session(uuid,text,text,text,text) TO CURRENT_USER;

CREATE OR REPLACE FUNCTION app.revoke_platform_consumer_session(
  p_account_id uuid,
  p_session_id text,
  p_reason text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  v_updated integer;
BEGIN
  IF p_reason IS NULL OR btrim(p_reason)='' OR length(p_reason)>255 THEN
    RAISE EXCEPTION 'invalid platform consumer revoke reason' USING ERRCODE='22023';
  END IF;
  UPDATE platform_consumer_sessions
     SET revoked_at=now(),revoke_reason=p_reason,refresh_token_hash=NULL,last_seen_at=now()
   WHERE account_id=p_account_id AND session_id=p_session_id AND revoked_at IS NULL;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated=1;
END;
$$;

REVOKE ALL ON FUNCTION app.revoke_platform_consumer_session(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.revoke_platform_consumer_session(uuid,text,text) TO CURRENT_USER;

INSERT INTO schema_migrations(version,checksum)
VALUES ('0027_platform_consumer_identity_exchange',encode(digest('lequbao-v6.1-0027-platform-consumer-identity-exchange','sha256'),'hex'))
ON CONFLICT (version) DO NOTHING;

COMMIT;
