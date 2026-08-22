# Legal and compliance document release

The product owner and qualified legal/compliance reviewer must approve the actual documents for the launch jurisdiction. This runbook verifies publication and version binding; it does not generate legal advice or authorize placeholder copy.

## Required publication set

Inventory every applicable surface in 乐趣宝, 乐趣生活 and the merchant mini-program template. For each surface, identify the required user/service agreement, privacy policy, personal-information processing notices, permission explanations, account deletion/export instructions and any merchant/payment/refund terms required by the approved launch scope.

For every document record:

- use an immutable document ID, version and SHA-256;
- record the accountable owner, legal/compliance approval receipt and UTC effective time;
- publish through a stable HTTPS or official mini-program route reachable before consent;
- bind the version recorded by consent and privacy operations to the exact published bytes;
- verify links on signed-out, signed-in and relevant confirmation surfaces using real devices where applicable;
- define retention, supersession and withdrawal behavior without rewriting prior consent evidence;
- exclude secrets, personal approver values and unpublished legal drafts from the release bundle.

## Evidence result

Export `identity-secrets-privacy-oncall/legal-document-release.json` with the candidate commit, deployment identifier, surface-to-document matrix, document hashes, publication checks, approval receipt references and reviewer decision. Each document needs a unique ID, version, SHA-256, owner reference, approval receipt, non-future effective time and stable HTTPS publication URL. The matrix must separately cover 乐趣宝 Web, 乐趣生活 mini-program and the merchant mini-program, reference only declared document IDs, verify account deletion/export instructions and contain no failed publication check. Product and legal/compliance approvals must use different accountable subjects. The artifact must report no missing surface, broken link, placeholder text, version mismatch or unresolved reviewer condition.

Any missing approval, draft/placeholder copy, inaccessible policy, consent-to-document mismatch or absent account deletion/export instruction is a no-go. Updating a document after acceptance creates a new controlled result; it cannot silently retain the old release decision.
