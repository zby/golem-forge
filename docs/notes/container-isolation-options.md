# Container Isolation Options

**Status:** Future implementation

This document explores implementation options for OS-level container isolation.
See [../sandbox-design.md](../sandbox-design.md) for the overall security architecture and threat models.

## Goal

Run worker execution inside an isolated container where:
- Only sandbox zones are mounted (as volumes)
- Shell commands physically cannot access anything else
- Approval simplifies to: "run this command?" (not "access this file?")

```
┌─────────────────────────────────────┐
│              Host OS                │
│  ┌───────────────────────────────┐  │
│  │    Container (Docker/ns)      │  │
│  │                               │  │
│  │  /input  ← mounted ro         │  │
│  │  /output ← mounted rw         │  │
│  │  /scratch ← tmpfs             │  │
│  │                               │  │
│  │  Shell commands run here      │  │
│  │  - Can only see mounted dirs  │  │
│  │  - No network (optional)      │  │
│  │  - Resource limits            │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
```

## Option 1: Docker

```yaml
sandbox:
  backend: docker
  image: alpine:latest
  zones:
    - name: input
      mode: ro
      hostPath: ./data
    - name: output
      mode: rw
      hostPath: ./output
```

**Pros:**
- Cross-platform (Linux, Mac, Windows)
- Well-understood, mature
- Easy resource limits (CPU, memory)

**Cons:**
- Requires Docker daemon
- Startup latency (~100-500ms per container)
- Heavier weight

## Option 2: Linux Namespaces (unshare)

```yaml
sandbox:
  backend: namespace
  zones:
    - name: input
      mode: ro
      hostPath: ./data
```

**Pros:**
- No daemon required
- Fast startup
- Lighter weight

**Cons:**
- Linux only
- Requires root or user namespaces
- More complex to implement

## Option 3: WebAssembly (WASI)

```yaml
sandbox:
  backend: wasm
  runtime: wasmtime
```

**Pros:**
- True portable sandboxing
- Very fast startup
- Works in browser too

**Cons:**
- Shell commands need WASI-compiled versions
- Limited tool availability
- Different execution model

## Impact on Tool Approval

With container isolation:

| Tool | Current Approval | With Container |
|------|------------------|----------------|
| Filesystem | Zone-aware (path-based) | Simpler - OS enforces zones |
| Shell | Command whitelist | Command whitelist (for UX only) |

Shell approval becomes just: "Is this command allowed to run?"
The container ensures it can only affect mounted zones.

## Open Questions

1. How to handle commands that need network access?
2. How to share state between container invocations efficiently?
3. What base image to use? (Alpine, Debian, custom minimal?)
4. How to handle platform differences (Windows, Mac)?

## References

- Docker security: https://docs.docker.com/engine/security/
- Linux namespaces: https://man7.org/linux/man-pages/man7/namespaces.7.html
- WASI: https://wasi.dev/
- Firecracker: https://firecracker-microvm.github.io/
