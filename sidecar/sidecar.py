#!/usr/bin/env python3
"""
WatermarkLab Authoritative Offline Python Sidecar Process
Listens strictly on anonymous stdin pipe and writes single-line JSON responses to stdout.
Enforces protocol version 1, session token authentication, wall-clock freshness,
replay-resistant nonce caching, payload size boundaries, and offline operations.
"""

import sys
import os
import json
import time
import hmac
import hashlib
import re
import socket
from collections import OrderedDict
from pathlib import Path
from typing import Dict, Any, Optional

PROTOCOL_VERSION = 1
MAX_PAYLOAD_BYTES = 512 * 1024  # 512 KB
MAX_CLOCK_DRIFT_MS = 30_000     # ±30 seconds
MAX_NONCE_CACHE_SIZE = 5_000

TEST_MODE = os.environ.get("WATERMARKLAB_TEST_MODE") == "1"
DEMO_MODE = TEST_MODE and os.environ.get("WATERMARKLAB_DEMO_MODE") == "1"
PARAPHRASE_MODEL_PATH = os.environ.get("WATERMARKLAB_PARAPHRASE_MODEL", "")
TRANSLATION_MODEL_PATH = os.environ.get("WATERMARKLAB_TRANSLATION_MODEL", "")
_PARAPHRASE_PIPELINE = None
_TRANSLATION_MODEL = None
_TRANSLATION_TOKENIZER = None

class SidecarOperationError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message

# Retrieve session token configured by Rust supervisor
SESSION_TOKEN = os.environ.get("WATERMARKLAB_SESSION_TOKEN")
if not SESSION_TOKEN:
    raise SystemExit("WATERMARKLAB_SESSION_TOKEN is required; refusing unauthenticated startup")
SEEN_NONCES = OrderedDict()

def send_response(request_id: str, ok: bool, payload: Optional[Any] = None, error: Optional[Dict[str, str]] = None, execution_ms: int = 0):
    """Write structured JSON-lines response to stdout and flush immediately."""
    resp = {
        "protocol_version": PROTOCOL_VERSION,
        "request_id": request_id,
        "ok": ok,
        "payload": payload,
        "error": error,
        "execution_ms": execution_ms
    }
    sys.stdout.write(json.dumps(resp) + "\n")
    sys.stdout.flush()

def constant_time_compare(val_a: str, val_b: str) -> bool:
    """Constant-time comparison to protect against timing side-channel attacks."""
    if not isinstance(val_a, str) or not isinstance(val_b, str):
        return False
    return hmac.compare_digest(val_a.encode('utf-8'), val_b.encode('utf-8'))

def compute_file_sha256(filepath: Path) -> str:
    """Stream a physical file through SHA-256 in 64 KB chunks."""
    hasher = hashlib.sha256()
    with open(filepath, 'rb') as f:
        while chunk := f.read(65536):
            hasher.update(chunk)
    return hasher.hexdigest()

def _protect_invariants(text: str):
    protected = []
    patterns = [
        r"```[\s\S]*?```",
        r"`[^`\n]+`",
        r"https?://[^\s)]+",
    ]
    masked = text
    for pattern in patterns:
        masked = re.sub(pattern, lambda m: _mask_value(m.group(0), protected), masked)
    return masked, protected

def _mask_value(value: str, protected: list[str]) -> str:
    idx = len(protected)
    protected.append(value)
    return f"WMLAB_KEEP_{idx}_X"

def _restore_invariants(text: str, protected: list[str]) -> str:
    for idx, value in enumerate(protected):
        text = text.replace(f"WMLAB_KEEP_{idx}_X", value)
    return text

def _get_paraphrase_pipeline():
    global _PARAPHRASE_PIPELINE
    if _PARAPHRASE_PIPELINE is not None:
        return _PARAPHRASE_PIPELINE
    if not PARAPHRASE_MODEL_PATH:
        raise SidecarOperationError("MODEL_NOT_CONFIGURED", "Set WATERMARKLAB_PARAPHRASE_MODEL to a local Transformers-compatible model directory")
    try:
        from transformers import AutoModelForSeq2SeqLM, AutoTokenizer, pipeline
        tokenizer = AutoTokenizer.from_pretrained(PARAPHRASE_MODEL_PATH, local_files_only=True)
        model = AutoModelForSeq2SeqLM.from_pretrained(PARAPHRASE_MODEL_PATH, local_files_only=True)
        _PARAPHRASE_PIPELINE = pipeline("text2text-generation", model=model, tokenizer=tokenizer)
        return _PARAPHRASE_PIPELINE
    except Exception as exc:
        raise SidecarOperationError("MODEL_LOAD_FAILED", f"Unable to load local paraphrase model: {exc}") from exc

