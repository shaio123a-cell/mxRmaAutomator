# Remote Script Execution — Design

Remote Dry Run / Run Execution: run scripts on remote Windows or Linux hosts, with secure credential management, a managed server inventory, and guaranteed script-version integrity.

## 1. Goal

Today the app can only execute scripts locally (on the Windows machine running Electron). In many cases the execution must happen on a remote Windows or Linux server.

This design adds:

- **Remote execution** over SSH (Linux, Windows/OpenSSH) and WinRM / PowerShell Remoting (Windows).
- **Secure credential management** — secrets never in plaintext files, Redux, logs, or the FBCSKM config.
- **Server inventory (Execution Hosts)** — a dedicated, separately-stored list of machines the user may run on.
- **Script identity & integrity verification** — always execute the exact script version the user selected, and prove it (SHA-256 hash comparison).

## 2. Confirmed decisions

| Topic | Decision |
|---|---|
| Targets | Separate **Execution Hosts** inventory (not config-file Devices), optionally linked to a Device |
| Target kinds | Target picker supports **local**, **Execution Host** (inventory), **config-file Device**, and **one-off** (typed, not saved unless "Remember as an execution host") — see §8.3 |
| Credential source | Always explicit per run: **Device's stored creds** (config Device, in-memory only) / **vault profile** / **entered for this run** — see §8.4 |
| Device linking | A linked Device is a **convenience** (offered as a target, can inherit address/OS); credentials stay an explicit choice; the vault never writes back into the config |
| UI placement | New left-rail view **Execution Hosts** with tabs **Hosts** and **Credentials**; list + right-side `Drawer` editor; one **Run dialog** (confirm → live console) — see §8 |
| Transports | Linux SSH; Windows WinRM + OpenSSH + PowerShell Remoting (all four) |
| Credential storage | OS keychain via Electron `safeStorage` (Windows DPAPI) |
| Run modes | Verify remote path first, then run; both "invoke remote path" and "push content" supported |
| Mismatch policy | **Auto-upload the user's selected version** (remote backed up first), then run — no blocking prompt |
| Backup | Always copy the remote file to a timestamped `.bak` before overwrite |
| Output | Streaming stdout/stderr + exit code + duration + cancel |
| Version UI | Keep the existing single Run action on the currently selected agentic version |
| Integrity | Always verify the executed script equals the selected version |

## 3. Current state (baseline)

- Execution is local-only:
  - `electron/main.js` — `run-command` uses `child_process.exec(command)` with a 30s timeout.
  - `electron/main.js` — `encode-script` writes a temp `.ps1`, runs `powershell -NoProfile -ExecutionPolicy Bypass -File`, then deletes it (Windows only).
  - Exposed through `electron/preload.js` as `runCommand` / `encodeScript`.
  - Callers: `AgenticScriptPanel.tsx` (`testScript`), `ScriptForm.tsx` (`runDryRun`), `ScriptList.tsx` (`dryRun`). Command built by `src/utils/scriptArgs.ts`.
- Device fields (`Device.username/password/publicKeyPath/privateKeyPath/passphrase/port=5985`) are **metadata written into the PATROL/RestMon config file** — the app never connects with them. App-execution credentials must be kept **separate** from config-file credentials.
- Electron is configured correctly: `contextIsolation: true`, `nodeIntegration: false`, preload bridge only.
- No SSH/WinRM code exists yet.

## 4. Architecture

All secrets and network I/O live in the **main process**. The renderer gets a thin API and never receives a decrypted secret.

```
electron/remote/index.js      router: resolve host + credential -> transport
electron/remote/vault.js      safeStorage-encrypted credential store
electron/remote/inventory.js  non-secret host metadata
electron/remote/ssh.js        ssh2 (Linux; Windows w/ OpenSSH)
electron/remote/winrm.js      WinRM 5985/5986
electron/remote/powershell.js PowerShell Remoting (shell-out to pwsh)
electron/remote/integrity.js  SHA-256 hash + verify + backup + upload
electron/remote/audit.js      append-only audit log (secrets redacted)
src/services/remoteExecution.ts   renderer wrapper
```

