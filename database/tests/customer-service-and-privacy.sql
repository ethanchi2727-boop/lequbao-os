\set ON_ERROR_STOP on

BEGIN;

INSERT INTO tenants(id,tenant_code,legal_name,display_name)
VALUES ('49000000-0000-4000-8000-000000000001','customer-service-gate','Customer Service Gate Legal','Customer Service Gate');
INSERT INTO users(id,display_name)
VALUES
  ('49000000-0000-4000-8000-000000000002','Assigned Agent'),
  ('49000000-0000-4000-8000-000000000003','Spoofed Agent');
INSERT INTO stores(id,tenant_id,store_code,store_name,status)
VALUES (
  '49000000-0000-4000-8000-000000000004','49000000-0000-4000-8000-000000000001',
  'CS-GATE-STORE','Customer Service Gate Store','ACTIVE'
);
INSERT INTO customer_profiles(id,tenant_id,union_identifier_hash,status)
VALUES (
  '49000000-0000-4000-8000-000000000005','49000000-0000-4000-8000-000000000001',
  repeat('a',64),'ACTIVE'
);
INSERT INTO consumer_sessions(
  session_id,tenant_id,customer_id,store_id,auth_subject_hash,auth_level,expires_at
) VALUES (
  'consumer-session-db-gate','49000000-0000-4000-8000-000000000001',
  '49000000-0000-4000-8000-000000000005','49000000-0000-4000-8000-000000000004',
  repeat('b',64),'PHONE_BOUND',now()+interval '1 hour'
);
INSERT INTO knowledge_bases(id,tenant_id,store_id,name,status)
VALUES (
  '49000000-0000-4000-8000-000000000006','49000000-0000-4000-8000-000000000001',
  '49000000-0000-4000-8000-000000000004','Store Knowledge','ACTIVE'
);
INSERT INTO knowledge_documents(
  id,tenant_id,knowledge_base_id,source_type,title,content_hash,status,version,
  valid_from,expires_at,published_at,published_by
) VALUES (
  '49000000-0000-4000-8000-000000000007','49000000-0000-4000-8000-000000000001',
  '49000000-0000-4000-8000-000000000006','FAQ','营业时间',repeat('c',64),'READY',1,
  now(),now()+interval '365 days',now(),'49000000-0000-4000-8000-000000000002'
);
INSERT INTO knowledge_publications(
  id,tenant_id,store_id,knowledge_base_id,document_id,document_version,source_type,
  trust_level,title,citation_object_ref,content_hash,status,valid_from,expires_at,published_by
) VALUES (
  '49000000-0000-4000-8000-000000000008','49000000-0000-4000-8000-000000000001',
  '49000000-0000-4000-8000-000000000004','49000000-0000-4000-8000-000000000006',
  '49000000-0000-4000-8000-000000000007',1,'MERCHANT_RULE','AUTHORITATIVE','营业时间',
  'knowledge://store/hours/v1',repeat('d',64),'ACTIVE',now(),now()+interval '365 days',
  '49000000-0000-4000-8000-000000000002'
);

DO $$
BEGIN
  BEGIN
    UPDATE knowledge_publications SET title='篡改标题'
     WHERE id='49000000-0000-4000-8000-000000000008';
    RAISE EXCEPTION 'published knowledge unexpectedly changed';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM='published knowledge unexpectedly changed' THEN RAISE; END IF;
  END;
END
$$;

INSERT INTO conversations(
  id,tenant_id,store_id,customer_id,channel,status,risk_level,consumer_session_id,
  privacy_policy_version,context_type
) VALUES (
  '49000000-0000-4000-8000-000000000009','49000000-0000-4000-8000-000000000001',
  '49000000-0000-4000-8000-000000000004','49000000-0000-4000-8000-000000000005',
  'MERCHANT_MINI_PROGRAM','BOT_ACTIVE','NORMAL','consumer-session-db-gate','privacy-6.1','NONE'
);
INSERT INTO conversation_messages(
  id,tenant_id,conversation_id,sender_type,content_object_key,content_preview_redacted,message_type
) VALUES (
  '49000000-0000-4000-8000-000000000010','49000000-0000-4000-8000-000000000001',
  '49000000-0000-4000-8000-000000000009','CUSTOMER','object://question','几点营业？','TEXT'
);
INSERT INTO conversation_ai_jobs(
  id,tenant_id,conversation_id,customer_message_id,status
) VALUES (
  '49000000-0000-4000-8000-000000000011','49000000-0000-4000-8000-000000000001',
  '49000000-0000-4000-8000-000000000009','49000000-0000-4000-8000-000000000010','QUEUED'
);

