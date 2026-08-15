# WatermarkLab

Privacy-first desktop application for local text transformation.

## Overview

WatermarkLab is a Tauri desktop application built around a React/TypeScript presentation layer, a Rust security and process-supervision core, and an isolated Python sidecar for local text-processing workloads.

The design is offline-first: normal runtime operation does not require cloud APIs, telemetry, or remote inference services.

## Architecture

```text
React / TypeScript UI
        |
        v
Tauri 2.x / Rust Core
  - capability enforcement
  - authenticated IPC
  - encrypted storage
  - model verification
  - process supervision
        |
        v
Python Sidecar
  - local inference
  - bounded JSON-line IPC
  - no cloud API dependency
```

## Core Capabilities

- Paraphrasing Studio with configurable transformation styles and intensity
- Translation-loop workflows with intermediate-hop visibility
- Semantic chunking with structural preservation
- Independent validation of numbers, URLs, code, identifiers, and detected entities
- Human-in-the-loop diff review and immutable revision history
- Provenance metadata for transformations and model versions
- Encrypted local persistence using authenticated encryption
- Model registry with SHA-256 verification before model loading
- Authenticated, bounded IPC between Rust and the Python sidecar
- Explicit privacy and security status reporting

## Security Model

WatermarkLab uses least-privilege boundaries between the frontend, Rust core, and Python sidecar. Security claims are documented as either enforced or partial depending on the platform mechanism that is actually available at runtime.

The project does not rely on cloud inference or a hosted AI service for normal operation.

## Development

### Prerequisites

- Node.js and npm
- Rust toolchain with Cargo
- Python 3
- Platform prerequisites required by Tauri 2.x

### Install frontend dependencies

```bash
npm install
```

### Run the frontend during development

```bash
npm run dev
```

### Test the Python sidecar

```bash
python3 sidecar/test_sidecar.py
```

### Build the frontend

```bash
npm run build
```

### Check the Rust backend

```bash
cd src-tauri
cargo check
cargo test
```

## Local Models

Production transformation features require explicitly configured local model artifacts. Models are not downloaded automatically at runtime.

Before a model is loaded, WatermarkLab verifies the actual model file against its registered SHA-256 digest.

## Documentation

- `IMPLEMENTATION_STATUS.md` — current implementation state
- `RUNTIME_VERIFICATION.md` — runtime verification results and remaining platform gaps
- `SECURITY_CLAIMS.md` — security claim reconciliation
- `THREAT_MODEL.md` — threat model and trust boundaries
- `FIXES_APPLIED.md` — recent hardening changes