- **Local** execution becomes just another transport, so a single `runScript()` path handles local and remote.
- New IPC channels (validated inputs; renderer passes IDs only, never secrets):
  - `remote:hosts:list | save | delete`
  - `remote:cred:set | clear | has`
  - `remote:test`
  - `remote:run`
  - `remote:cancel`
  - `remote:output` (event stream from main → renderer)
  - `remote:audit:list`

### Renderer API (sketch)

```ts
runScript({
  targetId: 'local' | hostId,
  sourceKind: 'agentic-version' | 'editor-draft' | 'saved-instance',
  versionId: string,
  name: string,
  content: string,        // content of the SELECTED version
  contentHash: string,    // SHA-256 (normalized)
  runMode: 'verify-path' | 'push-and-run',
  remotePath?: string,
  args: string,           // or RestMonArgs
  isRestmon: boolean,
  onOutput: (chunk: { stdout?: string, stderr?: string }) => void,
  signal: AbortSignal,    // cancel
}): Promise<RunResult>
```

## 5. Credential vault & security

### 5.1 Storage locations

All remote-execution data lives under the app data directory (`%APPDATA%\mxRestmonSuperSonic\` on Windows), **never** in the FBCSKM config file.

| Data | File | Contents | Protection |
|---|---|---|---|
| Inventory metadata | `remote-hosts.json` | host name/address, OS, transport, `credentialProfileId`, environment, linked Device, host-key fingerprint, insecure-HTTP flag, working dir | Not secret; ACL restricted to the user |
| Credential profile metadata | `remote-profiles.json` | `id`, `name`, `authType`, `username`, `secretRef`, `hasSecret` | Not secret; no secret values |
| Secrets | `remote-vault.json` | passwords, passphrases, optionally-imported private-key material — **ciphertext only** (`safeStorage.encryptString` → base64) | Encrypted at rest (Windows DPAPI, per Windows user) |
| Audit | `remote-audit.jsonl` | one entry per run; secrets redacted | Append-only; ACL restricted |
| Runtime | main-process memory only | decrypted secrets for the lifetime of a connection | never written to disk by the app |

Secrets never enter Redux, `localStorage`, agentic chat history, the FBCSKM config, logs, or streamed output.

**Persistence:** hosts, profiles and secrets are written to disk as soon as they are saved/rotated — there is no explicit export step — so they survive app restarts and upgrades. Nothing is re-entered at launch; the only possible prompt is the optional P5 master password.

**Scope:** all of it is **per Windows user account**. `%APPDATA%` resolves to `C:\Users\<user>\AppData\Roaming\...` and DPAPI is user-scoped, so every Windows account on the same server has its own independent inventory and vault and cannot decrypt another user's secrets. Two people using the *same* Windows account share everything. There is **no machine-wide / all-users store** in P1; a shared team inventory would be a deliberate later feature (shared encrypted store + master password), not the default.

### 5.2 Credential profiles

- **Credential profiles** (reusable) referenced by hosts — one service account is defined once and reused across servers; editing a profile updates every host that references it.
  - Fields: `id`, `name`, `authType` (`password` | `private-key` | `ssh-agent` | `windows-integrated`), `username`, `secretRef` (points into the vault), `hasSecret`.
- Private keys: store the **path** by default; optionally import key material into the vault. Passphrase treated like a password.

### 5.3 Security properties

- Renderer sees only `hasSecret: boolean` and can `set` / `clear` / `rotate`. Decrypted secrets exist only inside main, only for the lifetime of a connection.
- **SSH host-key pinning (TOFU):** capture fingerprint on first connect, store it in the inventory, hard-stop with a visible warning if it later changes.
- **WinRM:** HTTPS (5986) preferred with certificate validation. HTTP (5985) allowed only via an explicit per-host "Allow insecure HTTP" flag, with a persistent warning badge.
- Never log or echo secrets; redact them in streamed output and audit entries.
- **Fail closed:** if `safeStorage.isEncryptionAvailable()` is false (e.g. Linux without a keyring), refuse to store secrets and show an error — never fall back to plaintext.

### 5.4 Threat model — what this protects and what it does not

- **Protects at rest:** ciphertext is bound to the OS user by DPAPI, so copying `remote-vault.json` to another Windows user account (or another machine, absent a roaming profile) yields unusable data. This covers backups, file theft and casual inspection.
- **Does NOT protect against** malicious code running as the same Windows user: it can call the same `safeStorage` API or read main-process memory while a connection is live. This is at-rest protection, not an HSM.
- **Memory:** decrypted secrets live only in main for the connection lifetime; zeroing is best-effort in a GC language. Never pass secrets in process argv (visible in process lists).
- **No master password in P1:** access is effectively equivalent to access to the user's Windows session.
- **Contrast with today:** current Device passwords and AI API keys are plaintext JSON in appData/config; the vault is a strict improvement, but not a panacea.

### 5.5 Hardening requirements

- ACL-restrict `remote-hosts.json`, `remote-profiles.json`, `remote-vault.json`, `remote-audit.jsonl` to the current user; exclude the vault from any config export/backup.
- Never log or echo secrets; redact streamed output and audit entries.
- Optional (P5): AES-GCM **master-password mode** for portable/shared machines, key derived with `scrypt`; consider re-auth / idle lock around rotate/clear and tamper detection (HMAC).

## 6. Script identity & integrity verification (core requirement)

Requirement: "Run the version the user actually asked for — always verify that you run the correct script." Example: the user generated v1/v2/v3 of a script and asks to run v2 → v2 must be executed, and the remote copy must match v2.

### 6.1 Content identity

- Every script version gets `contentHash = SHA-256(normalizeEOL(content))` (line endings normalized; BOM-insensitive).
- Added to:
  - every agentic version (`AiGeneratedScript` in `src/utils/fileApi.ts`, entries of `AgenticChatRecord.generatedScripts[]`),
  - every `ScriptInstance` (`src/store/fbcskmSlice.ts`).
- Use Node `crypto` / WebCrypto. The existing FNV hash used in `store.ts` for config-default tracking is **not** cryptographically suitable and is not reused here.

### 6.2 Run request

```ts
{
  sourceKind: 'agentic-version' | 'editor-draft' | 'saved-instance',
  versionId, name, content, contentHash,
  targetId, runMode, remotePath
}
```

The agentic Run always targets the **currently selected** `generatedScript` (the version selector in `AgenticScriptPanel.tsx` already models this). The UI shows "Running version N: `<name>` · `<hash-short>`".

### 6.3 Pre-execution verification (main process)

1. Resolve the remote path:
   - editor/`ScriptInstance` → `scriptPath` from the config,
   - agentic → per-host working dir + script name (e.g. `/tmp/mx-rma/<name>` or the configured `genericPath`),
   - user can confirm/override in the run dialog.
2. Download the remote file and hash it.
3. **Match** with `contentHash` → run.
4. **Mismatch** →
   - back up the remote file to a timestamped `.bak`,
   - upload the user's selected version,
   - **re-download and re-hash to prove byte-identity**,
   - run,
   - show a non-blocking notice: "Remote differed; replaced with your version; backup kept at `<path>`",
   - record the decision in the audit log.
5. On success, stamp the version/instance with `lastVerified: { hostId, hash, at }` and show a badge.

### 6.4 Editor/instance path

Compare the current draft against the saved instance and the remote copy; surface any differences before running ("draft differs from saved/remote").

## 7. Transports

| Target | Library | Auth | Notes |
|---|---|---|---|
| Linux | `ssh2` (pure JS) | password, key+passphrase, agent | SFTP read/upload, host-key pinning, ProxyJump |
| Windows | `winrm` (pure JS, NTLM/Kerberos) | password, integrated | 5985/5986; get/set/replace file for verify + backup + upload |
| Windows | `ssh2` (OpenSSH server) | same as Linux | shared code path with Linux |
| Windows | PowerShell Remoting (shell-out) | password/integrated | zero extra dependency; `New-PSSession` + `Copy-Item -ToSession` |

- Streaming: SSH `stream.on('data')` → `webContents.send('remote:output', …)`; local execution upgraded from `exec` to `spawn` for streaming + cancel; WinRM via the library's streaming callback (may require chunked polling — flagged risk).
- Both `ssh2` and `winrm` are pure JS → low risk for `electron-builder` packaging.

## 8. UX design

### 8.0 Navigation

- The left icon rail gains a third view, **Execution Hosts**, alongside **Configuration Editor** and **Agentic Scripting** (same pattern as `AppShell.tsx:49-58`).
- The view has two internal tabs: **Hosts** and **Credentials**.
- Execution Hosts is **independent of the config-file Devices list**. A Device may optionally be linked for convenience only (see §8.3/§8.4); the vault never writes back into the config.

### 8.1 Hosts tab (admin area)

- Inventory list (left) + right-side `Drawer` for Add/Edit, matching the `DeviceForm` (520 px) / `ScriptForm` (min(1100px, 92vw)) conventions.
- Drawer fields: name, host/FQDN, OS, transport (auto-probe + suggestion), auth method, credential profile, environment tag (`prod`/`stage`/`lab`), optional linked Device, "Allow insecure HTTP" (WinRM), remote working dir.
- Row badges: OS icon, transport, auth type, verified host-key check, credential-locked icon, environment tag (prod colored/guarded), last connected, linked device.
- Row overflow menu (same as `DeviceList.tsx:187-204`): Edit, Test connection, Duplicate, Delete.
- **Test connection** button per host and per credential profile, with an inline result chip.
- Import / export of inventory **without secrets** by default (secrets re-entered on the new machine).

### 8.2 Credentials tab

- Reusable **CredentialProfiles** list + right-side `Drawer`.
- Fields: name, `authType` (`password` | `private-key` | `ssh-agent` | `windows-integrated`), username, secret state.
- Actions: **Set secret**, **Rotate**, **Clear**, **Test**; show "used by N hosts".
- The renderer only ever sees `hasSecret: boolean` (lock/unlock icon); decrypted secrets exist only inside main (see §5).

### 8.3 Target model

A run target is not limited to saved hosts — a target may be a config Device or a value typed for a single run. The **Target** control is therefore a grouped picker:

```
Target  [ v ]
  This computer (local)                      <- default
  -- Execution Hosts --
    prod-linux-01   [prod] [SSH]
    win-app-02      [stage] [WinRM]
  -- Config-file Devices --
    RMA-Web         10.0.0.5 - has credentials
  -- Other --
    + One-off target...
```

1. **This computer (local)** — the default; behaves as today.
2. **Execution Hosts** — saved inventory entries.
3. **Config-file Devices** — auto-fill address/OS/transport from the Device fields (`Device.name/forcedIP/port/username/password/publicKeyPath/privateKeyPath/passphrase`, `DeviceForm.tsx:141-238`); labelled with address and "has credentials".
4. **+ One-off target…** — inline address/OS/transport/auth fields (nothing is saved unless "Remember as an execution host" is checked, which reveals a name field). This covers servers not present in the config file.

### 8.4 Credential source (always explicit)

For every run the credential source is chosen explicitly:

- **Use this Device's stored credentials** — only for config-Device targets; the values transit IPC for the run only and are never persisted back into the vault or config.
- **Choose a vault credential profile** — the clean path for hosts and one-off targets.
- **Enter for this run** — ad-hoc credentials for a single execution.

### 8.5 Run experience (one dialog: confirm → live console)

- Evolve `DryRunResultsDialog` into a single **Run dialog** used by every run action (`Dry Run` in `ScriptForm.tsx` / `ScriptList.tsx`; `Test Run` in `AgenticScriptPanel.tsx`).
- **Stage A — confirm:** target (host + prod badge), **version id + name + short hash**, run mode (`verify-path` / `push-and-run`), resolved remote path, backup path. Advisory when a draft differs from saved/remote (§6.4). `prod` hosts gate the Run button behind a typed phrase.
- **Stage B — live console:** streaming stdout/stderr, exit code, duration, **Cancel**, copy-command (redacted). Auto-upload on mismatch is a **non-blocking notice** with the `.bak` path (no prompt).
- Last-used target persisted per script/device.

### 8.6 Agentic version selector

- Selector options become `N · name · model · <short-hash>`; version metadata gains created time, model, and a **verified** badge (`lastVerified`, §9).
- A single **Run** action uses the currently selected version — no per-version run button.

### 8.7 States & guardrails

- Empty inventory: prompt to Add host, with "how to enable SSH/WinRM" guidance.
- Non-Electron: inline "remote execution requires the desktop app" message (same idea as the current "Dry run is only available in the Electron app").
- Host-key changed: hard-stop card showing stored vs new fingerprint (§5).
- Insecure HTTP (WinRM 5985): persistent warning badge on the host and carried into the Run dialog.

## 9. Data model additions

```ts
interface ExecutionHost {
  id: string
  name: string
  address: string                 // host or FQDN
  os: 'windows' | 'linux'
  transport: 'ssh' | 'winrm' | 'powershell-remoting' | 'local'
  credentialProfileId: string
  environment?: 'prod' | 'stage' | 'lab'
  linkedDeviceId?: string
  hostKeyFingerprint?: string     // SSH TOFU pin
  insecureHttp?: boolean          // WinRM 5985 opt-in
  remoteWorkingDir?: string
  lastConnectedAt?: string
}

interface CredentialProfile {
  id: string
  name: string
  authType: 'password' | 'private-key' | 'ssh-agent' | 'windows-integrated'
  username: string
  secretRef: string               // points into the safeStorage vault
  hasSecret: boolean              // only this is exposed to the renderer
}

// The four target kinds offered by the Run dialog Target picker (see §8.3).
type RunTarget =
  | { kind: 'local' }
  | { kind: 'host'; hostId: string }
  | { kind: 'device'; deviceId: string }
  | {
      kind: 'adhoc'               // a server not in the config file or inventory
      save?: boolean              // "Remember as an execution host"
      name?: string               // required when save is true
      address: string
      os: 'windows' | 'linux'
      transport: 'ssh' | 'winrm' | 'powershell-remoting'
      port?: number
    }

// Credential source is always explicit (see §8.4).
type CredentialSource =
  | { kind: 'device' }                                  // config Device's stored creds; in-memory only, never persisted
  | { kind: 'profile'; profileId: string }              // vault credential profile
  | {
      kind: 'adhoc'                                     // entered for this run only
      authType: CredentialProfile['authType']
      username: string
      password?: string
      privateKeyPath?: string
      passphrase?: string
      useAgent?: boolean
    }

// additions to AiGeneratedScript and ScriptInstance:
contentHash?: string
lastVerified?: { hostId: string; hash: string; at: string }

interface RunResult {
  runId: string
  target: RunTarget
  credentialSource: CredentialSource
  versionId: string
  contentHash: string
  remoteHashBefore?: string
  remoteHashAfter?: string
  uploaded: boolean
  backupPath?: string
  exitCode?: number
  durationMs: number
  stdout: string
  stderr: string
  decision: 'matched' | 'uploaded-after-mismatch' | 'local'
}
```

Audit log: append-only JSONL under appData, secrets redacted, one entry per run.

## 10. Code integration points

| File | Change |
|---|---|
| `electron/main.js` | keep `run-command` / `encode-script` as the **local** transport; add `spawn`-based streaming + cancel; register `remote:*` channels |
| `electron/preload.js` | expose the `remote:*` channels through the existing context-isolated bridge |
| `src/utils/scriptArgs.ts` | add per-OS remote arg/quote variants (bash vs PowerShell); guard untrusted-args injection |
| `src/components/ScriptForm.tsx`, `ScriptList.tsx`, `AgenticScriptPanel.tsx` | replace direct `runCommand`/`encodeScript` calls with `runScript({ target, credentialSource, … })`; open the shared **Run dialog** (target picker incl. one-off/config-Device + credential source) |
| new `src/components/RunDialog.tsx` | one dialog for confirm → live console (evolves `DryRunResultsDialog`); drives `runScript` + `remote:output` streaming + cancel |
| new `src/components/ExecutionHostsView.tsx` | rail view with **Hosts** / **Credentials** tabs; list + right-side `Drawer` editor |
| `src/store/fbcskmSlice.ts` | optional: hold non-secret host metadata in state; secrets stay in main |
| `src/utils/fileApi.ts` | add `contentHash` / `lastVerified` to `AgenticChatRecord` version entries |
| `package.json` | add `ssh2`, `winrm`; verify `electron-builder` packaging |
| `Docs/Design/Backlog.md` | move related items here once implemented |

## 11. Phased delivery

- **P0** Threat model + finalize transport/auth matrix.
- **P1** Credential vault (`safeStorage`) + Execution Hosts inventory + credential profiles + Test connection + **Execution Hosts UI** (Hosts/Credentials tabs, list + right-side `Drawer`).
- **P2** SHA-256 script identity: `contentHash` on agentic versions and `ScriptInstance`; version metadata + "verified" badge.
- **P3** SSH transport (Linux) + unified `runScript` + **shared Run dialog** (target picker: local/host/device/one-off + explicit credential source) + verify-then-run / push-and-run with re-hash + remote backup + streaming output and cancel.
- **P4** Windows transports (WinRM, OpenSSH, PowerShell Remoting) + auto-detect and guided setup.
- **P5** Prod safeguards, audit log, inventory import/export, optional master-password vault.
- **P6** Optional: bulk multi-host runs, scheduling, approval workflow, Ansible/agent bridge.

## 12. Risks & notes

- **Auto-overwrite on mismatch** (decided): a remote file changed by someone else is replaced without a prompt — mitigated by the mandatory `.bak` backup, the visible notice, and the audit entry. Consider adding a confirm gate for prod hosts only.
- Windows OpenSSH/WinRM are often disabled or firewalled → auto-probe plus "how to enable" guidance is important.
- Remote argument quoting / injection is the sharpest edge; needs its own test matrix.
- WinRM streaming quality varies by library; may degrade to chunked output.
- Agentic scripts have no remote path by default → a per-host working-dir convention is required (e.g. `/tmp/mx-rma/<name>` or the configured `genericPath`).
- Adding `ssh2` / `winrm` requires re-verifying `electron-builder` packaging and the portable target.

## 13. Open questions

- ~~Should the credential profiles also be usable for the **config-file Device credentials** (single source of truth), or stay strictly separate from the FBCSKM output?~~ **Decided:** strictly separate. Vault profiles are never written back into the config; a config Device's stored credentials may still be *read* as an explicit run-time source (§8.4).
- Do we need jump-host / bastion support (ProxyJump) in the first release?
- Is SSH-agent forwarding needed for the Linux workflow?
- Multi-user / shared workstation: is DPAPI enough, or is the master-password vault (P5) required earlier?
