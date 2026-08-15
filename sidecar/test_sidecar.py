#!/usr/bin/env python3
"""WatermarkLab Stage 2 - Sidecar Runtime Verification Suite."""

import subprocess, json, time, uuid, sys, os
from pathlib import Path


def start_sidecar():
    script = Path(__file__).parent / "sidecar.py"
    token = f"wl_sec_test_{uuid.uuid4().hex}"
    env = os.environ.copy()
    env["WATERMARKLAB_SESSION_TOKEN"] = token
    env["WATERMARKLAB_TEST_MODE"] = "1"
    env["PYTHONUNBUFFERED"] = "1"
    proc = subprocess.Popen(
        [sys.executable, str(script)],
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        env=env, text=True,
    )
    return proc, token


def make_request(op, payload=None, nonce=None, token=None):
    return {
        "protocol_version": 1,
        "request_id": str(uuid.uuid4()),
        "auth_token": token,
        "timestamp_ms": int(time.time() * 1000),
        "nonce": nonce or f"n_{uuid.uuid4().hex}",
        "operation": op,
        "payload": payload or {},
    }


def send_request(proc, req):
    proc.stdin.write(json.dumps(req) + "\n")
    proc.stdin.flush()
    line = proc.stdout.readline()
    if not line:
        raise RuntimeError("Sidecar pipe closed")
    return json.loads(line.strip())


def test_ipc_security(proc, send_request, make_request, rec, token):
    r = send_request(proc, make_request("ping", token=token))
    rec("ping ok", r["ok"] and r["payload"]["status"] == "pong")

    r = send_request(proc, make_request("ping", token="forged"))
    rec("unauthorized rejected", r["ok"] is False and r["error"]["code"] == "UNAUTHORIZED")

    n = f"r_{uuid.uuid4().hex}"
    r1 = send_request(proc, make_request("ping", token=token, nonce=n))
    r2 = send_request(proc, make_request("ping", token=token, nonce=n))
    rec("replay rejected", r1["ok"] and not r2["ok"] and r2["error"]["code"] == "REPLAY_DETECTED")

    req = make_request("ping", token=token)
    req["timestamp_ms"] = int(time.time() * 1000) - 60_000
    r = send_request(proc, req)
    rec("stale timestamp rejected", r["ok"] is False and r["error"]["code"] == "STALE_TIMESTAMP")

    req = make_request("ping", token=token)
    req["protocol_version"] = 2
    r = send_request(proc, req)
    rec("bad version rejected", r["ok"] is False and r["error"]["code"] == "VERSION_MISMATCH")

    r = send_request(proc, make_request("does_not_exist", token=token))
    rec("unknown op rejected", r["ok"] is False and r["error"]["code"] == "UNSUPPORTED_OPERATION")

    proc.stdin.write("NOT_JSON\n")
    proc.stdin.flush()
    r = json.loads(proc.stdout.readline().strip())
    rec("malformed json", r["ok"] is False and r["error"]["code"] == "MALFORMED_FRAME")

    big = make_request("ping", token=token, payload={"x": "A" * (520 * 1024)})
    r = send_request(proc, big)
    rec("oversized rejected", r["ok"] is False and r["error"]["code"] == "RESOURCE_LIMIT")


def test_model_runtime(proc, send_request, make_request, token, rec):
    r = send_request(proc, make_request("model_status", {"logical_id": "t"}, token=token))
    rec("model_status not loaded", r["ok"] and r["payload"]["status"] == "NOT_LOADED")

    r = send_request(proc, make_request("load_model", {"logical_id": "m", "model_path": "/no/such.gguf"}, token=token))
    rec("load missing rejected", r["ok"] is False and r["error"]["code"] == "MODEL_NOT_FOUND")

    r = send_request(proc, make_request("load_model", {"logical_id": "m"}, token=token))
    rec("load missing path rejected", r["ok"] is False)

    r = send_request(proc, make_request("unload_model", {"logical_id": "none"}, token=token))
    rec("unload not loaded", r["ok"] and r["payload"]["status"] == "NOT_LOADED")


def test_transformations(proc, send_request, make_request, token, rec):
    r = send_request(proc, make_request("paraphrase", {"text": "Hi", "model_id": "none"}, token=token))
    rec("paraphrase without model fails", r["ok"] is False)

    r = send_request(proc, make_request("translate_loop", {"text": "Hi", "model_id": "none"}, token=token))
    rec("translate without model fails", r["ok"] is False)

    r = send_request(proc, make_request("semantic_chunk", {"text": "A.\n\nB.\n\nC.", "max_chunk_tokens": 5}, token=token))
    rec("semantic chunk works", r["ok"] and r["payload"]["total_chunks"] >= 1)


def run():
    proc, token = start_sidecar()
    total = 0
    passed = 0

    def rec(name, ok):
        nonlocal total, passed
        total += 1
        if ok:
            passed += 1
            print(f"  PASS {total:02d}: {name}")
        else:
            print(f"  FAIL {total:02d}: {name}")

    print("\n--- [1] IPC Security ---")
    test_ipc_security(proc, send_request, make_request, rec, token)

    print("\n--- [2] Model Runtime ---")
    test_model_runtime(proc, send_request, make_request, token, rec)

    print("\n--- [3] Transformations ---")
    test_transformations(proc, send_request, make_request, token, rec)

    print("\n--- [4] Clean Shutdown ---")
    proc.stdin.close()
    try:
        code = proc.wait(timeout=5)
        rec("clean exit", code is not None)
    except subprocess.TimeoutExpired:
        proc.kill()
        rec("clean exit", False)

    print(f"\nRESULT: {passed}/{total} passed")
    sys.exit(0 if passed == total else 1)


if __name__ == "__main__":
    run()