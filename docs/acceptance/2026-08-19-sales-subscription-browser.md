# Sales and subscription browser acceptance — 2026-08-19

## Scope

- PAGE-031 contract and collection command forms.
- PAGE-050 subscription activation and different-person decision forms.
- Desktop viewport: 1440×900.
- Mobile viewport: 390×844.
- Local acceptance server returned deterministic non-production records and captured submitted JSON. No production credential, personal identifier, payment reference or external system was used.

## Evidence

- PAGE-031 loaded an authoritative opportunity detail and rendered three page-owned commands: create contract, confirm signature and finance collection confirmation.
- Contract creation submitted only `quoteId`, `contractNo`, `contractAssetId` and `privacyPolicyVersion` in the JSON body. The route-owned opportunity ID remained authoritative.
- `merchantSignerReference` and `providerReference` rendered as password controls. Neither value appeared in the page URL.
- PAGE-050 rendered activation and decision commands. Activation converted the local `datetime-local` value to an ISO instant and submitted `changeType`, contract, plan, effective time and reason in JSON.
- Both tested commands displayed the explicit confirmation dialog and reached the success state after the local API acknowledged them.
- Desktop document/root scroll width was 1425 px inside a 1440 px viewport.
- Mobile document/root scroll width was 375 px inside a 390 px viewport before and after command execution.
- Browser console warnings/errors: 0.
- Production URLs retained only resource IDs; raw identifiers, signer references, collection references and entered commercial values were not added to browser history.

## Result

PASS for the local Web interaction boundary and responsive layout. This evidence does not replace PostgreSQL execution, real merchant identity confirmation, bank/payment provider reconciliation or controlled production credentials.