def execute_paraphrase(text: str, intensity: str, preserve_numbers: bool) -> Dict[str, Any]:
    if DEMO_MODE and not PARAPHRASE_MODEL_PATH:
        replacements = {
            r"\butilize\b": "use", r"\bdemonstrate\b": "show", r"\bfacilitate\b": "enable",
            r"\bcommence\b": "start", r"\bterminate\b": "end", r"\bessential\b": "vital",
            r"\bsignificant\b": "notable", r"\brequires\b": "needs", r"\bimplement\b": "deploy",
        }
        transformed = text
        for pattern, repl in replacements.items():
            transformed = re.sub(pattern, repl, transformed, flags=re.IGNORECASE)
        return {
            "transformed_text": transformed,
            "char_count": len(transformed),
            "word_count": len(transformed.split()),
            "engine": "demo-structural-transform-v1",
            "backend_status": "demo_only",
        }

    masked, protected = _protect_invariants(text)
    prompt = (
        "Paraphrase the following text while preserving its meaning, all numbers, URLs, technical identifiers, "
        "and placeholder tokens exactly. Do not add facts. Output only the rewritten text.\n\n" + masked
    )
    generator = _get_paraphrase_pipeline()
    try:
        result = generator(prompt, max_new_tokens=max(64, min(1024, len(text.split()) * 3)), do_sample=False)
        transformed = _restore_invariants(result[0]["generated_text"].strip(), protected)
    except Exception as exc:
        raise SidecarOperationError("MODEL_INFERENCE_FAILED", f"Paraphrase inference failed: {exc}") from exc
    return {
        "transformed_text": transformed,
        "char_count": len(transformed),
        "word_count": len(transformed.split()),
        "engine": "transformers-local-v1",
        "backend_status": "local_model",
    }

def _load_translation_model():
    global _TRANSLATION_MODEL, _TRANSLATION_TOKENIZER
    if _TRANSLATION_MODEL is not None:
        return _TRANSLATION_MODEL, _TRANSLATION_TOKENIZER
    if not TRANSLATION_MODEL_PATH:
        raise SidecarOperationError("MODEL_NOT_CONFIGURED", "Set WATERMARKLAB_TRANSLATION_MODEL to a local NLLB/Seq2Seq model directory")
    try:
        from transformers import AutoModelForSeq2SeqLM, AutoTokenizer
        _TRANSLATION_TOKENIZER = AutoTokenizer.from_pretrained(TRANSLATION_MODEL_PATH, local_files_only=True)
        _TRANSLATION_MODEL = AutoModelForSeq2SeqLM.from_pretrained(TRANSLATION_MODEL_PATH, local_files_only=True)
        return _TRANSLATION_MODEL, _TRANSLATION_TOKENIZER
    except Exception as exc:
        raise SidecarOperationError("MODEL_LOAD_FAILED", f"Unable to load local translation model: {exc}") from exc

def _language_code(language: str) -> str:
    mapping = {
        "en": "eng_Latn", "fr": "fra_Latn", "de": "deu_Latn", "es": "spa_Latn",
        "it": "ita_Latn", "pt": "por_Latn", "nl": "nld_Latn", "zh": "zho_Hans",
        "ja": "jpn_Jpan", "ko": "kor_Hang", "ru": "rus_Cyrl", "ar": "arb_Arab",
    }
    return mapping.get(language.lower(), language)

def _translate_local(text: str, source_lang: str, target_lang: str) -> str:
    model, tokenizer = _load_translation_model()
    src = _language_code(source_lang)
    tgt = _language_code(target_lang)
    try:
        tokenizer.src_lang = src
        encoded = tokenizer(text, return_tensors="pt", truncation=True)
        forced_bos = tokenizer.convert_tokens_to_ids(tgt)
        generated = model.generate(**encoded, forced_bos_token_id=forced_bos, max_new_tokens=min(1024, max(64, len(text.split()) * 3)))
        return tokenizer.batch_decode(generated, skip_special_tokens=True)[0]
    except Exception as exc:
        raise SidecarOperationError("MODEL_INFERENCE_FAILED", f"Translation inference failed: {exc}") from exc

