# Merchant intake browser acceptance — 2026-08-18

## Scope

- Branch: `upgrade/v6.1-rebuild`
- Baseline: `482ba9d` plus the responsive fix and this acceptance record
- Runtime: the repository-owned static workbench server at `http://127.0.0.1:4173`
- Mode: explicit `demo=1`; production API behavior remains covered by the API-client and service tests

## Page and viewport matrix

| Surface             | URL                    | Viewport | Result                    |
| ------------------- | ---------------------- | -------- | ------------------------- |
| PC default          | `/bao/page-014?demo=1` | 1440×900 | Pass                      |
| PC narrow           | `/bao/page-014?demo=1` | 1024×768 | Pass after responsive fix |
| Mobile conversation | `/bao/page-175?demo=1` | 390×844  | Pass                      |
| Mobile file sheet   | `/bao/page-176?demo=1` | 390×844  | Pass                      |
| Mobile voice sheet  | `/bao/page-177?demo=1` | 390×844  | Pass                      |
| Mobile confirmation | `/bao/page-178?demo=1` | 390×844  | Pass                      |

All tested surfaces had no horizontal overflow. Desktop navigation and results remained visible at the two PC sizes; mobile hid the desktop sidebar and kept the composer and bottom navigation visible.

## Interaction evidence

- Sending supplemental text clears the composer and reports `已保存并进入识别队列`.
- Selecting the address candidate routes from PAGE-014 to PAGE-178 while preserving demo mode.
- PAGE-177 toggles between idle and recording presentations and returns to idle.
- PAGE-178 starts with confirmation disabled, enables it only after the legal-impact checkbox is checked, and then renders the success state with the workspace inert.
- The recoverable error action returns to the normal intake workspace without losing the demo session.

## State matrix

The following query-driven states were rendered and checked at 390×844:

- `loading`: session recovery and server-persistence copy present.
- `empty`: first-document and direct-text guidance present.
- `error`: retryable recognition outage and retained-material copy present.
- `denied`: permission guidance present; workspace inert.
- `stopped`: organization-stop guidance present; workspace inert.
- `success`: confirmed/background-delivery copy present; workspace inert.

No browser warning or error console entries were observed during the PC, mobile, interaction, or state checks.

## Defect found and fixed

At 1024×768, the desktop composer originally flowed below the viewport. Desktop workspaces now use viewport-bounded independently scrollable chat/results columns with a sticky composer. The fix was reloaded and retested at 1024×768 and 390×844; the composer remained visible and mobile fixed navigation was unaffected.

## External integration boundary

This acceptance validates the repository UI and deterministic demo states. Production object storage, malware scanning, OCR, ASR, structured extraction, enterprise WeCom callbacks, backup/restore and rollback drills still require controlled credentials or infrastructure and remain release-enablement gates rather than browser defects.
