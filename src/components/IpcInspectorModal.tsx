import React, { useState } from 'react';
import {
  X,
  Radio,
  ArrowUpRight,
  ArrowDownLeft,
  Trash2,
  Copy,
  Check,
  Shield,
} from 'lucide-react';
import { IPCWireLog } from '../types/ipc';
import { ipcBridge } from '../services/ipcBridge';

interface IpcInspectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  logs: IPCWireLog[];
  onClearLogs: () => void;
}

export const IpcInspectorModal: React.FC<IpcInspectorModalProps> = ({
  isOpen,
  onClose,
  logs,
  onClearLogs,
}) => {
  const [selectedLog, setSelectedLog] = useState<IPCWireLog | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleCopyLog = () => {
    if (!selectedLog) return;
    navigator.clipboard.writeText(JSON.stringify(selectedLog, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-zinc-800 flex items-center justify-between bg-zinc-950">
          <div className="flex items-center gap-2.5">
            <Radio className="w-4 h-4 text-indigo-400" />
            <div>
              <h3 className="text-sm font-semibold text-zinc-100">
                Authenticated IPC Wire Traffic Inspector
              </h3>
              <p className="text-[11px] text-zinc-400">
                Real-time monitor of Protocol v1 frames between React UI, Rust Core, and Python Sidecar
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClearLogs}
              className="p-1 text-zinc-400 hover:text-zinc-200 transition-colors"
              title="Clear traffic logs"
            >
              <Trash2 className="w-4 h-4" />
            </button>

            <button
              onClick={onClose}
              className="p-1 text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content split: Log list & Packet detail */}
        <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-zinc-800 flex-1 overflow-hidden">
          {/* Left: Packet Stream */}
          <div className="overflow-y-auto max-h-[60vh] divide-y divide-zinc-800/60 p-2">
            {logs.length === 0 ? (
              <div className="p-8 text-center text-xs text-zinc-500">No wire traffic recorded yet</div>
            ) : (
              logs.map(log => {
                const isSelected = selectedLog?.id === log.id;
                const isOutbound = log.direction === 'outbound';
                return (
                  <div
                    key={log.id}
                    onClick={() => setSelectedLog(log)}
                    className={`p-2.5 rounded-lg cursor-pointer text-xs space-y-1 transition-colors ${
                      isSelected
                        ? 'bg-zinc-800 text-zinc-100'
                        : 'hover:bg-zinc-850 text-zinc-300'
                    }`}
                  >
                    <div className="flex items-center justify-between font-mono text-[11px]">
                      <div className="flex items-center gap-1.5">
                        {isOutbound ? (
                          <ArrowUpRight className="w-3.5 h-3.5 text-indigo-400" />
                        ) : (
                          <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-400" />
                        )}
                        <span className="font-semibold uppercase text-zinc-200">
                          {log.operation}
                        </span>
                      </div>
                      <span className="text-zinc-500">{log.timestamp}</span>
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-zinc-400 font-mono">
                      <span>{log.bytes} bytes</span>
                      {log.latencyMs !== undefined && (
                        <span className="text-emerald-400 font-semibold">{log.latencyMs}ms</span>
                      )}
                      <span
                        className={`px-1 rounded uppercase ${
                          log.status === 'ok'
                            ? 'bg-emerald-950 text-emerald-300'
                            : log.status === 'error'
                            ? 'bg-rose-950 text-rose-300'
                            : 'bg-zinc-800 text-zinc-400'
                        }`}
                      >
                        {log.status}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Right: Selected Packet Inspector */}
          <div className="p-4 overflow-y-auto max-h-[60vh] space-y-3 bg-zinc-950">
            {selectedLog ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs font-semibold text-zinc-200">
                      Packet Frame Details
                    </span>
                  </div>
                  <button
                    onClick={handleCopyLog}
                    className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors"
                  >
                    {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copied ? 'Copied' : 'Copy Frame'}</span>
                  </button>
                </div>

                <div className="space-y-2 text-xs font-mono">
                  <div className="flex justify-between py-1 border-b border-zinc-850">
                    <span className="text-zinc-500">Protocol Version:</span>
                    <span className="text-zinc-200">1 (Rigid schema)</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-zinc-850">
                    <span className="text-zinc-500">Request ID:</span>
                    <span className="text-zinc-300 truncate max-w-[200px]">{selectedLog.requestId}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-zinc-850">
                    <span className="text-zinc-500">Direction:</span>
                    <span className="text-zinc-200 uppercase">{selectedLog.direction}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-zinc-850">
                    <span className="text-zinc-500">Auth Token:</span>
                    <span className="text-emerald-400">{selectedLog.authRedacted}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-zinc-850">
                    <span className="text-zinc-500">Payload Size:</span>
                    <span className="text-zinc-200">{selectedLog.bytes} bytes</span>
                  </div>
                </div>

                <div>
                  <div className="text-[11px] font-semibold text-zinc-400 mb-1">Payload Content:</div>
                  <pre className="bg-zinc-900 border border-zinc-800 p-2.5 rounded text-[11px] font-mono text-zinc-300 whitespace-pre-wrap max-h-48 overflow-y-auto">
                    {selectedLog.payloadPreview}
                  </pre>
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center text-zinc-500 p-8">
                <p className="text-xs">Select a wire packet on the left to inspect headers, JSON framing, and timestamps.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