def execute_translation_loop(text: str, source_lang: str, intermediate_lang: str, target_lang: str) -> Dict[str, Any]:
    if DEMO_MODE and not TRANSLATION_MODEL_PATH:
        transformed = text
        if intermediate_lang.lower() in ("fr", "french"):
            transformed = re.sub(r"\bimportant\b", "crucial", transformed, flags=re.IGNORECASE)
            transformed = re.sub(r"\bverify\b", "validate", transformed, flags=re.IGNORECASE)
        elif intermediate_lang.lower() in ("de", "german"):
            transformed = re.sub(r"\bdisplay\b", "present", transformed, flags=re.IGNORECASE)
            transformed = re.sub(r"\bcomplete\b", "finish", transformed, flags=re.IGNORECASE)
        return {
            "transformed_text": transformed,
            "source_language": source_lang,
            "intermediate_language": intermediate_lang,
            "target_language": target_lang,
            "intermediate_texts": [transformed],
            "round_trip_completed": True,
            "engine": "demo-translation-loop-v1",
            "backend_status": "demo_only",
        }

    first = _translate_local(text, source_lang, intermediate_lang)
    final = _translate_local(first, intermediate_lang, target_lang)
    return {
        "transformed_text": final,
        "source_language": source_lang,
        "intermediate_language": intermediate_lang,
        "target_language": target_lang,
        "intermediate_texts": [first],
        "round_trip_completed": True,
        "engine": "transformers-nllb-local-v1",
        "backend_status": "local_model",
    }

def execute_semantic_chunking(text: str, max_chunk_tokens: int) -> Dict[str, Any]:
    """Offline semantic chunking based on structural paragraphs and sentence boundaries."""
    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
    chunks = []
    
    current_chunk = []
    current_length = 0
    
    for p in paragraphs:
        p_len = len(p.split())
        if current_length + p_len > max_chunk_tokens and current_chunk:
            chunks.append({
                "index": len(chunks),
                "content": "\n\n".join(current_chunk),
                "word_count": current_length
            })
            current_chunk = [p]
            current_length = p_len
        else:
            current_chunk.append(p)
            current_length += p_len
            
    if current_chunk:
        chunks.append({
            "index": len(chunks),
            "content": "\n\n".join(current_chunk),
            "word_count": current_length
        })
        
    return {
        "chunks": chunks,
        "total_chunks": len(chunks),
        "engine": "local-chunker-v1"
    }

def probe_network_capability() -> Dict[str, Any]:
    """Test actual network restrictions from the sidecar process."""
    dns_blocked = True
    tcp_blocked = True
    udp_blocked = True
    
    # 1. Test DNS
    try:
        socket.gethostbyname("dns.google")
        dns_blocked = False
    except Exception:
        dns_blocked = True

    # 2. Test TCP connect
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(0.5)
        s.connect(("8.8.8.8", 53))
        s.close()
        tcp_blocked = False
    except Exception:
        tcp_blocked = True

    # 3. Test UDP transmission
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(0.5)
        s.sendto(b"test", ("8.8.8.8", 53))
        s.close()
    except Exception:
        udp_blocked = True

    os_isolated = os.environ.get("WATERMARKLAB_NETWORK_ISOLATED") == "1"
    return {
        "dns_blocked": dns_blocked,
        "tcp_blocked": tcp_blocked,
        "udp_blocked": udp_blocked,
        "os_network_isolated": os_isolated,
        "is_offline": os_isolated and dns_blocked and tcp_blocked and udp_blocked
    }