UPDATE conversations SET status='HUMAN_REQUESTED'
 WHERE id='49000000-0000-4000-8000-000000000009';
INSERT INTO handoff_tickets(
  id,tenant_id,conversation_id,reason_code,priority,status,requested_by_type,due_at
) VALUES (
  '49000000-0000-4000-8000-000000000012','49000000-0000-4000-8000-000000000001',
  '49000000-0000-4000-8000-000000000009','CUSTOMER_REQUESTED_HUMAN','NORMAL','OPEN','CUSTOMER',
  now()+interval '30 minutes'
);
UPDATE conversations SET status='HUMAN_QUEUED'
 WHERE id='49000000-0000-4000-8000-000000000009';
UPDATE handoff_tickets
   SET status='ASSIGNED',assigned_user_id='49000000-0000-4000-8000-000000000002',accepted_at=now()
 WHERE id='49000000-0000-4000-8000-000000000012';
UPDATE conversations
   SET status='HUMAN_ACTIVE',assigned_user_id='49000000-0000-4000-8000-000000000002'
 WHERE id='49000000-0000-4000-8000-000000000009';

DO $$
BEGIN
  BEGIN
    INSERT INTO conversation_messages(
      tenant_id,conversation_id,sender_type,content_object_key,message_type
    ) VALUES (
      '49000000-0000-4000-8000-000000000001','49000000-0000-4000-8000-000000000009',
      'AI','object://late-ai-answer','TEXT'
    );
    RAISE EXCEPTION 'AI unexpectedly replied after human takeover';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM='AI unexpectedly replied after human takeover' THEN RAISE; END IF;
  END;
  BEGIN
    INSERT INTO conversation_messages(
      tenant_id,conversation_id,sender_type,sender_user_id,content_object_key,message_type
    ) VALUES (
      '49000000-0000-4000-8000-000000000001','49000000-0000-4000-8000-000000000009',
      'EMPLOYEE','49000000-0000-4000-8000-000000000003','object://spoofed-agent','TEXT'
    );
    RAISE EXCEPTION 'unassigned employee unexpectedly replied';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM='unassigned employee unexpectedly replied' THEN RAISE; END IF;
  END;
  BEGIN
    INSERT INTO handoff_tickets(
      tenant_id,conversation_id,reason_code,priority,status,requested_by_type
    ) VALUES (
      '49000000-0000-4000-8000-000000000001','49000000-0000-4000-8000-000000000009',
      'DUPLICATE','NORMAL','OPEN','RULE'
    );
    RAISE EXCEPTION 'second active handoff unexpectedly opened';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
END
$$;

INSERT INTO conversation_messages(
  id,tenant_id,conversation_id,sender_type,sender_user_id,content_object_key,message_type
) VALUES (
  '49000000-0000-4000-8000-000000000013','49000000-0000-4000-8000-000000000001',
  '49000000-0000-4000-8000-000000000009','EMPLOYEE',
  '49000000-0000-4000-8000-000000000002','object://assigned-agent','TEXT'
);

UPDATE conversation_ai_jobs
   SET status='RUNNING',attempt_count=1,locked_by='db-gate',locked_at=now()
 WHERE id='49000000-0000-4000-8000-000000000011';
UPDATE conversation_ai_jobs
   SET status='CANCELLED',locked_by=NULL,locked_at=NULL,completed_at=now()
 WHERE id='49000000-0000-4000-8000-000000000011';
