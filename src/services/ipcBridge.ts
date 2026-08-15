import { IPCWireLog, IPCResponse, OperationType } from '../types/ipc';
import { generateUuid } from './crypto';
import { securityCore } from './securityCore';

/**
 * Frontend bridge only. The React layer never owns authentication, crypto,
 * model verification, or transformation execution. Rust is authoritative.
 */
export class IPCBridgeService {
  private protocolVersion: 1 = 1;
  private wireLogs: IPCWireLog[] = [];
  private maxWireLogs = 150;
  private listeners: Array<(logs: IPCWireLog[]) => void> = [];

  onWireTraffic(listener: (logs: IPCWireLog[]) => void): () => void {
    this.listeners.push(listener);
    listener([...this.wireLogs]);
    return () => { this.listeners = this.listeners.filter(l => l !== listener); };
  }

  private emitWireTraffic(log: IPCWireLog): void {
    this.wireLogs.unshift(log);
    if (this.wireLogs.length > this.maxWireLogs) this.wireLogs.pop();
    this.listeners.forEach(listener => listener([...this.wireLogs]));
  }

  getWireLogs(): IPCWireLog[] { return [...this.wireLogs]; }

  clearWireLogs(): void {
    this.wireLogs = [];
    this.listeners.forEach(listener => listener([]));
  }

  async send<T = any, R = any>(
    operation: OperationType,
    payload: T,
    options: { timeoutMs?: number; overrideAuth?: string; nonce?: string; timestampMs?: number; simulateTamper?: boolean } = {},
  ): Promise<IPCResponse<R>> {
    const requestId = generateUuid();
    const timeoutMs = options.timeoutMs ?? 15_000;
    const start = performance.now();
    const requestBytes = new TextEncoder().encode(JSON.stringify({ operation, payload })).length;

    this.emitWireTraffic({
      id: generateUuid(),
      timestamp: new Date().toISOString().split('T')[1].slice(0, 12),
      direction: 'outbound',
      operation,
      requestId,
      bytes: requestBytes,
      payloadPreview: this.safePreview(payload),
      authRedacted: '[RUST-AUTH]',
      status: 'pending',
    });

    if (requestBytes > 512 * 1024) {
      return this.errorResponse('RESOURCE_LIMIT', 'Request payload exceeds the 512 KB limit', requestId, operation, start);
    }

    if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) {
      return this.errorResponse('NATIVE_RUNTIME_REQUIRED', 'WatermarkLab security-sensitive operations require the native Tauri runtime', requestId, operation, start);
    }

    try {
      const invoke = (window as any).__TAURI_INTERNALS__.invoke;
      const nativeOperation = operation === 'verify_model' ? 'verify_model' : 'transform_text';
      const nativeArgs = nativeOperation === 'verify_model'
        ? payload
        : { operation, payload };

      const result = await Promise.race([
        invoke(nativeOperation, nativeArgs),
        new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), timeoutMs)),
      ]);

      const response: IPCResponse<R> = {
        protocol_version: this.protocolVersion,
        request_id: requestId,
        ok: true,
        result: result as R,
        execution_ms: Math.round(performance.now() - start),
      };
      this.logInboundResponse(requestId, operation, response, response.execution_ms);
      return response;
    } catch (err: any) {
      const code = String(err?.message || '').startsWith('TIMEOUT') ? 'TIMEOUT' : 'IPC_FAILURE';
      return this.errorResponse(code, err?.message || 'Native operation failed', requestId, operation, start);
    }
  }

  private errorResponse<R>(
    code: string,
    message: string,
    requestId: string,
    operation: string,
    start: number,
  ): IPCResponse<R> {
    const response: IPCResponse<R> = {
      protocol_version: this.protocolVersion,
      request_id: requestId,
      ok: false,
      error: { code: code as any, message },
      execution_ms: Math.round(performance.now() - start),
    };
    securityCore.logEvent('security_violation', `${operation}: ${code}`);
    this.logInboundResponse(requestId, operation, response, response.execution_ms);
    return response;
  }

  private logInboundResponse(requestId: string, operation: string, resp: IPCResponse, latencyMs: number): void {
    const byteSize = new TextEncoder().encode(JSON.stringify(resp)).length;
    const status = resp.ok ? 'ok' : 'error';
    const payloadPreview = resp.ok
      ? 'OK: Result payload received'
      : `ERR: [${'error' in resp ? resp.error.code : 'IPC_FAILURE'}] ${'error' in resp ? resp.error.message : 'IPC failure'}`;
    this.emitWireTraffic({
      id: generateUuid(),
      timestamp: new Date().toISOString().split('T')[1].slice(0, 12),
      direction: 'inbound',
      operation,
      requestId,
      bytes: byteSize,
      payloadPreview,
      authRedacted: '[RUST-AUTH]',
      status,
      latencyMs,
    });
  }

  private safePreview(payload: unknown): string {
    if (!payload) return '{}';
    if (typeof payload === 'object') {
      const keys = Object.keys(payload as object);
      return `{ ${keys.slice(0, 3).join(', ')}${keys.length > 3 ? '...' : ''} }`;
    }
    return String(payload).slice(0, 30);
  }
}

export const ipcBridge = new IPCBridgeService();
