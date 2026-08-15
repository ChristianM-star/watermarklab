export type OperationType =
  | 'paraphrase'
  | 'translate_loop'
  | 'semantic_chunk'
  | 'human_edit'
  | 'ping'
  | 'verify_model'
  | 'run_security_audit'
  | 'validate_entities'
  | 'lock_vault'
  | 'unlock_vault';

export type ErrorCode =
  | 'INVALID_REQUEST'
  | 'UNAUTHORIZED'
  | 'REPLAY_DETECTED'
  | 'PAYLOAD_TOO_LARGE'
  | 'TIMEOUT'
  | 'CANCELLED'
  | 'RESOURCE_LIMIT'
  | 'MODEL_NOT_FOUND'
  | 'MODEL_HASH_MISMATCH'
  | 'MODEL_INCOMPATIBLE'
  | 'MODEL_LOAD_FAILED'
  | 'VALIDATION_FAILED'
  | 'NETWORK_BLOCKED'
  | 'FILESYSTEM_BLOCKED'
  | 'IPC_FAILURE'
  | 'STORAGE_FAILURE'
  | 'VAULT_LOCKED'
  | 'UNSUPPORTED_OPERATION';

export type DataClassification =
  | 'PUBLIC'
  | 'USER_CONTENT'
  | 'MODEL_DATA'
  | 'SECURITY_SECRET'
  | 'CREDENTIAL'
  | 'PROVENANCE_METADATA'
  | 'DIAGNOSTIC_METADATA';

export interface DataClassificationRule {
  classification: DataClassification;
  allowedLocations: string[];
  mayPersist: boolean;
  mayLog: boolean;
  mayCrossFrontendBoundary: boolean;
  mayEnterCrashDiagnostics: boolean;
  expectedLifetime: string;
}

export interface IPCRequest<T = any> {
  protocol_version: 1;
  request_id: string;
  auth_token: string;
  operation: OperationType;
  payload: T;
  timestamp_ms: number;
  timeout_ms?: number;
  nonce?: string;
}

export interface IPCSuccessResponse<T = any> {
  protocol_version: 1;
  request_id: string;
  ok: true;
  result: T;
  execution_ms: number;
}

export interface IPCErrorResponse {
  protocol_version: 1;
  request_id: string;
  ok: false;
  error: {
    code: ErrorCode;
    message: string;
    diagnostic?: string;
  };
  execution_ms: number;
}

export type IPCResponse<T = any> = IPCSuccessResponse<T> | IPCErrorResponse;

export interface IPCWireLog {
  id: string;
  timestamp: string;
  direction: 'inbound' | 'outbound';
  operation: string;
  requestId: string;
  bytes: number;
  payloadPreview: string;
  authRedacted: string;
  status: 'ok' | 'error' | 'pending';
  latencyMs?: number;
  classification?: DataClassification;
}
