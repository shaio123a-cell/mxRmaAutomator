export type RemoteOs = 'windows' | 'linux'
export type RemoteTransport = 'ssh' | 'winrm' | 'powershell-remoting' | 'local'
export type RemoteAuthType = 'password' | 'private-key' | 'ssh-agent' | 'windows-integrated'
export type EnvironmentTag = 'prod' | 'stage' | 'lab'

export interface ExecutionHost {
  id: string
  name: string
  address: string
  os: RemoteOs
  transport: RemoteTransport
  credentialProfileId: string
  environment?: EnvironmentTag
  linkedDeviceId?: string
  hostKeyFingerprint?: string
  insecureHttp?: boolean
  remoteWorkingDir?: string
  lastConnectedAt?: string
}

export type ExecutionHostInput = Omit<ExecutionHost, 'id'> & { id?: string }

export interface CredentialProfile {
  id: string
  name: string
  authType: RemoteAuthType
  username: string
  privateKeyPath?: string
  secretRef: string
  hasSecret: boolean
}

export type CredentialProfileInput = Omit<CredentialProfile, 'id' | 'secretRef' | 'hasSecret'> & { id?: string }

export interface RemoteInventory {
  hosts: ExecutionHost[]
  profiles: CredentialProfile[]
}

export interface DeviceTargetInfo {
  name: string
  address: string
  os: RemoteOs
  transport: RemoteTransport
  port?: number
  insecureHttp?: boolean
  remoteWorkingDir?: string
  username?: string
  password?: string
  publicKeyPath?: string
  privateKeyPath?: string
  passphrase?: string
}

export type RunTarget =
  | { kind: 'local' }
  | { kind: 'host'; hostId: string }
  | { kind: 'device'; deviceId: string }
  | {
      kind: 'adhoc'
      save?: boolean
      name?: string
      address: string
      os: RemoteOs
      transport: RemoteTransport
      port?: number
      remoteWorkingDir?: string
    }

export type CredentialSource =
  | { kind: 'device' }
  | { kind: 'profile'; profileId: string }
  | {
      kind: 'adhoc'
      authType: RemoteAuthType
      username: string
      password?: string
      privateKeyPath?: string
      passphrase?: string
      useAgent?: boolean
    }

export type RunSourceKind = 'agentic-version' | 'editor-draft' | 'saved-instance'
export type RunMode = 'verify-path' | 'push-and-run'

export interface RunRequest {
  runId: string
  target: RunTarget
  credentialSource: CredentialSource
  sourceKind: RunSourceKind
  versionId: string
  name: string
  content?: string
  contentHash?: string
  runMode: RunMode
  remotePath?: string
  localPath?: string
  localTempPath?: string
  args?: string
  isRestmon?: boolean
  commandOverride?: string
  deviceTarget?: DeviceTargetInfo
  timeoutMs?: number
}

export type RunDecision = 'matched' | 'uploaded-after-mismatch' | 'local' | 'invoked-path'

export interface RunResult {
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
  decision: RunDecision
}

export interface RunEvent {
  runId: string
  type: 'stdout' | 'stderr' | 'status' | 'notice' | 'done' | 'error'
  data?: string
  message?: string
  result?: RunResult
}

export interface TestConnectionInput {
  target: RunTarget
  credentialSource: CredentialSource
  deviceTarget?: DeviceTargetInfo
  timeoutMs?: number
}

export interface TestConnectionResult {
  ok: boolean
  message: string
  fingerprint?: string
  hostKeyChanged?: boolean
}

export interface AuditEntry {
  at: string
  runId: string
  target: string
  versionId: string
  contentHash: string
  decision: string
  uploaded: boolean
  backupPath?: string
  exitCode?: number
  durationMs: number
}

export interface RemoteBridge {
  available: boolean
  listInventory: () => Promise<RemoteInventory>
  saveHost: (host: ExecutionHostInput) => Promise<ExecutionHost>
  deleteHost: (id: string) => Promise<void>
  saveProfile: (profile: CredentialProfileInput) => Promise<CredentialProfile>
  deleteProfile: (id: string) => Promise<void>
  setSecret: (profileId: string, secret: string) => Promise<void>
  clearSecret: (profileId: string) => Promise<void>
  testConnection: (input: TestConnectionInput) => Promise<TestConnectionResult>
  run: (request: RunRequest) => Promise<RunResult>
  cancel: (runId: string) => Promise<void>
  onOutput: (listener: (event: RunEvent) => void) => () => void
  listAudit: () => Promise<AuditEntry[]>
}