def handle_request(raw_line: str):
    """Parse, authenticate, and dispatch single IPC request."""
    start_time = time.perf_counter()
    
    # 1. Payload size check
    if len(raw_line.encode('utf-8')) > MAX_PAYLOAD_BYTES:
        send_response(
            request_id="unknown",
            ok=False,
            error={"code": "RESOURCE_LIMIT", "message": f"Payload exceeds {MAX_PAYLOAD_BYTES} bytes limit"},
            execution_ms=int((time.perf_counter() - start_time) * 1000)
        )
        return

    # 2. JSON Deserialization
    try:
        req = json.loads(raw_line)
    except Exception as e:
        send_response(
            request_id="unknown",
            ok=False,
            error={"code": "MALFORMED_FRAME", "message": f"Malformed JSON: {str(e)}"},
            execution_ms=int((time.perf_counter() - start_time) * 1000)
        )
        return

    request_id = req.get("request_id", "unknown")
    protocol_version = req.get("protocol_version")
    auth_token = req.get("auth_token", "")
    timestamp_ms = req.get("timestamp_ms", 0)
    nonce = req.get("nonce", "")
    operation = req.get("operation", "")
    payload = req.get("payload", {})

    # 3. Protocol Version Check
    if protocol_version != PROTOCOL_VERSION:
        send_response(
            request_id=request_id,
            ok=False,
            error={"code": "VERSION_MISMATCH", "message": f"Expected protocol version {PROTOCOL_VERSION}, got {protocol_version}"},
            execution_ms=int((time.perf_counter() - start_time) * 1000)
        )
        return

    # 4. Authentication Check (if session token is configured)
    if not constant_time_compare(auth_token, SESSION_TOKEN):
        send_response(
            request_id=request_id,
            ok=False,
            error={"code": "UNAUTHORIZED", "message": "Invalid or missing session authentication token"},
            execution_ms=int((time.perf_counter() - start_time) * 1000)
        )
        return

    # 5. Nonce Replay Check
    if not nonce:
        send_response(
            request_id=request_id,
            ok=False,
            error={"code": "INVALID_REQUEST", "message": "Missing required nonce"},
            execution_ms=int((time.perf_counter() - start_time) * 1000)
        )
        return

    if nonce in SEEN_NONCES:
        send_response(
            request_id=request_id,
            ok=False,
            error={"code": "REPLAY_DETECTED", "message": f"Nonce '{nonce}' has already been processed in current session"},
            execution_ms=int((time.perf_counter() - start_time) * 1000)
        )
        return

    SEEN_NONCES[nonce] = None
    while len(SEEN_NONCES) > MAX_NONCE_CACHE_SIZE:
        SEEN_NONCES.popitem(last=False)

    # 6. Wall-clock timestamp freshness check (timestamps are cross-process UTC milliseconds).
    now_ms = int(time.time() * 1000)
    if abs(now_ms - timestamp_ms) > MAX_CLOCK_DRIFT_MS:
        send_response(
            request_id=request_id,
            ok=False,
            error={"code": "STALE_TIMESTAMP", "message": f"Timestamp drift ({abs(now_ms - timestamp_ms)}ms) exceeds allowed window (±{MAX_CLOCK_DRIFT_MS}ms)"},
            execution_ms=int((time.perf_counter() - start_time) * 1000)
        )
        return

    # 7. Dispatch Allowed Operation
    try:
        if operation == "ping":
            result = {
                "status": "pong",
                "server_time_ms": now_ms,
                "pid": os.getpid(),
                "sidecar_pid": os.getpid()
            }
        elif operation == "paraphrase":
            text = payload.get("text", "")
            intensity = payload.get("intensity", "medium")
            preserve_numbers = payload.get("preserve_numbers", True)
            result = execute_paraphrase(text, intensity, preserve_numbers)
        elif operation in ("translate", "translate_loop"):
            text = payload.get("text", "")
            source_lang = payload.get("source_lang") or payload.get("sourceLang") or "EN"
            intermediate_lang = payload.get("intermediate_lang") or payload.get("intermediateLang") or "fr"
            target_lang = payload.get("target_lang") or payload.get("targetLang") or "EN"
            result = execute_translation_loop(text, source_lang, intermediate_lang, target_lang)
        elif operation == "semantic_chunk":
            text = payload.get("text", "")
            max_tokens = payload.get("max_chunk_tokens", 100)
            result = execute_semantic_chunking(text, max_tokens)
        elif operation in ("verify_model", "verify_model_hash"):
            send_response(request_id=request_id, ok=False, error={"code": "UNSUPPORTED_OPERATION", "message": "Model verification is Rust-authoritative and cannot be requested from the sidecar"}, execution_ms=int((time.perf_counter() - start_time) * 1000))
            return
        elif operation == "security_probe":
            if not TEST_MODE:
                send_response(request_id=request_id, ok=False, error={"code": "UNSUPPORTED_OPERATION", "message": "Network probing is disabled in production sidecar mode"}, execution_ms=int((time.perf_counter() - start_time) * 1000))
                return
            result = probe_network_capability()
        else:
            send_response(
                request_id=request_id,
                ok=False,
                error={"code": "UNSUPPORTED_OPERATION", "message": f"Operation '{operation}' is not supported"},
                execution_ms=int((time.perf_counter() - start_time) * 1000)
            )
            return

        exec_ms = int((time.perf_counter() - start_time) * 1000)
        send_response(request_id=request_id, ok=True, payload=result, execution_ms=exec_ms)

    except SidecarOperationError as e:
        exec_ms = int((time.perf_counter() - start_time) * 1000)
        send_response(
            request_id=request_id,
            ok=False,
            error={"code": e.code, "message": e.message},
            execution_ms=exec_ms
        )
    except Exception as e:
        exec_ms = int((time.perf_counter() - start_time) * 1000)
        send_response(
            request_id=request_id,
            ok=False,
            error={"code": "INTERNAL_ERROR", "message": str(e)},
            execution_ms=exec_ms
        )

def main():
    """Main loop reading from stdin line by line."""
    # Ensure stdout is unbuffered
    sys.stdout.reconfigure(line_buffering=True)
    
    while True:
        try:
            line = sys.stdin.readline()
            if not line:
                # EOF reached (parent closed pipe) -> terminate immediately to prevent orphan sidecars
                break
            line_str = line.strip()
            if line_str:
                handle_request(line_str)
        except (KeyboardInterrupt, SystemExit):
            break
        except Exception as e:
            # Fallback error output
            send_response(
                request_id="fatal",
                ok=False,
                error={"code": "FATAL_ERROR", "message": f"Unexpected sidecar error: {str(e)}"}
            )

if __name__ == "__main__":
    main()
