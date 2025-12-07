# Container Isolation Options

**Status:** Research needed before implementation

This document explores implementation options for OS-level container isolation.
See [../sandbox-design.md](../sandbox-design.md) for when and why container isolation is needed.

## Context

Container isolation is needed when processing **untrusted content** (downloaded files, user-provided documents) where prompt injection attacks are possible. App-level checks remain for UX; the container provides the actual security boundary.

### Relationship to Clearance Protocol

Container isolation and clearance protocols are complementary security layers:

| Layer | What It Controls | Protects Against |
|-------|------------------|------------------|
| **Container Isolation** | OS-level access (files, network, processes) | Code escaping sandbox boundaries |
| **Clearance Protocol** | Application-level data flow (git push, file export) | Data exfiltration through legitimate channels |

A containerized worker might have network access for legitimate operations but still be constrained by clearance protocols that require user approval before data leaves. Conversely, clearance protocols alone can't prevent a compromised worker from directly accessing the network—container isolation provides that hard boundary.

See [../sandbox-design.md](../sandbox-design.md) for clearance protocol details.

## Implementation Options

### Option 1: Docker

```yaml
sandbox:
  backend: docker
  image: golem-forge/worker:alpine
```

**Approach:** Spawn a Docker container per worker execution with zone directories mounted as volumes.

**Pros:**
- Cross-platform (Linux, Mac, Windows with Docker Desktop)
- Mature, well-documented
- Built-in resource limits (CPU, memory, disk)
- Network isolation straightforward (`--network none`)

**Cons:**
- Requires Docker daemon running
- Startup latency (~100-500ms)
- Image management complexity
- Mac/Windows performance overhead (VM layer)

**Key questions:**
- Can we reuse containers across tool calls to amortize startup cost?
- What's the minimum viable base image size?

### Option 2: Linux Namespaces (unshare/bubblewrap)

```yaml
sandbox:
  backend: bubblewrap  # or 'unshare'
```

**Approach:** Use Linux namespaces directly via `unshare` or `bubblewrap` (bwrap) to create isolated environments without a container runtime.

**Pros:**
- No daemon required
- Fast startup (~10-50ms)
- Lightweight - just kernel features
- Fine-grained control

**Cons:**
- Linux only
- Requires user namespaces enabled (most distros have this)
- More complex to implement correctly
- No built-in image/package management

**Key questions:**
- Is bubblewrap available/practical on common Linux distros?
- How to handle filesystem setup (bind mounts, tmpfs)?

### Option 3: WebAssembly (WASI)

```yaml
sandbox:
  backend: wasm
  runtime: wasmtime  # or wasmer
```

**Approach:** Compile tools to WebAssembly and run in a WASI runtime with capability-based filesystem access.

**Pros:**
- True portable sandboxing (works everywhere including browser)
- Very fast startup (~1-10ms)
- Fine-grained capability control
- Same sandbox works in CLI and browser extension

**Cons:**
- Shell commands need WASI-compiled versions (busybox-wasm exists)
- Not all tools available as WASM
- Different execution model - can't just run arbitrary binaries
- Ecosystem still maturing

**Key questions:**
- What shell tools are available as WASI binaries?
- Is busybox-wasm sufficient for common use cases?

### Option 4: Firecracker microVMs

```yaml
sandbox:
  backend: firecracker
```

**Approach:** Lightweight microVMs with minimal overhead.

**Pros:**
- Strongest isolation (full VM boundary)
- Fast startup (~125ms)
- Used by AWS Lambda

**Cons:**
- Linux/KVM only
- More complex setup
- Requires /dev/kvm access
- Overkill for most use cases?

## Recommendation

**Start with Docker** - it's cross-platform, well-understood, and good enough for the security goal. Optimize later if startup latency is a problem.

**Future path:**
1. Docker (cross-platform, immediate)
2. Bubblewrap (Linux optimization if needed)
3. WASI (browser extension parity, long-term)

---

## Key Questions

### Q1: What's acceptable startup latency?

Container startup adds latency to each worker execution. Need to understand the tradeoff.

**Experiment:** Measure baseline worker execution time vs. container overhead for each option.

```bash
# Docker
time docker run --rm alpine:latest echo hello

# Bubblewrap (Linux)
time bwrap --ro-bind /usr /usr --proc /proc --dev /dev --unshare-all echo hello

# WASI
time wasmtime run hello.wasm
```

**Success criteria:** <500ms overhead acceptable for untrusted content processing.

### Q2: Can we reuse containers?

Spawning a new container per tool call is expensive. Can we keep a container running and send commands to it?

**Experiment:** Compare:
- Fresh container per tool call
- Long-running container with command pipe
- Container pool with pre-warmed instances

**Implementation sketch:**
```typescript
// Option A: Fresh container per call
async function runInContainer(cmd: string) {
  return exec(`docker run --rm ... ${cmd}`);
}

// Option B: Persistent container with exec
const containerId = await startContainer();
async function runInContainer(cmd: string) {
  return exec(`docker exec ${containerId} ${cmd}`);
}
```

### Q3: What base image to use?

Tradeoff between size, available tools, and security.

**Candidates:**
- `alpine:latest` (~5MB) - minimal, musl libc
- `debian:slim` (~25MB) - more tools, glibc
- `distroless` (~2MB) - no shell, maximum security
- Custom minimal (~10MB) - just what we need

**Experiment:** Build test workers with each base and measure:
- Image size
- Pull time
- Available tools (git, curl, common utilities)
- Compatibility issues (musl vs glibc)

### Q4: How to handle network access?

Some tools legitimately need network (git clone, curl). How to allow selectively?

**Options:**
- `--network none` by default, explicit opt-in per worker
- Allowlist specific hosts
- Network namespace with firewall rules
- Proxy all requests through host

**Experiment:** Test `--network none` with common operations:
- Does `git clone` fail gracefully?
- Can we pre-fetch content before container execution?

### Q5: How to handle secrets/credentials?

Workers may need API keys (for LLM calls, external services).

**Options:**
- Mount secrets as files (Docker secrets pattern)
- Pass as environment variables
- Proxy authenticated requests through host

**Security concern:** Untrusted content could try to exfiltrate secrets. Need isolation between "has secrets" and "processes untrusted content".

### Q6: User namespace support on target platforms?

Bubblewrap requires user namespaces. Are they enabled by default?

**Experiment:** Test on:
- Ubuntu 22.04/24.04
- Debian 12
- Fedora 39+
- Alpine (for Docker-in-Docker scenarios)

```bash
# Check if user namespaces are enabled
cat /proc/sys/kernel/unprivileged_userns_clone  # should be 1
unshare --user --map-root-user echo "works"
```

---

## Experiments TODO

1. [ ] **Latency benchmark** - Measure startup for Docker, bubblewrap, WASI
2. [ ] **Container reuse** - Test persistent container with docker exec
3. [ ] **Base image comparison** - Size, tools, compatibility
4. [ ] **Network isolation** - Test --network none with common tools
5. [ ] **User namespace check** - Verify bubblewrap works on target distros
6. [ ] **WASI tools survey** - What's available in WASI ecosystem?

## References

- Docker security: https://docs.docker.com/engine/security/
- Bubblewrap: https://github.com/containers/bubblewrap
- Linux namespaces: https://man7.org/linux/man-pages/man7/namespaces.7.html
- WASI: https://wasi.dev/
- Wasmtime: https://wasmtime.dev/
- Firecracker: https://firecracker-microvm.github.io/
- busybox-wasm: https://github.com/aspect-build/aspect-workflows/tree/main/pkg/aspect/outputs