DO $$
BEGIN
  BEGIN
    UPDATE conversation_ai_jobs SET last_error_code='MUTATED'
     WHERE id='49000000-0000-4000-8000-000000000011';
    RAISE EXCEPTION 'terminal AI job unexpectedly changed';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM='terminal AI job unexpectedly changed' THEN RAISE; END IF;
  END;
END
$$;

DO $$
BEGIN
  BEGIN
    INSERT INTO customer_profile_facts(
      tenant_id,customer_id,fact_type,value_object_ref,value_digest,source_type,source_ref,
      purpose,generation_method,confirmed_at,expires_at
    ) VALUES (
      '49000000-0000-4000-8000-000000000001','49000000-0000-4000-8000-000000000005',
      'PREFERENCE','object://preference',repeat('e',64),'CUSTOMER','conversation:1',
      'CONTINUOUS_CUSTOMER_SERVICE','DIRECT_FACT',now(),now()+interval '365 days'
    );
    RAISE EXCEPTION 'profile fact without consent unexpectedly persisted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM='profile fact without consent unexpectedly persisted' THEN RAISE; END IF;
  END;
END
$$;

INSERT INTO customer_consents(
  id,tenant_id,customer_id,consent_type,policy_version,status,evidence_ref,occurred_at,
  purpose,interface_ref,valid_until
) VALUES (
  '49000000-0000-4000-8000-000000000014','49000000-0000-4000-8000-000000000001',
  '49000000-0000-4000-8000-000000000005','PROFILE_MEMORY','privacy-6.1','GRANTED',
  'ui://consent/granted',now(),'CONTINUOUS_CUSTOMER_SERVICE','ASK_THE_CLERK',now()+interval '365 days'
);
INSERT INTO customer_profile_facts(
  id,tenant_id,customer_id,fact_type,value_object_ref,value_digest,source_type,source_ref,
  purpose,generation_method,confirmed_at,expires_at
) VALUES (
  '49000000-0000-4000-8000-000000000015','49000000-0000-4000-8000-000000000001',
  '49000000-0000-4000-8000-000000000005','PREFERENCE','object://preference',repeat('e',64),
  'CUSTOMER','conversation:1','CONTINUOUS_CUSTOMER_SERVICE','DIRECT_FACT',now(),now()+interval '365 days'
);
INSERT INTO customer_consents(
  tenant_id,customer_id,consent_type,policy_version,status,evidence_ref,occurred_at,
  purpose,interface_ref
) VALUES (
  '49000000-0000-4000-8000-000000000001','49000000-0000-4000-8000-000000000005',
  'PROFILE_MEMORY','privacy-6.1','WITHDRAWN','ui://consent/withdrawn',now()+interval '1 second',
  'CONTINUOUS_CUSTOMER_SERVICE','CUSTOMER_PRIVACY_CENTER'
);
UPDATE customer_profile_facts SET status='DELETION_PENDING'
 WHERE id='49000000-0000-4000-8000-000000000015';

DO $$
BEGIN
  BEGIN
    INSERT INTO customer_profile_facts(
      tenant_id,customer_id,fact_type,value_object_ref,value_digest,source_type,source_ref,
      purpose,generation_method,confirmed_at,expires_at
    ) VALUES (
      '49000000-0000-4000-8000-000000000001','49000000-0000-4000-8000-000000000005',
      'PREFERENCE','object://new-preference',repeat('f',64),'MODEL_SUMMARY','conversation:1',
      'CONTINUOUS_CUSTOMER_SERVICE','MODEL_SUMMARY',now(),now()+interval '365 days'
    );
    RAISE EXCEPTION 'new profile fact after withdrawal unexpectedly persisted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM='new profile fact after withdrawal unexpectedly persisted' THEN RAISE; END IF;
  END;
  BEGIN
    UPDATE customer_consents SET evidence_ref='tampered'
     WHERE id='49000000-0000-4000-8000-000000000014';
    RAISE EXCEPTION 'consent evidence unexpectedly changed';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM='consent evidence unexpectedly changed' THEN RAISE; END IF;
  END;
END
$$;

ROLLBACK;
\echo 'Customer-service grounding, human takeover, identity and privacy guards passed'
