BEGIN;

SELECT account_id,session_id,auth_level
  FROM app.issue_platform_consumer_session(
    repeat('a',64),NULL,repeat('b',64),'WECHAT','life-auth-session-1',
    now()+interval '7 days',repeat('c',64),repeat('d',64),repeat('e',64),'WECHAT'
  );

SELECT set_config(
  'app.consumer_account_id',
  (SELECT id::text FROM platform_consumer_accounts WHERE union_identifier_hash=repeat('a',64)),
  false
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM platform_consumer_sessions
     WHERE session_id='life-auth-session-1' AND auth_level='WECHAT'
  ) THEN
    RAISE EXCEPTION 'platform consumer session issue result mismatch';
  END IF;
END;
$$;

SELECT app.revoke_platform_consumer_session(
  (SELECT id FROM platform_consumer_accounts WHERE union_identifier_hash=repeat('a',64)),
  'life-auth-session-1',
  'TEST_REVOKE'
);

DO $$
BEGIN
  BEGIN
    UPDATE platform_consumer_sessions
       SET auth_subject_hash=repeat('f',64)
     WHERE session_id='life-auth-session-1';
    RAISE EXCEPTION 'immutable session identity update unexpectedly succeeded';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%identity evidence is immutable%' THEN RAISE; END IF;
  END;
END;
$$;

DO $$
BEGIN
  BEGIN
    PERFORM * FROM app.issue_platform_consumer_session(
      repeat('a',64),NULL,repeat('b',64),'WECHAT','life-auth-session-replay',
      now()+interval '7 days',repeat('c',64),repeat('d',64),repeat('f',64),'WECHAT'
    );
    RAISE EXCEPTION 'assertion replay unexpectedly succeeded';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
END;
$$;

UPDATE platform_consumer_accounts SET status='SUSPENDED'
 WHERE union_identifier_hash=repeat('a',64);

DO $$
BEGIN
  BEGIN
    PERFORM * FROM app.issue_platform_consumer_session(
      repeat('a',64),NULL,repeat('b',64),'WECHAT','life-auth-session-2',
      now()+interval '7 days',repeat('1',64),repeat('2',64),repeat('3',64),'WECHAT'
    );
    RAISE EXCEPTION 'suspended account login unexpectedly succeeded';
  EXCEPTION WHEN invalid_authorization_specification THEN NULL;
  END;
END;
$$;

ROLLBACK;
