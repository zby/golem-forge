# UI React Fix Plan

Context: plan to address `packages/ui-react` issues (worker tree robustness, approval flow invariants, bus injection consistency, and test coverage).

**Last verified:** 2025-12-12

## Decisions (Locked)

- **Active worker semantics:** “active” means **currently running** (auto-managed from `workerUpdate` events).
- **Approvals:** `approvalRequired` events are **serialized by Core** (UI should assume at most one pending at a time; fail fast if violated).
- **Architecture:** Keep `@golem-forge/ui-react` tidy and thin; **move-to-core is a separate big-bang follow-up task** after this task lands.

## Task A — Fix ui-react (this task)

### A1) Worker tree: robustness + active semantics

Goals:
- Tree queries and removals remain correct even if worker updates arrive out of order (defensive).
- `activeWorkerId` reflects the currently running worker (or null if none).

Plan:
- Refactor the worker model to avoid relying on mutable `children` lists for correctness.
- Ensure `removeWorker` cannot strand descendants.
- Define and enforce invariants (e.g., running worker ⇒ active worker).

Acceptance:
- Out-of-order parent/child updates produce a consistent tree.
- When the active worker completes/errors, active transitions to the next running worker (or null).
- `getWorkersInTreeOrder`, `getWorkerChildren`, and recursive removal are correct under out-of-order insertion.

### A2) Approvals: enforce serialization in Core + simplify UI

Goals:
- Core guarantees at most one outstanding approval at a time.
- UI remains simple and fails fast if the invariant is violated.

Plan:
- Add a Core-level guard: throw or reject if a second approval is requested while one is pending (choose mechanism consistent with runtime error handling).
- In `ApprovalProvider`, keep a stable subscription (no re-subscribe-on-state churn) and rely on the serialization guarantee.
- Add a UI-level assertion: if an approval arrives while `pending` is non-null, throw with a helpful message.

Acceptance:
- A second concurrent approval request is detected deterministically (in Core), not silently overwritten in UI.
- ApprovalProvider subscription count stays stable across state changes.

### A3) Bus injection: unify via EventBus context

Goal:
- One source of truth for `UIEventBus` dependency to reduce API surface and prevent mismatched bus usage.

Plan:
- Update providers to read from `useEventBus()` instead of receiving `bus` props.
- Keep `UIProvider` responsible for creating the context boundary (via `EventBusProvider`).

Acceptance:
- No provider accepts a `bus` prop (except the top-level `EventBusProvider` / `UIProvider`).
- Fewer ways to wire the bus; mismatch becomes impossible.

### A4) Reduce avoidable rerenders

Goal:
- Consumers that only use `use*Actions()` don’t rerender on every provider render.

Plan:
- Memoize `actions` objects (`useMemo`) in each provider, or split state/actions contexts only if needed.

Acceptance:
- Context values are referentially stable when state hasn’t changed.

### A5) React-level tests for providers

Goal:
- Tests actually validate provider subscription/state behavior (not just the core bus API).

Plan:
- Use existing Ink UI tests (`ink-testing-library`) as the integration surface where possible.
- Add a minimal harness component that reads state via hooks and asserts updates after bus events.
- Remove/rename any tests that don’t mount React providers (to avoid false confidence).

Acceptance:
- Tests fail if provider subscriptions break or if state doesn’t update as expected.

## Task B — Big-bang “move to core” (follow-up task)

Scope:
- Move pure state logic and selectors from `@golem-forge/ui-react` into `@golem-forge/core` in one coordinated refactor.

Candidate modules:
- Approval model (`approval-state` logic)
- Worker tree model (`worker-state` logic)
- ToolResultValue summarization (currently inside message state)

Approach:
- Create core UI-model modules with the same exported surface (or improved surface if desired).
- Update `ui-react` to become thin React bindings that delegate to core reducers/selectors.
- Update CLI/Chrome consumers in the same PR (big-bang).
- Run `npm run check:arch` and relevant tests.

Acceptance:
- No duplication of UI-model logic across platform packages.
- `ui-react` has no non-React domain logic beyond wiring.

