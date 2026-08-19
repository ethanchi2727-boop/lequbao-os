# V6.1 launch threat model and data flow

Trust boundaries are consumer/merchant clients, employee sessions, public callbacks, internal workers, PostgreSQL, object storage, provider gateways and isolated plugin runtimes. Tenant identity always comes from a verified session or a signed internal job; client tenant headers are not trusted.

Primary threats and controls: cross-tenant access is stopped by service scope and PostgreSQL RLS; money tampering by server snapshots, integer cents and reconciliation; callback replay by signature, time window and immutable receipts; prompt/tool escalation by structured allowlisted tools; upload attacks by object evidence and malware-first processing; plugin escape by exact grants and HTTPS domain allowlists; secret exposure by references, redacted logs and source/SBOM gates; deletion gaps by target-specific durable tasks and post-restore replay.

Money flows directly between consumer and the confirmed merchant payment account. Subscription receipts, consumer payments, reward ledgers and channel distribution remain separate aggregates and reconciliation domains. Personal content is stored by tenant, purpose and retention basis; logs and metrics contain traceable identifiers but no full customer content or secrets.
