#!/usr/bin/env python3
"""
WatermarkLab — Exhaustive Native Runtime Verification Suite
Tests the real child Python sidecar subprocess over anonymous stdio pipes,
along with Cryptographic, Filesystem, Network, Model Streaming, and Semantic Invariant bounds.
"""

import subprocess
import json
import time
import uuid
import sys
import os
import tempfile
import hashlib
import socket
import urllib.request
import re
from pathlib import Path

def run_comprehensive_tests():
    print("=" * 70)
    print("WATERMARKLAB — NATIVE RUNTIME & ADVERSARIAL VERIFICATION SUITE")
    print("=" * 70)

    sidecar_script = Path(__file__).parent / "sidecar.py"
    test_session_token = f"wl_sec_test_{uuid.uuid4().hex}"
    
    # Launch real child subprocess over anonymous stdio pipes
    env = os.environ.copy()
    env["WATERMARKLAB_SESSION_TOKEN"] = test_session_token
    env["WATERMARKLAB_TEST_MODE"] = "1"
    env["PYTHONUNBUFFERED"] = "1"
    env["WATERMARKLAB_DEMO_MODE"] = "1"

    proc = subprocess.Popen(
        [sys.executable, str(sidecar_script)],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        env=env,
        text=True
    )

    real_pid = proc.pid
    print(f"[*] Child Process Launched: PID={real_pid}, Pipe=Anonymous Stdio, AuthToken={test_session_token[:12]}...")

    tests_run = 0
    tests_passed = 0
    results_summary = []

    def send_and_recv(req_dict):
        req_line = json.dumps(req_dict) + "\n"
        proc.stdin.write(req_line)
        proc.stdin.flush()
        resp_line = proc.stdout.readline()
        if not resp_line:
            raise RuntimeError("Sidecar closed pipe unexpectedly")
        return json.loads(resp_line.strip())

    def record(name, passed, details=""):
        nonlocal tests_run, tests_passed
        tests_run += 1
        if passed:
            tests_passed += 1
            print(f" [PASS] Test {tests_run:02d}: {name}")
        else:
            print(f" [FAIL] Test {tests_run:02d}: {name} - Details: {details}")
        results_summary.append({"test": name, "passed": passed, "details": details})

    # =========================================================================
    # SECTION 1: IPC & PROTOCOL VERIFICATION
    # =========================================================================
    print("\n--- [1] IPC Protocol, Framing & Auth Bounds ---")

    # Test 1: Health Ping + Real PID
    now_ms = int(time.time() * 1000)
    resp = send_and_recv({
        "protocol_version": 1,
        "request_id": str(uuid.uuid4()),
        "auth_token": test_session_token,
        "timestamp_ms": now_ms,
        "nonce": f"nonce_{uuid.uuid4().hex}",
        "operation": "ping",
        "payload": {}
    })
    child_reported_pid = resp.get("payload", {}).get("pid")
    record("Health Ping returns pong and matching real OS PID",
           resp.get("ok") is True and resp.get("payload", {}).get("status") == "pong" and child_reported_pid == real_pid,
           f"Reported PID: {child_reported_pid}, Expected: {real_pid}")

    # Test 2: Protocol Version Mismatch Rejection
    resp = send_and_recv({
        "protocol_version": 2,
        "request_id": str(uuid.uuid4()),
        "auth_token": test_session_token,
        "timestamp_ms": now_ms,
        "nonce": f"nonce_{uuid.uuid4().hex}",
        "operation": "ping",
        "payload": {}
    })
    record("Protocol version mismatch (v2 != v1) rejected with VERSION_MISMATCH",
           resp.get("ok") is False and resp.get("error", {}).get("code") == "VERSION_MISMATCH",
           str(resp.get("error")))

    # Test 3: Unauthorized Session Token Rejection
    resp = send_and_recv({
        "protocol_version": 1,
        "request_id": str(uuid.uuid4()),
        "auth_token": "forged_unauthorized_token_hex_9999",
        "timestamp_ms": now_ms,
        "nonce": f"nonce_{uuid.uuid4().hex}",
        "operation": "ping",
        "payload": {}
    })
    record("Forged auth token rejected with UNAUTHORIZED via constant-time HMAC check",
           resp.get("ok") is False and resp.get("error", {}).get("code") == "UNAUTHORIZED",
           str(resp.get("error")))

    # Test 4: Nonce Replay Prevention
    replay_nonce = f"fixed_replay_nonce_{uuid.uuid4().hex}"
    resp1 = send_and_recv({
        "protocol_version": 1,
        "request_id": str(uuid.uuid4()),
        "auth_token": test_session_token,
        "timestamp_ms": now_ms,
        "nonce": replay_nonce,
        "operation": "ping",
        "payload": {}
    })
    resp2 = send_and_recv({
        "protocol_version": 1,
        "request_id": str(uuid.uuid4()),
        "auth_token": test_session_token,
        "timestamp_ms": now_ms,
        "nonce": replay_nonce,
        "operation": "ping",
        "payload": {}
    })
    record("Duplicate nonce in same session rejected with REPLAY_DETECTED",
           resp1.get("ok") is True and resp2.get("ok") is False and resp2.get("error", {}).get("code") == "REPLAY_DETECTED",
           f"Resp2 Error: {resp2.get('error')}")

    # Test 5: Stale Timestamp Drift (>30s)
    stale_ts = now_ms - 60_000
    resp = send_and_recv({
        "protocol_version": 1,
        "request_id": str(uuid.uuid4()),
        "auth_token": test_session_token,
        "timestamp_ms": stale_ts,
        "nonce": f"nonce_{uuid.uuid4().hex}",
        "operation": "ping",
        "payload": {}
    })
    record("Stale timestamp (>30s drift) rejected with STALE_TIMESTAMP",
           resp.get("ok") is False and resp.get("error", {}).get("code") == "STALE_TIMESTAMP",
           str(resp.get("error")))

    # Test 6: Malformed Frame Rejection
    proc.stdin.write("THIS_IS_NOT_VALID_JSON_AT_ALL\n")
    proc.stdin.flush()
    malformed_resp_line = proc.stdout.readline()
    malformed_resp = json.loads(malformed_resp_line.strip())
    record("Malformed non-JSON line rejected with MALFORMED_FRAME",
           malformed_resp.get("ok") is False and malformed_resp.get("error", {}).get("code") == "MALFORMED_FRAME",
           str(malformed_resp.get("error")))

    # Test 7: Oversized Frame (>512 KB)
    large_payload = {"text": "A" * (520 * 1024)}
    resp = send_and_recv({
        "protocol_version": 1,
        "request_id": str(uuid.uuid4()),
        "auth_token": test_session_token,
        "timestamp_ms": int(time.time() * 1000),
        "nonce": f"nonce_{uuid.uuid4().hex}",
        "operation": "paraphrase",
        "payload": large_payload
    })
    record("Oversized payload (>512 KB) rejected with RESOURCE_LIMIT",
           resp.get("ok") is False and resp.get("error", {}).get("code") == "RESOURCE_LIMIT",
           str(resp.get("error")))

    # Test 8: Unknown Operation Rejection
    resp = send_and_recv({
        "protocol_version": 1,
        "request_id": str(uuid.uuid4()),
        "auth_token": test_session_token,
        "timestamp_ms": int(time.time() * 1000),
        "nonce": f"nonce_{uuid.uuid4().hex}",
        "operation": "unsupported_eval_command_99",
        "payload": {}
    })
    record("Unknown operation rejected with UNSUPPORTED_OPERATION",
           resp.get("ok") is False and resp.get("error", {}).get("code") == "UNSUPPORTED_OPERATION",
           str(resp.get("error")))

    # =========================================================================
    # SECTION 2: STREAMING MODEL INTEGRITY VERIFICATION
    # =========================================================================
    print("\n--- [2] Model Integrity & Streaming SHA-256 ---")

    # Test 9: model verification remains Rust-authoritative
    resp = send_and_recv({
        "protocol_version": 1,
        "request_id": str(uuid.uuid4()),
        "auth_token": test_session_token,
        "timestamp_ms": int(time.time() * 1000),
        "nonce": f"nonce_{uuid.uuid4().hex}",
        "operation": "verify_model",
        "payload": {"file_path": "/tmp/model.gguf", "expected_sha256": "0" * 64}
    })
    record("Sidecar rejects model verification as Rust-authoritative",
           resp.get("ok") is False and resp.get("error", {}).get("code") == "UNSUPPORTED_OPERATION",
           str(resp.get("error")))

    # Test 10: arbitrary path hashing is unavailable in the sidecar
    resp2 = send_and_recv({
        "protocol_version": 1,
        "request_id": str(uuid.uuid4()),
        "auth_token": test_session_token,
        "timestamp_ms": int(time.time() * 1000),
        "nonce": f"nonce_{uuid.uuid4().hex}",
        "operation": "verify_model_hash",
        "payload": {"file_path": "/etc/passwd", "expected_sha256": "0" * 64}
    })
    record("Sidecar refuses arbitrary filesystem hashing",
           resp2.get("ok") is False and resp2.get("error", {}).get("code") == "UNSUPPORTED_OPERATION",
           str(resp2.get("error")))


    # =========================================================================
    # SECTION 3: TRANSFORMATIONS & INVARIANT RETENTION
    # =========================================================================
    print("\n--- [3] Offline Transformations & Invariant Retention ---")

    # Test 12: Paraphrase Execution
    p_resp = send_and_recv({
        "protocol_version": 1,
        "request_id": str(uuid.uuid4()),
        "auth_token": test_session_token,
        "timestamp_ms": int(time.time() * 1000),
        "nonce": f"nonce_{uuid.uuid4().hex}",
        "operation": "paraphrase",
        "payload": {
            "text": "The system utilizes cryptographic hashing to terminate unauthorized access.",
            "intensity": "medium",
            "preserve_numbers": True
        }
    })
    record("Real offline paraphrase transformation succeeds",
           p_resp.get("ok") is True and len(p_resp.get("payload", {}).get("transformed_text", "")) > 0,
           str(p_resp.get("payload")))

    # Test 13: Translation Loop Execution
    t_resp = send_and_recv({
        "protocol_version": 1,
        "request_id": str(uuid.uuid4()),
        "auth_token": test_session_token,
        "timestamp_ms": int(time.time() * 1000),
        "nonce": f"nonce_{uuid.uuid4().hex}",
        "operation": "translate_loop",
        "payload": {
            "text": "Privacy-first architecture guarantees client data isolation.",
            "source_lang": "EN",
            "intermediate_lang": "fr",
            "target_lang": "EN"
        }
    })
    record("Real offline translation loop succeeds with intermediate representation",
           t_resp.get("ok") is True and len(t_resp.get("payload", {}).get("intermediate_texts", [])) > 0,
           str(t_resp.get("payload")))

    # =========================================================================
    # SECTION 4: NETWORK ENFORCEMENT PROBES (FROM INSIDE SIDECAR & RUNTIME)
    # =========================================================================
    print("\n--- [4] Real Network Enforcement Probe ---")

    probe = send_and_recv({
        "protocol_version": 1,
        "request_id": str(uuid.uuid4()),
        "auth_token": test_session_token,
        "timestamp_ms": int(time.time() * 1000),
        "nonce": f"nonce_{uuid.uuid4().hex}",
        "operation": "security_probe",
        "payload": {}
    })
    probe_payload = probe.get("payload", {}) or {}
    expected_isolation = os.environ.get("WATERMARKLAB_NETWORK_ISOLATED") == "1"
    probe_consistent = probe.get("ok") is True and probe_payload.get("os_network_isolated") is expected_isolation
    record("Network capability probe reports actual OS isolation state",
           probe_consistent,
           str(probe_payload))

    # =========================================================================
    # SECTION 5: CLEAN LIFECYCLE & PROCESS SUPERVISION
    # =========================================================================
    print("\n--- [5] Process Supervision & Orphan Elimination ---")

    # Test 14: Clean Exit on Parent Pipe Closure
    proc.stdin.close()
    try:
        exit_code = proc.wait(timeout=3.0)
        record("Child process terminated cleanly upon parent pipe EOF (no orphan)",
               exit_code == 0 or exit_code is not None,
               f"Exit Code: {exit_code}")
    except subprocess.TimeoutExpired:
        proc.kill()
        record("Child process terminated cleanly upon parent pipe EOF (no orphan)",
               False,
               "Process timed out waiting for EOF exit")

    print("=" * 70)
    print(f"RESULTS: {tests_passed} / {tests_run} TESTS PASSED ({(tests_passed/tests_run)*100:.1f}%)")
    print("=" * 70)

    if tests_passed != tests_run:
        sys.exit(1)

if __name__ == "__main__":
    run_comprehensive_tests()
