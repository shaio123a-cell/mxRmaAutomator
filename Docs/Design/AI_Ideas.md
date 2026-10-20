# AI Ideas

Working notes for adding AI assistance without making the app autonomous. Every proposal below follows the same rule: the AI may explain and propose, but the user applies, saves, runs, and deploys.

## Decisions

- **Patch-only self-healing.** The first release diagnoses a failed run and proposes a corrected script plus a readable diff. It never executes, saves, or deploys on its own.
- **Explicit apply.** A repaired script is added as a new in-memory version. The previous version is kept. Nothing is written to disk until the user saves.
- **Manual restore.** Version history plus backups, with a one-click restore. No automatic rollback in the first release.
- **Reuse the model chain.** All AI features use the existing fallback chain and support every configured provider. A failed model falls through to the next one.
- **Show provider data flow.** Each AI action states that script content and output are sent to the configured provider.

## P1 — Diagnose and fix a failed run (implemented)

Entry point: the run result panel in `RunDialog`. The button appears when the exit code is non-zero, stderr is non-empty, or PATROL output validation fails.

Flow:

1. Collect script content, target OS and transport, command, exit code, stdout, stderr, and PATROL validation issues.
2. Call `diagnoseScriptFailure()` in `src/services/aiService.ts`, which walks the fallback chain and asks for a strict JSON object.
3. Show the diagnosis, root cause, proposed changes, risks, and items the user must provide.
4. Render the patch with the local `src/utils/lineDiff.ts` utility.
5. Optional actions: copy the patched script, or apply it as a new version through `onApplyDiagnosis` (wired in `AgenticScriptPanel`).

Safety:

- The dialog is read-only until the user clicks apply or copy.
- No filesystem, SSH, or deployment calls are made by the diagnosis path.
- Empty `fixedScript` means the AI believes the cause is environmental; the UI says no code change is suggested.
- Low-confidence and missing-input results are surfaced, not hidden.

Follow-up work:

- Feed the last 3 failed runs, not just the most recent one.
- Let the user mark a diagnosis as helpful or wrong to build a small local feedback log.
- Add a "re-test repaired version" shortcut that opens the run dialog with the new version selected.

## P2 — Version history and backups panel (planned)

- Persist each saved script version with a content hash, timestamp, author (user or AI), and model name.
- Keep local backup copies using the existing rotation in `electron/main.js`.
- Remote hosts already create `.bak` files; surface them in the panel.
- One-click restore writes the selected version back to the working copy.
- Restore is always manual and always confirmed.

## P3 — Explain a script or a failure in plain language (planned)

- "Explain this script" summarizes what the script checks, which commands it runs, and what it changes.
- "Explain this output" turns raw stdout and stderr into a short operator-friendly summary.
- Both are read-only and can reuse the same provider chain.

## P4 — Guided authoring from intent (planned)

- Turn a plain-language monitoring goal into a first draft script.
- Show assumptions and required parameters before generation.
- Run the existing validation and show results before the user saves anything.

## P5 — Local knowledge and runbooks (planned)

- Index local runbooks and prior accepted diagnoses.
- Retrieve relevant passages to make diagnoses more specific to the environment.
- Keep the index local; do not upload documents unless the user chooses to.

## Non-goals

- Autonomous execution, deployment, or credential changes.
- Silent configuration writes.
- Automatic rollback without user confirmation.
- Sending data to providers that are not configured in the app.
- Hidden prompts or unreviewable background AI calls.

## Shared rules for future work

1. Every AI action has a visible entry point and a clear description of what data leaves the machine.
2. AI output is untrusted until the user reviews it.
3. Applying AI output creates a new version; it never overwrites the only copy.
4. Failures are explained with the model that produced the result and whether a fallback was used.
5. Prefer local utilities over new network dependencies when a small implementation is enough (for example, the line diff).
