# Event Index

> **Owner:** Project Lead | **Last Reviewed:** 2026-04-10 | **Status:** Living Document | **Event Schema Version:** `evt-v1.2`

## Purpose

Central registry and **event contract system** for all events emitted and consumed across modules. This document is the single source of truth for event definitions — it governs schemas, delivery guarantees, versioning, security, and observability for every event in the system.

## Scope

All application events across all modules, including domain, audit, security, system, and infrastructure events.

---

## Enforcement Rule (CRITICAL)

| Rule | Description |
|------|-------------|
| **Completeness** | No event may exist outside this index. Undocumented event = unauthorized event. |
| **Contract governance** | No module may emit or consume an undocumented event. Event contract changes require change control. |
| **Breaking changes** | Breaking event changes (payload removal, type change, semantic change) must follow versioning rules. |
| **Name reuse prohibition** | Event name reuse for different semantics is **prohibited**. |
| **Schema enforcement** | Every event must have a defined payload schema. Unschemaed events are invalid. |
| **Security** | No secrets in event payloads. PII must be minimized or masked. Sensitive events must be access-controlled. |

---

## Event Classification Model

| Classification | Description | Governance Level |
|---------------|-------------|-----------------|
| **security** | Authentication, authorization, access events | Highest — audit mandatory, retention enforced |
| **audit** | State changes requiring audit trail | High — must be logged and retained |
| **system** | Infrastructure, health, lifecycle events | High — must be observable |
| **domain** | Business logic events (user actions, profile changes) | Standard — logged |
| **infrastructure** | Platform, deployment, config events | Medium — tracked |
| **monitoring** | Metrics, health checks, telemetry | Standard — observable |

---

## Event Entry Schema

Every event in the registry must include:

| Field | Description | Required |
|-------|-------------|----------|
| `name` | Fully qualified event name (e.g., `auth.signed_in`) | Yes |
| `version` | Schema version (e.g., `v1`) | Yes |
| `classification` | From classification model above | Yes |
| `severity` | `CRITICAL`, `HIGH`, `MEDIUM`, `LOW` | Yes |
| `owner_module` | Module responsible for emitting this event | Yes |
| `consumers` | Modules that consume this event | Yes |
| `description` | What this event represents | Yes |
| `payload_schema` | Required and optional fields with types | Yes |
| `delivery_guarantee` | `at-most-once`, `at-least-once`, `exactly-once` | Yes |
| `ordering` | `strict`, `best-effort`, `none` | Yes |
| `idempotency` | Whether consumers must handle duplicates; idempotency key if applicable | Yes |
| `retry_policy` | Retry behavior on emission failure | Yes |
| `failure_handling` | Fallback, dead-letter, or alert behavior | Yes |
| `observability` | Logging, tracing, monitoring requirements | Yes |
| `related_risks` | Risk register items | If applicable |
| `related_tests` | Tests validating this event | If applicable |
| `action_tracker` | Whether event must create action tracker entry | If applicable |
| `lifecycle` | `active`, `deprecated`, `pending-removal` | Yes |

---

## Event Versioning Strategy

| Rule | Description |
|------|-------------|
| **Version format** | Events are versioned: `event_name.v1`, `event_name.v2` |
| **Non-breaking changes** | Adding optional fields = same version (backward compatible) |
| **Breaking changes** | Removing fields, changing types, or altering semantics = new version |
| **Deprecation** | Old versions must be marked `deprecated` with sunset date |
| **Parallel support** | During transition, both versions must be supported until all consumers migrate |
| **Sunset rule** | Deprecated versions removed after all consumers confirmed migrated |

---

## Delivery Guarantees

| Guarantee | When Used | Example Events |
|-----------|-----------|----------------|
| **At-least-once** | Default for all audit, security, and system events | `auth.signed_in`, `job.failed`, `health.alert_triggered` |
| **At-most-once** | Acceptable for low-severity monitoring/metrics | `audit.logged`, `job.queued` |
| **Exactly-once** | Critical state changes where duplication causes harm | `job.kill_switch_activated` |

**Rule:** All `CRITICAL` and `HIGH` severity events must be `at-least-once` minimum.

---

## Ordering and Idempotency Rules

### Ordering

| Requirement | Applies To | Description |
|------------|-----------|-------------|
| **Strict** | Auth flows, job lifecycle | Events must be processed in emission order |
| **Best-effort** | Audit, admin events | Order preserved where possible |
| **None** | Monitoring, metrics | No ordering dependency |

### Idempotency

| Rule | Description |
|------|-------------|
| **Consumer responsibility** | All consumers must handle duplicate delivery gracefully |
| **Idempotency key** | Critical events must include `event_id` (UUID) for deduplication |
| **Payload stability** | Re-delivery of same event must produce same payload |

---

## Event Failure Handling

| Scenario | Behavior |
|----------|----------|
| **Emission failure (critical)** | Retry up to 3× with exponential backoff → alert if still failing |
| **Emission failure (non-critical)** | Log warning, continue operation |
| **Consumer failure** | Retry per consumer policy → dead-letter after max retries |
| **Dead-letter** | Dead-lettered events must be visible in admin panel and generate alert |
| **Critical event loss** | Must trigger `health.alert_triggered` and action tracker entry |

---

## Event Replay / Reprocessing Governance

| Rule | Description |
|------|-------------|
| **Replayable events** | Job lifecycle events and domain state-change events must support replay from dead-letter or archive |
| **Idempotency** | Replayed events must produce the same outcome as original — consumers must be idempotent |
| **Audit** | Every replay must generate `job.replayed` event and action tracker entry with: who replayed, reason, original event timestamp |
| **Authorization** | Replay requires operator or admin role — no automated replay without explicit approval |
| **Scope control** | Replay must target specific events — bulk replay requires Lead approval |
| **Non-replayable** | Security events (`auth.*`, `rbac.*`) are **not replayable** — they are historical records only |

---

## Event Sampling Strategy

| Rule | Description |
|------|-------------|
| **Never sample** | `security`, `audit`, and `CRITICAL`/`HIGH` severity events must **never** be sampled — 100% capture required |
| **Sampling allowed** | `monitoring` and `infrastructure` classified events with `LOW` severity may be sampled under load |
| **Sample rate** | Default sample rate: 10% for eligible events; adjustable per event type |
| **Metadata preservation** | Sampled events must still contribute to aggregate counters (total emitted vs. sampled stored) |
| **Config** | Sampling rates are config-governed — changes follow Config Index rules |

---

## Event Backpressure Handling

| Scenario | Behavior |
|----------|----------|
| **System overloaded** | Non-critical events (`LOW` severity, `monitoring` class) are buffered or dropped first |
| **Critical preservation** | `security`, `audit`, and `CRITICAL` severity events are **never** dropped — they use reserved capacity |
| **Backpressure signal** | When buffer exceeds 80% capacity, emit `health.alert_triggered` with `alert_type: event_backpressure` |
| **Degradation order** | Drop order: `monitoring` → `infrastructure` → `domain` → `system` → never: `audit`/`security` |
| **Recovery** | After pressure clears, resume normal processing; log gap period for audit |

---

## Event Contract Compatibility Testing

| Rule | Description |
|------|-------------|
| **Version compatibility** | New event versions must be tested against all existing consumers before deployment |
| **Backward compatibility** | New versions adding optional fields must not break consumers expecting the previous schema |
| **Breaking change gate** | Breaking changes (field removal, type change) must: pass consumer migration tests, have all consumers updated, be approved via change control |
| **CI integration** | Event contract tests must run in CI pipeline — contract violation blocks deployment |
| **Test coverage** | Every versioned event must have a contract compatibility test |

---

## Event Dependency Visualization

| Rule | Description |
|------|-------------|
| **Event flow graph** | System must maintain a visual dependency graph showing: emitters → events → consumers → downstream effects |
| **Update requirement** | Graph must be updated when events are added, modified, or deprecated |
| **Debugging utility** | Graph must be usable for: root cause analysis, impact assessment of event changes, onboarding |
| **Format** | Maintained as Mermaid diagram or equivalent machine-readable format |
| **Review** | Graph reviewed quarterly alongside event registry review |

---

## Event Security Rules

| Rule | Description |
|------|-------------|
| **No secrets** | Event payloads must NEVER contain secrets, tokens, or credentials |
| **PII minimization** | Include only necessary PII; use user_id references over personal data |
| **Masking** | IP addresses and device info may be included but must be masked in logs |
| **Access control** | Security-classified events must be access-controlled — only authorized consumers |
| **Payload sanitization** | All event payloads must be sanitized before emission |

---

## Observability Requirements

| Requirement | Description |
|-------------|-------------|
| **Logging** | Every event emission must be logged with timestamp, event name, and correlation_id |
| **Tracing** | Events must carry `correlation_id` for end-to-end request tracing |
| **Monitoring** | Event emission rates, failure rates, and latency must be observable in dashboards |
| **Alerting** | Anomalous patterns (spike, drop-off, failure burst) must trigger alerts |
| **Metrics** | Per-event counters: emitted, consumed, failed, dead-lettered |

---

## Action Tracker Integration

Events that must automatically create action tracker entries:

| Event | Reason |
|-------|--------|
| `job.dead_lettered` | Requires operator investigation |
| `job.poison_detected` | Systematic failure requiring fix |
| `job.kill_switch_activated` | Emergency action requiring follow-up |
| `job.slo_breach` | SLO violation requiring review |
| `health.alert_triggered` | System health event requiring response |
| `health.monitoring_failed` | Monitoring blind spot requiring immediate fix |
| `admin.config_changed` | Config change requiring audit trail |
| `audit.write_failed` | Audit integrity failure requiring investigation |

---

## Risk Register Mapping

| Event Pattern | Risk | Description |
|--------------|------|-------------|
| `auth.failed_attempt` spike | RISK-001 (credential compromise) | Brute-force indicator |
| `auth.permission_denied` spike | RISK-002 (privilege escalation) | Unauthorized access attempts |
| `job.failed` / `job.dead_lettered` | RISK-007 (job failure cascade) | System reliability risk |
| `health.alert_triggered` | RISK-004 (infrastructure failure) | System health degradation |
| `api.rate_limited` spike | RISK-005 (DoS) | Potential attack |

---

## Event Lifecycle

| State | Description | Action Required |
|-------|-------------|-----------------|
| **Active** | In use, governed by this index | Standard governance |
| **Deprecated** | Scheduled for removal; consumers must migrate | Sunset date + migration path documented |
| **Pending removal** | Will be removed in next release | All consumers confirmed migrated |

---

## Testing Requirements

| Test Type | Applies To | Description |
|-----------|-----------|-------------|
| **Emission tests** | All events | Verify event is emitted with correct payload on trigger |
| **Payload validation tests** | All events | Verify payload matches schema, types, required fields |
| **Consumer tests** | All consumed events | Verify each consumer handles event correctly |
| **Idempotency tests** | Critical events | Verify duplicate delivery is handled gracefully |
| **Failure tests** | Critical events | Verify retry and dead-letter behavior |
| **Security tests** | Security-classified events | Verify no secrets/PII leakage in payloads |

**Rule:** Every `CRITICAL` or `HIGH` severity event must have emission, payload, and consumer tests.

---

## Event Flow Mapping

Key event chains showing upstream triggers and downstream effects:

| Flow | Chain | Ordering |
|------|-------|----------|
| **Login** | `auth.signed_in` → `audit.logged` → monitoring metrics | Strict |
| **Failed login** | `auth.failed_attempt` → `audit.logged` → `health.alert_triggered` (if threshold) | Strict |
| **MFA recovery** | `auth.mfa_recovered` → `audit.logged` → admin notification (security review) | Strict |
| **Session revoke** | `auth.session_revoked` → `audit.logged` → session cleanup | Strict |
| **Role change** | `rbac.role_assigned` / `rbac.role_revoked` → `audit.logged` → admin notification | Best-effort |
| **Role lifecycle** | `rbac.role_created` / `rbac.role_updated` / `rbac.role_deleted` → `audit.logged` → admin notification | Strict |
| **Permission change** | `rbac.permission_assigned` / `rbac.permission_revoked` → `audit.logged` | Best-effort |
| **Job failure** | `job.failed` → `job.retry_scheduled` → `job.dead_lettered` (if exhausted) → `health.alert_triggered` | Strict |
| **Kill switch** | `job.kill_switch_activated` → `audit.logged` → `health.alert_triggered` → admin notification | Strict |
| **Config change** | `admin.config_changed` → `audit.logged` → `health.status_changed` (if applicable) | Best-effort |
| **Audit failure** | `audit.write_failed` → `health.alert_triggered` → admin notification | Strict |
| **Monitor failure** | `health.monitoring_failed` → independent alert channel → admin notification | Strict |

---

## Event Registry

### Authentication Events

#### `auth.signed_up` — v1

| Field | Value |
|-------|-------|
| **Classification** | security |
| **Severity** | HIGH |
| **Owner module** | auth |
| **Consumers** | audit-logging, user-management |
| **Description** | New user account created |
| **Payload schema** | `{ user_id: uuid, email: string (masked), timestamp: datetime, ip_address: string, method: enum[email, oauth] }` |
| **Delivery guarantee** | at-least-once |
| **Ordering** | strict |
| **Idempotency** | event_id (UUID) |
| **Retry policy** | 3× exponential backoff |
| **Failure handling** | Alert on failure; must not be lost |
| **Observability** | Logged, traced (correlation_id), counted |
| **Related risks** | RISK-001 |
| **Related tests** | Signup emission test, payload validation test |
| **Lifecycle** | active |

#### `auth.signed_in` — v1

| Field | Value |
|-------|-------|
| **Classification** | security |
| **Severity** | MEDIUM |
| **Owner module** | auth |
| **Consumers** | audit-logging |
| **Description** | User successfully authenticated |
| **Payload schema** | `{ user_id: uuid, timestamp: datetime, ip_address: string, device: string, method: enum[password, oauth, mfa] }` |
| **Delivery guarantee** | at-least-once |
| **Ordering** | strict |
| **Idempotency** | event_id (UUID) |
| **Retry policy** | 3× exponential backoff |
| **Failure handling** | Log warning on failure |
| **Observability** | Logged, traced, counted |
| **Related tests** | Login emission test, audit consumer test |
| **Lifecycle** | active |

#### `auth.signed_out` — v1

| Field | Value |
|-------|-------|
| **Classification** | audit |
| **Severity** | LOW |
| **Owner module** | auth |
| **Consumers** | audit-logging |
| **Description** | User signed out |
| **Payload schema** | `{ user_id: uuid, timestamp: datetime, session_id: string }` |
| **Delivery guarantee** | at-most-once |
| **Ordering** | none |
| **Idempotency** | event_id |
| **Retry policy** | No retry |
| **Failure handling** | Log only |
| **Observability** | Logged |
| **Lifecycle** | active |

#### `auth.password_reset` — v1

| Field | Value |
|-------|-------|
| **Classification** | security |
| **Severity** | MEDIUM |
| **Owner module** | auth |
| **Consumers** | audit-logging |
| **Description** | Password reset requested or completed |
| **Payload schema** | `{ user_id: uuid, timestamp: datetime, ip_address: string, stage: enum[requested, completed] }` |
| **Delivery guarantee** | at-least-once |
| **Ordering** | strict |
| **Idempotency** | event_id |
| **Retry policy** | 3× exponential backoff |
| **Failure handling** | Alert on failure |
| **Observability** | Logged, traced |
| **Related risks** | RISK-001 |
| **Lifecycle** | active |

#### `auth.mfa_enrolled` — v1

| Field | Value |
|-------|-------|
| **Classification** | security |
| **Severity** | MEDIUM |
| **Owner module** | auth |
| **Consumers** | audit-logging |
| **Description** | MFA enrolled for user |
| **Payload schema** | `{ user_id: uuid, timestamp: datetime, mfa_type: enum[totp, sms] }` |
| **Delivery guarantee** | at-least-once |
| **Ordering** | best-effort |
| **Idempotency** | event_id |
| **Retry policy** | 3× exponential backoff |
| **Failure handling** | Log warning |
| **Observability** | Logged, traced |
| **Lifecycle** | active |

#### `auth.failed_attempt` — v1

| Field | Value |
|-------|-------|
| **Classification** | security |
| **Severity** | HIGH |
| **Owner module** | auth |
| **Consumers** | audit-logging, health-monitoring |
| **Description** | Failed authentication attempt |
| **Payload schema** | `{ user_id: uuid | null, timestamp: datetime, ip_address: string, reason: enum[invalid_password, account_locked, mfa_failed, unknown_user] }` |
| **Delivery guarantee** | at-least-once |
| **Ordering** | strict |
| **Idempotency** | event_id |
| **Retry policy** | 3× exponential backoff |
| **Failure handling** | Alert — must not be lost (security signal) |
| **Observability** | Logged, traced, rate-monitored, anomaly detection |
| **Related risks** | RISK-001 (credential compromise) |
| **Related tests** | Failed attempt emission, threshold alerting test |
| **Lifecycle** | active |

#### `auth.permission_denied` — v1

| Field | Value |
|-------|-------|
| **Classification** | security |
| **Severity** | HIGH |
| **Owner module** | api (handler.ts) |
| **Consumers** | audit-logging, health-monitoring |
| **Description** | Authorization denial — any PermissionDeniedError intercepted by handler |
| **Payload schema** | `{ actor_id: uuid | null, action: "auth.permission_denied", target_type: "permission", metadata: { permission_key: string, reason: enum[missing_permission, self_scope_violation, recent_auth_required], endpoint: string, correlation_id: string, actor_known: boolean } }` |
| **Delivery guarantee** | at-most-once (fire-and-forget — must not block 403 response) |
| **Ordering** | none |
| **Idempotency** | correlation_id |
| **Retry policy** | No retry — fire-and-forget |
| **Failure handling** | Console error only; 403 response always returned regardless of audit outcome |
| **Observability** | Logged, traced (correlation_id), spike detection recommended |
| **Related risks** | RISK-002 (privilege escalation), RISK-001 (credential compromise) |
| **Related tests** | Denial audit emission test, payload validation test |
| **Lifecycle** | active |

#### `auth.mfa_recovered` — v1 (GENERIC — superseded by specific events below)

| Field | Value |
|-------|-------|
| **Classification** | security |
| **Severity** | HIGH |
| **Owner module** | auth |
| **Consumers** | audit-logging, health-monitoring |
| **Description** | MFA recovered via backup method after primary MFA unavailable |
| **Payload schema** | `{ user_id: uuid, timestamp: datetime, recovery_method: enum[backup_code, admin_override, support_reset], ip_address: string }` |
| **Delivery guarantee** | at-least-once |
| **Ordering** | strict |
| **Idempotency** | event_id (UUID) |
| **Retry policy** | 3× exponential backoff |
| **Failure handling** | Alert on failure — security event must not be lost |
| **Observability** | Logged, traced, rate-monitored, anomaly detection |
| **Related risks** | RISK-001 (credential compromise) |
| **Related tests** | MFA recovery emission test, payload validation test |
| **Lifecycle** | active |

#### `auth.mfa_recovery_generated` — v1

| Field | Value |
|-------|-------|
| **Classification** | security |
| **Severity** | HIGH |
| **Owner module** | auth |
| **Consumers** | audit-logging |
| **Description** | User generated new MFA recovery codes (10 single-use codes). Previous codes deleted. |
| **Payload schema** | `{ code_count: number }` + standard audit fields (actor_id, ip_address, user_agent, correlation_id) |
| **Delivery guarantee** | at-least-once |
| **Ordering** | strict |
| **Idempotency** | event_id (UUID) |
| **Retry policy** | 3× exponential backoff |
| **Failure handling** | Alert on failure — security event must not be lost |
| **Observability** | Logged, traced |
| **Related tests** | Recovery code generation audit test |
| **Lifecycle** | active |
| **Added by** | Stage 6A (DW-008) |

#### `auth.mfa_recovery_used` — v1

| Field | Value |
|-------|-------|
| **Classification** | security |
| **Severity** | CRITICAL |
| **Owner module** | auth |
| **Consumers** | audit-logging, health-monitoring |
| **Description** | User consumed a single-use MFA recovery code to bypass MFA challenge. Code marked used and cannot be reused. |
| **Payload schema** | `{ remaining_codes: number }` + standard audit fields |
| **Delivery guarantee** | at-least-once |
| **Ordering** | strict |
| **Idempotency** | event_id (UUID) |
| **Retry policy** | 3× exponential backoff |
| **Failure handling** | Alert on failure — CRITICAL security event must not be lost |
| **Observability** | Logged, traced, rate-monitored, anomaly detection |
| **Related risks** | RISK-001 (credential compromise) |
| **Related tests** | Recovery code verification audit test |
| **Lifecycle** | active |
| **Notes** | Single-use: each code can only be verified once. When remaining_codes = 0, user should regenerate immediately. |
| **Added by** | Stage 6A (DW-008) |

#### `auth.mfa_recovery_failed` — v1

| Field | Value |
|-------|-------|
| **Classification** | security |
| **Severity** | HIGH |
| **Owner module** | auth |
| **Consumers** | audit-logging, health-monitoring |
| **Description** | User submitted an invalid recovery code. Potential brute-force attempt. |
| **Payload schema** | `{ reason: 'invalid_code' }` + standard audit fields |
| **Delivery guarantee** | at-least-once |
| **Ordering** | strict |
| **Idempotency** | event_id (UUID) |
| **Retry policy** | 3× exponential backoff |
| **Failure handling** | Alert on failure — security event must not be lost |
| **Observability** | Logged, traced, rate-monitored |
| **Related risks** | RISK-001 (credential compromise) |
| **Related tests** | Failed recovery audit test |
| **Lifecycle** | active |
| **Added by** | Stage 6A (DW-008) |

#### `auth.session_revoked` — v1

| Field | Value |
|-------|-------|
| **Classification** | security |
| **Severity** | HIGH |
| **Owner module** | auth |
| **Consumers** | audit-logging, health-monitoring |
| **Description** | User session forcibly revoked (by user, admin, or system) |
| **Payload schema** | `{ user_id: uuid, session_id: string, revoked_by: uuid, timestamp: datetime, reason: enum[user_request, admin_action, security_policy, timeout] }` |
| **Delivery guarantee** | at-least-once |
| **Ordering** | strict |
| **Idempotency** | event_id (UUID) |
| **Retry policy** | 3× exponential backoff |
| **Failure handling** | Alert on failure — session revocation is security-critical |
| **Observability** | Logged, traced |
| **Related tests** | Session revocation emission test, audit consumer test |
| **Lifecycle** | active |

#### `auth.sudo_granted` — v1

| Field | Value |
|-------|-------|
| **Classification** | security |
| **Severity** | HIGH |
| **Owner module** | auth |
| **Consumers** | audit-logging |
| **Description** | A "sudo mode" window was opened by a successful re-authentication. Subsequent sensitive actions within the window will not re-prompt. (PLAN-AUTH-SUDO-001 / DEC-029) |
| **Payload schema** | `{ actor_id: uuid, action: "auth.sudo_granted", target_type: "auth.sudo", target_id: uuid (== actor_id), metadata: { action_key: string }, ip_address: string, user_agent: string, correlation_id: string }` |
| **Delivery guarantee** | at-least-once |
| **Ordering** | strict |
| **Idempotency** | event_id (UUID) |
| **Retry policy** | none — audit-write failure must not block the action; client logs warning |
| **Failure handling** | console warning, alert if rate of failures exceeds threshold |
| **Observability** | Logged, audited |
| **Related tests** | Sudo grant emission, audit row presence with correct actor_id |
| **Lifecycle** | active |

#### `auth.sensitive_action_performed` — v1

| Field | Value |
|-------|-------|
| **Classification** | security |
| **Severity** | HIGH |
| **Owner module** | auth |
| **Consumers** | audit-logging |
| **Description** | A sudo-gated sensitive action was executed (MFA enroll, MFA toggle, password change, recovery code generation, MFA unenroll). Always emitted on protected action whether sudo was freshly granted or already active. (PLAN-AUTH-SUDO-001 / DEC-029) |
| **Payload schema** | `{ actor_id: uuid, action: "auth.sensitive_action_performed", target_type: "auth.sudo", target_id: uuid (== actor_id), metadata: { action_key: string }, ip_address: string, user_agent: string, correlation_id: string }` |
| **Delivery guarantee** | at-least-once |
| **Ordering** | strict |
| **Idempotency** | event_id (UUID) |
| **Retry policy** | none — audit-write failure must not block the action; client logs warning |
| **Failure handling** | console warning, alert if rate of failures exceeds threshold |
| **Observability** | Logged, audited |
| **Related tests** | Each protected action writes one row with correct action_key |
| **Lifecycle** | active |

### RBAC Events

#### `rbac.role_assigned` — v1

| Field | Value |
|-------|-------|
| **Classification** | security |
| **Severity** | HIGH |
| **Owner module** | rbac |
| **Consumers** | audit-logging |
| **Description** | Role assigned to user |
| **Payload schema** | `{ user_id: uuid, role_key: string, role_id: uuid, assigned_by: uuid, timestamp: datetime }` |
| **Delivery guarantee** | at-least-once |
| **Ordering** | strict |
| **Idempotency** | event_id |
| **Retry policy** | 3× exponential backoff |
| **Failure handling** | Alert on failure |
| **Observability** | Logged, traced |
| **Related risks** | RISK-002 (privilege escalation) |
| **Related tests** | Role assignment emission, audit consumer test |
| **Lifecycle** | active |

#### `rbac.role_revoked` — v1

| Field | Value |
|-------|-------|
| **Classification** | security |
| **Severity** | HIGH |
| **Owner module** | rbac |
| **Consumers** | audit-logging |
| **Description** | Role revoked from user |
| **Payload schema** | `{ user_id: uuid, role_key: string, role_id: uuid, revoked_by: uuid, timestamp: datetime, reason: string }` |
| **Delivery guarantee** | at-least-once |
| **Ordering** | strict |
| **Idempotency** | event_id |
| **Retry policy** | 3× exponential backoff |
| **Failure handling** | Alert on failure |
| **Observability** | Logged, traced |
| **Related risks** | RISK-002 |
| **Lifecycle** | active |

#### `rbac.role_created` — v1

| Field | Value |
|-------|-------|
| **Classification** | security |
| **Severity** | HIGH |
| **Owner module** | rbac |
| **Consumers** | audit-logging |
| **Description** | New dynamic role created in the RBAC system |
| **Payload schema** | `{ role_name: string, created_by: uuid, timestamp: datetime, permissions: string[] }` |
| **Delivery guarantee** | at-least-once |
| **Ordering** | strict |
| **Idempotency** | event_id |
| **Retry policy** | 3× exponential backoff |
| **Failure handling** | Alert on failure |
| **Observability** | Logged, traced |
| **Related permissions** | `roles.create` |
| **Related risks** | RISK-002 (privilege escalation via new role) |
| **Related tests** | Role creation event emission test |
| **Lifecycle** | active |

#### `rbac.role_updated` — v1

| Field | Value |
|-------|-------|
| **Classification** | security |
| **Severity** | HIGH |
| **Owner module** | rbac |
| **Consumers** | audit-logging |
| **Description** | Role name or description updated. Key is immutable and cannot be changed. |
| **Payload schema** | `{ role_key: string, changes: { name?: string, description?: string }, previous: { name?: string, description?: string }, updated_by: uuid, timestamp: datetime }` |
| **Delivery guarantee** | at-least-once |
| **Ordering** | strict |
| **Idempotency** | event_id |
| **Retry policy** | 3× exponential backoff |
| **Failure handling** | Alert on failure |
| **Observability** | Logged, traced |
| **Related permissions** | `roles.edit` |
| **Related risks** | RISK-002 |
| **Related tests** | Role update event emission test |
| **Lifecycle** | active |

#### `rbac.role_deleted` — v1

| Field | Value |
|-------|-------|
| **Classification** | security |
| **Severity** | HIGH |
| **Owner module** | rbac |
| **Consumers** | audit-logging |
| **Description** | Dynamic role deleted from the RBAC system. Base roles cannot be deleted. |
| **Payload schema** | `{ role_name: string, deleted_by: uuid, timestamp: datetime, affected_users: integer }` |
| **Delivery guarantee** | at-least-once |
| **Ordering** | strict |
| **Idempotency** | event_id |
| **Retry policy** | 3× exponential backoff |
| **Failure handling** | Alert on failure |
| **Observability** | Logged, traced |
| **Related permissions** | `roles.delete` |
| **Related risks** | RISK-002 (orphaned users after role deletion) |
| **Related tests** | Role deletion event emission test, base role protection test |
| **Lifecycle** | active |

#### `rbac.permission_denied` — v1

| Field | Value |
|-------|-------|
| **Classification** | security |
| **Severity** | MEDIUM |
| **Owner module** | rbac |
| **Consumers** | audit-logging, health-monitoring |
| **Description** | Permission check failed |
| **Payload schema** | `{ user_id: uuid, permission: string, resource: string, timestamp: datetime, ip_address: string }` |
| **Delivery guarantee** | at-least-once |
| **Ordering** | best-effort |
| **Idempotency** | event_id |
| **Retry policy** | 3× exponential backoff |
| **Failure handling** | Log warning; alert on spike |
| **Observability** | Logged, traced, rate-monitored |
| **Related risks** | RISK-002 (privilege escalation) |
| **Lifecycle** | active |

#### `rbac.permission_assigned` — v1

| Field | Value |
|-------|-------|
| **Classification** | security |
| **Severity** | HIGH |
| **Owner module** | rbac |
| **Consumers** | audit-logging |
| **Description** | Permission granted to user |
| **Payload schema** | `{ role_id: uuid, permission_key: string, permission_id: uuid, assigned_by: uuid, timestamp: datetime }` |
| **Delivery guarantee** | at-least-once |
| **Ordering** | strict |
| **Idempotency** | event_id |
| **Retry policy** | 3× exponential backoff |
| **Failure handling** | Alert on failure |
| **Observability** | Logged, traced |
| **Related risks** | RISK-002 (privilege escalation) |
| **Related tests** | Permission assignment emission, audit consumer test |
| **Lifecycle** | active |

#### `rbac.permission_revoked` — v1

| Field | Value |
|-------|-------|
| **Classification** | security |
| **Severity** | HIGH |
| **Owner module** | rbac |
| **Consumers** | audit-logging |
| **Description** | Permission revoked from user |
| **Payload schema** | `{ role_id: uuid, permission_key: string, permission_id: uuid, revoked_by: uuid, timestamp: datetime, reason: string }` |
| **Delivery guarantee** | at-least-once |
| **Ordering** | strict |
| **Idempotency** | event_id |
| **Retry policy** | 3× exponential backoff |
| **Failure handling** | Alert on failure |
| **Observability** | Logged, traced |
| **Related risks** | RISK-002 (privilege escalation) |
| **Related tests** | Permission revocation emission, audit consumer test |
| **Lifecycle** | active |

### User Management Events

#### `user.profile_updated` — v1

| Field | Value |
|-------|-------|
| **Classification** | domain |
| **Severity** | LOW |
| **Owner module** | user-management |
| **Consumers** | audit-logging |
| **Description** | User profile data changed |
| **Payload schema** | `{ user_id: uuid, timestamp: datetime, fields_changed: string[] }` |
| **Delivery guarantee** | at-most-once |
| **Ordering** | none |
| **Idempotency** | event_id |
| **Retry policy** | No retry |
| **Failure handling** | Log only |
| **Observability** | Logged |
| **Lifecycle** | active |

#### `user.account_deactivated` — v1

| Field | Value |
|-------|-------|
| **Classification** | security |
| **Severity** | MEDIUM |
| **Owner module** | user-management |
| **Consumers** | audit-logging, admin-panel |
| **Description** | User account deactivated |
| **Payload schema** | `{ user_id: uuid, timestamp: datetime, deactivated_by: uuid, reason: string }` |
| **Delivery guarantee** | at-least-once |
| **Ordering** | strict |
| **Idempotency** | event_id |
| **Retry policy** | 3× exponential backoff |
| **Failure handling** | Alert on failure |
| **Observability** | Logged, traced |
| **Lifecycle** | active |

#### `user.account_reactivated` — v1

| Field | Value |
|-------|-------|
| **Classification** | security |
| **Severity** | MEDIUM |
| **Owner module** | user-management |
| **Consumers** | audit-logging, admin-panel |
| **Description** | User account reactivated |
| **Payload schema** | `{ user_id: uuid, timestamp: datetime, reactivated_by: uuid, reason: string }` |
| **Delivery guarantee** | at-least-once |
| **Ordering** | strict |
| **Idempotency** | event_id |
| **Retry policy** | 3× exponential backoff |
| **Failure handling** | Alert on failure |
| **Observability** | Logged, traced |
| **Lifecycle** | active |

#### `user.deactivation_rolled_back` — v1

| Field | Value |
|-------|-------|
| **Classification** | security |
| **Severity** | MEDIUM |
| **Owner module** | user-management |
| **Consumers** | audit-logging, admin-panel |
| **Description** | User deactivation rolled back after downstream failure (e.g., session revocation failed) |
| **Payload schema** | `{ user_id: uuid, timestamp: datetime, reason: string, rollback_success: boolean, original_reason: string }` |
| **Delivery guarantee** | at-least-once |
| **Ordering** | strict |
| **Idempotency** | event_id |
| **Retry policy** | 3× exponential backoff |
| **Failure handling** | Alert on failure — rollback events are safety-critical |
| **Observability** | Logged, traced |
| **Related risks** | RISK-004 (infrastructure failure) |
| **Lifecycle** | active |

#### `user.sessions_revoked` — v1

| Field | Value |
|-------|-------|
| **Classification** | security |
| **Severity** | HIGH |
| **Owner module** | auth |
| **Consumers** | audit-logging, user-panel |
| **Description** | User revoked their own sessions (other sessions or all sessions including current) |
| **Payload schema** | `{ scope: 'others' \| 'global' }` |
| **Delivery guarantee** | at-least-once |
| **Ordering** | strict |
| **Idempotency** | event_id |
| **Retry policy** | 3× exponential backoff |
| **Failure handling** | Alert on failure |
| **Observability** | Logged, traced |
| **Lifecycle** | active |
| **Added by** | Stage 5F (DW-019) |

### Admin Events

#### `admin.config_changed` — v1

| Field | Value |
|-------|-------|
| **Classification** | audit |
| **Severity** | HIGH |
| **Owner module** | admin-panel |
| **Consumers** | audit-logging, health-monitoring |
| **Description** | System configuration changed via admin panel |
| **Payload schema** | `{ config_name: string, before_value: string, after_value: string, changed_by: uuid, timestamp: datetime, change_id: string }` |
| **Delivery guarantee** | at-least-once |
| **Ordering** | strict |
| **Idempotency** | event_id |
| **Retry policy** | 3× exponential backoff |
| **Failure handling** | Alert — config changes must be audited |
| **Observability** | Logged, traced |
| **Action tracker** | Yes — creates entry |
| **Lifecycle** | active |

#### `admin.user_action` — v1

| Field | Value |
|-------|-------|
| **Classification** | audit |
| **Severity** | MEDIUM |
| **Owner module** | admin-panel |
| **Consumers** | audit-logging |
| **Description** | Admin performed action on user account |
| **Payload schema** | `{ admin_id: uuid, target_user_id: uuid, action: string, timestamp: datetime, details: string }` |
| **Delivery guarantee** | at-least-once |
| **Ordering** | best-effort |
| **Idempotency** | event_id |
| **Retry policy** | 3× exponential backoff |
| **Failure handling** | Log warning |
| **Observability** | Logged, traced |
| **Lifecycle** | active |

### User Panel Events

#### `user_panel.settings_changed` — v1

| Field | Value |
|-------|-------|
| **Classification** | domain |
| **Severity** | LOW |
| **Owner module** | user-panel |
| **Consumers** | audit-logging |
| **Description** | User changed their settings |
| **Payload schema** | `{ user_id: uuid, timestamp: datetime, settings_changed: string[] }` |
| **Delivery guarantee** | at-most-once |
| **Ordering** | none |
| **Idempotency** | event_id |
| **Retry policy** | No retry |
| **Failure handling** | Log only |
| **Observability** | Logged |
| **Lifecycle** | active |

> **Note:** Session revocation events are emitted as `auth.session_revoked` (auth module owns session lifecycle). User panel triggers the action but does not own the event.

#### `user_panel.mfa_updated` — v1

| Field | Value |
|-------|-------|
| **Classification** | security |
| **Severity** | MEDIUM |
| **Owner module** | user-panel |
| **Consumers** | audit-logging |
| **Description** | User changed their own MFA settings (enable, disable, reconfigure) |
| **Payload schema** | `{ user_id: uuid, timestamp: datetime, action: enum[enabled, disabled, reconfigured], mfa_type: enum[totp, sms] }` |
| **Delivery guarantee** | at-least-once |
| **Ordering** | strict |
| **Idempotency** | event_id |
| **Retry policy** | 3× exponential backoff |
| **Failure handling** | Alert on failure — MFA changes are security-relevant |
| **Observability** | Logged, traced |
| **Related risks** | RISK-001 (credential compromise — MFA downgrade) |
| **Related tests** | MFA update emission test, payload validation test |
| **Lifecycle** | active |

#### `user.mfa_self_pref_changed` — v1

| Field | Value |
|-------|-------|
| **Classification** | security |
| **Severity** | LOW |
| **Owner module** | auth |
| **Consumers** | audit-logging |
| **Description** | User toggled their own `profiles.require_mfa_for_self` preference (force-MFA-on-own-pages opt-in/out). Emitted by `update-mfa-self-pref` only when the value actually changes. |
| **Payload schema** | `{ user_id: uuid, timestamp: datetime, before: boolean, after: boolean }` |
| **Delivery guarantee** | at-least-once |
| **Ordering** | none |
| **Idempotency** | event_id |
| **Retry policy** | No retry (single audit row) |
| **Failure handling** | Log only — preference write succeeds independently |
| **Observability** | Logged |
| **Related risks** | RISK-001 (credential compromise — MFA downgrade) |
| **Related routes** | `PATCH /update-mfa-self-pref`, `/settings/security` |
| **Related functions** | `update-mfa-self-pref` |
| **Related tests** | RW-016 (`src/test/rw016-mfa-policy-enforcement.test.ts`) |
| **Lifecycle** | active |
| **Added by** | PLAN-AUTH-MFA-POLICY-001 (DEC-028) |

#### `system.mfa_policy_changed` — v1

| Field | Value |
|-------|-------|
| **Classification** | security |
| **Severity** | HIGH |
| **Owner module** | auth |
| **Consumers** | audit-logging, monitoring (future alert) |
| **Description** | Superadmin updated `system_config.mfa_enforcement_policy` (per-panel MFA enrollment gate). Emitted by `update-mfa-policy` for every successful write. Weakening any panel from `required` to `optional` is a security-relevant action and must be reviewed. |
| **Payload schema** | `{ actor_id: uuid, timestamp: datetime, before: { version, panels }, after: { version, panels }, fields_changed: string[] }` |
| **Delivery guarantee** | at-least-once |
| **Ordering** | strict |
| **Idempotency** | event_id |
| **Retry policy** | No retry (single audit row) |
| **Failure handling** | Alert on failure — policy changes must be auditable |
| **Observability** | Logged, traced |
| **Related risks** | RISK-001 (credential compromise — MFA downgrade) |
| **Related routes** | `PATCH /update-mfa-policy`, `/admin/security` |
| **Related functions** | `update-mfa-policy` |
| **Related permissions** | `admin.config` (+ `is_superadmin`) |
| **Related tests** | RW-016 (`src/test/rw016-mfa-policy-enforcement.test.ts`) |
| **Lifecycle** | active |
| **Added by** | PLAN-AUTH-MFA-POLICY-001 (DEC-028) |

### Audit Events

#### `audit.logged` — v1

| Field | Value |
|-------|-------|
| **Classification** | infrastructure |
| **Severity** | LOW |
| **Owner module** | audit-logging |
| **Consumers** | health-monitoring |
| **Description** | Audit entry recorded (meta-event) |
| **Payload schema** | `{ audit_id: uuid, source_event: string, timestamp: datetime }` |
| **Delivery guarantee** | at-most-once |
| **Ordering** | none |
| **Idempotency** | audit_id |
| **Retry policy** | No retry |
| **Failure handling** | Log only |
| **Observability** | Counted (metrics) |
| **Lifecycle** | active |

#### `audit.write_failed` — v1

| Field | Value |
|-------|-------|
| **Classification** | system |
| **Severity** | HIGH |
| **Owner module** | audit-logging |
| **Consumers** | health-monitoring, admin-panel |
| **Description** | Audit log write operation failed — critical integrity risk |
| **Payload schema** | `{ source_event: string, timestamp: datetime, error: string, retry_count: integer, correlation_id: string }` |
| **Delivery guarantee** | at-least-once |
| **Ordering** | strict |
| **Idempotency** | event_id |
| **Retry policy** | 3× exponential backoff |
| **Failure handling** | Must not be lost — multi-channel alert; fallback to secondary log store |
| **Observability** | Logged, traced, alerted |
| **Action tracker** | Yes — creates entry (audit integrity failure) |
| **Related risks** | RISK-004 (infrastructure failure) |
| **Related tests** | Audit write failure emission, fallback store test |
| **Lifecycle** | active |

#### `audit.exported` — v1

| Field | Value |
|-------|-------|
| **Classification** | audit |
| **Severity** | MEDIUM |
| **Owner module** | audit-logging |
| **Consumers** | audit-logging (self-audit), admin-panel |
| **Description** | Audit logs exported by authorized user — records who exported what filters |
| **Payload schema** | `{ actor_id: uuid, timestamp: datetime, filters: { action?: string, actor_id?: string, target_type?: string, date_from?: string, date_to?: string }, max_rows: integer }` |
| **Delivery guarantee** | at-least-once |
| **Ordering** | best-effort |
| **Idempotency** | event_id |
| **Retry policy** | 3× exponential backoff |
| **Failure handling** | Log warning — export itself succeeds regardless |
| **Observability** | Logged, traced |
| **Lifecycle** | active |

### Health Monitoring Events

#### `health.alert_triggered` — v1

| Field | Value |
|-------|-------|
| **Classification** | system |
| **Severity** | CRITICAL |
| **Owner module** | health-monitoring |
| **Consumers** | admin notification |
| **Description** | Health alert threshold breached |
| **Payload schema** | `{ alert_type: string, metric: string, threshold: number, actual_value: number, timestamp: datetime, severity: enum[warning, critical] }` |
| **Delivery guarantee** | at-least-once |
| **Ordering** | strict |
| **Idempotency** | event_id |
| **Retry policy** | 3× exponential backoff |
| **Failure handling** | Must not be lost — fallback to secondary notification channel |
| **Observability** | Logged, traced, alerted |
| **Action tracker** | Yes — creates entry |
| **Related risks** | RISK-004 (infrastructure failure) |
| **Lifecycle** | active |

#### `health.status_changed` — v1

| Field | Value |
|-------|-------|
| **Classification** | system |
| **Severity** | MEDIUM |
| **Owner module** | health-monitoring |
| **Consumers** | audit-logging |
| **Description** | System health status changed |
| **Payload schema** | `{ component: string, previous_status: enum[healthy, degraded, unhealthy], new_status: enum[healthy, degraded, unhealthy], timestamp: datetime }` |
| **Delivery guarantee** | at-least-once |
| **Ordering** | strict |
| **Idempotency** | event_id |
| **Retry policy** | 3× exponential backoff |
| **Failure handling** | Alert on failure |
| **Observability** | Logged, traced |
| **Lifecycle** | active |

#### `health.monitoring_failed` — v1

| Field | Value |
|-------|-------|
| **Classification** | system |
| **Severity** | HIGH |
| **Owner module** | health-monitoring |
| **Consumers** | admin-panel |
| **Description** | Health monitoring system itself failed — creates observability blind spot |
| **Payload schema** | `{ component: string, timestamp: datetime, error: string, last_successful_check: datetime, affected_monitors: string[] }` |
| **Delivery guarantee** | at-least-once |
| **Ordering** | strict |
| **Idempotency** | event_id |
| **Retry policy** | 3× exponential backoff + fallback notification |
| **Failure handling** | Must not be lost — multi-channel alert (monitoring the monitor) |
| **Observability** | Logged, alerted via independent channel |
| **Action tracker** | Yes — creates entry (monitoring blind spot) |
| **Related risks** | RISK-004 (infrastructure failure) |
| **Related tests** | Monitor failure emission, independent alert channel test |
| **Lifecycle** | active |

#### `health.alert_config_created` — v1

| Field | Value |
|-------|-------|
| **Classification** | audit |
| **Severity** | LOW |
| **Owner module** | health-monitoring |
| **Consumers** | audit-logging |
| **Description** | Alert configuration created |
| **Payload schema** | `{ actor_id: uuid, config: { metric_key: string, severity: enum, threshold_value: number, comparison: enum }, target_id: uuid }` |
| **Delivery guarantee** | at-least-once |
| **Ordering** | best-effort |
| **Idempotency** | event_id |
| **Retry policy** | 3× exponential backoff |
| **Failure handling** | Fail-closed — creation rolled back if audit write fails |
| **Observability** | Logged |
| **Lifecycle** | active |

#### `health.alert_config_updated` — v1

| Field | Value |
|-------|-------|
| **Classification** | audit |
| **Severity** | LOW |
| **Owner module** | health-monitoring |
| **Consumers** | audit-logging |
| **Description** | Alert configuration updated |
| **Payload schema** | `{ actor_id: uuid, updates: Record<string, unknown>, target_id: uuid }` |
| **Delivery guarantee** | at-least-once |
| **Ordering** | best-effort |
| **Idempotency** | event_id |
| **Retry policy** | 3× exponential backoff |
| **Failure handling** | Fail-closed — update aborted if audit write fails |
| **Observability** | Logged |
| **Lifecycle** | active |

### API Events

#### `api.error` — v1

| Field | Value |
|-------|-------|
| **Classification** | system |
| **Severity** | MEDIUM |
| **Owner module** | api |
| **Consumers** | health-monitoring |
| **Description** | API error occurred |
| **Payload schema** | `{ route: string, method: string, status_code: integer, error_type: string, timestamp: datetime, correlation_id: string }` |
| **Delivery guarantee** | at-least-once |
| **Ordering** | best-effort |
| **Idempotency** | event_id |
| **Retry policy** | 3× exponential backoff |
| **Failure handling** | Log warning |
| **Observability** | Logged, traced, rate-monitored |
| **Lifecycle** | active |

#### `api.rate_limited` — v1

| Field | Value |
|-------|-------|
| **Classification** | security |
| **Severity** | LOW |
| **Owner module** | api |
| **Consumers** | audit-logging |
| **Description** | Request rate-limited |
| **Payload schema** | `{ ip_address: string, route: string, timestamp: datetime, limit: integer, window: string }` |
| **Delivery guarantee** | at-most-once |
| **Ordering** | none |
| **Idempotency** | event_id |
| **Retry policy** | No retry |
| **Failure handling** | Log only |
| **Observability** | Logged, rate-monitored |
| **Related risks** | RISK-005 (DoS) |
| **Lifecycle** | active |

### Job Events

#### `job.started` — v1

| Field | Value |
|-------|-------|
| **Classification** | system |
| **Severity** | LOW |
| **Owner module** | jobs-and-scheduler |
| **Consumers** | audit-logging |
| **Description** | Job execution started |
| **Payload schema** | `{ job_id: uuid, job_type: string, timestamp: datetime, attempt: integer }` |
| **Delivery guarantee** | at-most-once |
| **Ordering** | strict |
| **Idempotency** | job_id + attempt |
| **Retry policy** | No retry |
| **Failure handling** | Log only |
| **Observability** | Logged, traced |
| **Lifecycle** | active |

#### `job.completed` — v1

| Field | Value |
|-------|-------|
| **Classification** | system |
| **Severity** | LOW |
| **Owner module** | jobs-and-scheduler |
| **Consumers** | audit-logging |
| **Description** | Job completed successfully |
| **Payload schema** | `{ job_id: uuid, job_type: string, timestamp: datetime, duration_ms: integer, attempt: integer }` |
| **Delivery guarantee** | at-most-once |
| **Ordering** | strict |
| **Idempotency** | job_id + attempt |
| **Retry policy** | No retry |
| **Failure handling** | Log only |
| **Observability** | Logged, traced, duration-monitored |
| **Lifecycle** | active |

#### `job.failed` — v1

| Field | Value |
|-------|-------|
| **Classification** | system |
| **Severity** | HIGH |
| **Owner module** | jobs-and-scheduler |
| **Consumers** | audit-logging, health-monitoring |
| **Description** | Job execution failed |
| **Payload schema** | `{ job_id: uuid, job_type: string, timestamp: datetime, attempt: integer, error: string, will_retry: boolean }` |
| **Delivery guarantee** | at-least-once |
| **Ordering** | strict |
| **Idempotency** | event_id |
| **Retry policy** | 3× exponential backoff |
| **Failure handling** | Alert; escalate if repeated |
| **Observability** | Logged, traced, alerted |
| **Related risks** | RISK-007 (job failure cascade) |
| **Lifecycle** | active |

#### `job.queued` — v1

| Field | Value |
|-------|-------|
| **Classification** | monitoring |
| **Severity** | LOW |
| **Owner module** | jobs-and-scheduler |
| **Consumers** | health-monitoring |
| **Description** | Job added to queue |
| **Payload schema** | `{ job_id: uuid, job_type: string, timestamp: datetime, priority: integer }` |
| **Delivery guarantee** | at-most-once |
| **Ordering** | none |
| **Idempotency** | job_id |
| **Retry policy** | No retry |
| **Failure handling** | Log only |
| **Observability** | Counted (queue depth metric) |
| **Lifecycle** | active |

#### `job.retry_scheduled` — v1

| Field | Value |
|-------|-------|
| **Classification** | system |
| **Severity** | MEDIUM |
| **Owner module** | jobs-and-scheduler |
| **Consumers** | audit-logging, health-monitoring |
| **Description** | Job retry scheduled after failure |
| **Payload schema** | `{ job_id: uuid, job_type: string, timestamp: datetime, attempt: integer, next_retry_at: datetime, backoff_seconds: integer }` |
| **Delivery guarantee** | at-least-once |
| **Ordering** | strict |
| **Idempotency** | event_id |
| **Retry policy** | 3× exponential backoff |
| **Failure handling** | Log warning |
| **Observability** | Logged, traced |
| **Lifecycle** | active |

#### `job.dead_lettered` — v1

| Field | Value |
|-------|-------|
| **Classification** | system |
| **Severity** | CRITICAL |
| **Owner module** | jobs-and-scheduler |
| **Consumers** | audit-logging, health-monitoring, admin-panel |
| **Description** | Job moved to dead-letter queue after exhausting retries |
| **Payload schema** | `{ job_id: uuid, job_type: string, timestamp: datetime, total_attempts: integer, last_error: string, original_payload: object }` |
| **Delivery guarantee** | at-least-once |
| **Ordering** | strict |
| **Idempotency** | event_id |
| **Retry policy** | 3× exponential backoff |
| **Failure handling** | Must not be lost — alert + action tracker entry |
| **Observability** | Logged, traced, alerted |
| **Action tracker** | Yes — creates entry |
| **Related risks** | RISK-007 |
| **Lifecycle** | active |

#### `job.paused` — v1

| Field | Value |
|-------|-------|
| **Classification** | system |
| **Severity** | MEDIUM |
| **Owner module** | jobs-and-scheduler |
| **Consumers** | audit-logging |
| **Description** | Job execution paused |
| **Payload schema** | `{ job_id: uuid, job_type: string, timestamp: datetime, paused_by: uuid, reason: string }` |
| **Delivery guarantee** | at-least-once |
| **Ordering** | strict |
| **Idempotency** | event_id |
| **Retry policy** | 3× exponential backoff |
| **Failure handling** | Log warning |
| **Observability** | Logged, traced |
| **Lifecycle** | active |

#### `job.cancelled` — v1

| Field | Value |
|-------|-------|
| **Classification** | system |
| **Severity** | MEDIUM |
| **Owner module** | jobs-and-scheduler |
| **Consumers** | audit-logging |
| **Description** | Job execution cancelled |
| **Payload schema** | `{ job_id: uuid, job_type: string, timestamp: datetime, cancelled_by: uuid, reason: string }` |
| **Delivery guarantee** | at-least-once |
| **Ordering** | strict |
| **Idempotency** | event_id |
| **Retry policy** | 3× exponential backoff |
| **Failure handling** | Log warning |
| **Observability** | Logged, traced |
| **Lifecycle** | active |

#### `job.poison_detected` — v1

| Field | Value |
|-------|-------|
| **Classification** | system |
| **Severity** | CRITICAL |
| **Owner module** | jobs-and-scheduler |
| **Consumers** | audit-logging, health-monitoring, admin-panel |
| **Description** | Poison message detected — systematic failure pattern |
| **Payload schema** | `{ job_id: uuid, job_type: string, timestamp: datetime, failure_count: integer, pattern: string, quarantined: boolean }` |
| **Delivery guarantee** | at-least-once |
| **Ordering** | strict |
| **Idempotency** | event_id |
| **Retry policy** | 3× exponential backoff |
| **Failure handling** | Must not be lost — alert + action tracker entry |
| **Observability** | Logged, traced, alerted |
| **Action tracker** | Yes — creates entry |
| **Related risks** | RISK-007 |
| **Lifecycle** | active |

#### `job.replayed` — v1

| Field | Value |
|-------|-------|
| **Classification** | system |
| **Severity** | MEDIUM |
| **Owner module** | jobs-and-scheduler |
| **Consumers** | audit-logging |
| **Description** | Job replayed from dead-letter queue |
| **Payload schema** | `{ job_id: uuid, job_type: string, timestamp: datetime, replayed_by: uuid, original_dead_letter_at: datetime }` |
| **Delivery guarantee** | at-least-once |
| **Ordering** | strict |
| **Idempotency** | event_id |
| **Retry policy** | 3× exponential backoff |
| **Failure handling** | Log warning |
| **Observability** | Logged, traced |
| **Lifecycle** | active |

#### `job.slo_breach` — v1

| Field | Value |
|-------|-------|
| **Classification** | system |
| **Severity** | HIGH |
| **Owner module** | jobs-and-scheduler |
| **Consumers** | health-monitoring, admin-panel |
| **Description** | Job SLO target breached |
| **Payload schema** | `{ job_id: uuid, job_type: string, timestamp: datetime, slo_target_ms: integer, actual_ms: integer, breach_ratio: float }` |
| **Delivery guarantee** | at-least-once |
| **Ordering** | best-effort |
| **Idempotency** | event_id |
| **Retry policy** | 3× exponential backoff |
| **Failure handling** | Alert |
| **Observability** | Logged, traced, alerted |
| **Action tracker** | Yes — creates entry |
| **Related risks** | RISK-007 |
| **Lifecycle** | active |

#### `job.kill_switch_activated` — v1

| Field | Value |
|-------|-------|
| **Classification** | system |
| **Severity** | CRITICAL |
| **Owner module** | jobs-and-scheduler |
| **Consumers** | audit-logging, health-monitoring, admin-panel |
| **Description** | Emergency kill switch activated — all jobs halted |
| **Payload schema** | `{ timestamp: datetime, activated_by: uuid, reason: string, scope: enum[all, job_type, specific_job], affected_jobs: string[] }` |
| **Delivery guarantee** | exactly-once |
| **Ordering** | strict |
| **Idempotency** | event_id |
| **Retry policy** | 3× exponential backoff + fallback notification |
| **Failure handling** | Must not be lost — multi-channel alert |
| **Observability** | Logged, traced, alerted, dashboard-visible |
| **Action tracker** | Yes — creates entry |
| **Related risks** | RISK-007 |
| **Lifecycle** | active |

#### `job.schedule_missed` — v1

| Field | Value |
|-------|-------|
| **Classification** | system |
| **Severity** | MEDIUM |
| **Owner module** | jobs-and-scheduler |
| **Consumers** | health-monitoring |
| **Description** | Scheduled job missed its execution window |
| **Payload schema** | `{ job_type: string, scheduled_at: datetime, detected_at: datetime, delay_seconds: integer }` |
| **Delivery guarantee** | at-least-once |
| **Ordering** | best-effort |
| **Idempotency** | event_id |
| **Retry policy** | 3× exponential backoff |
| **Failure handling** | Alert |
| **Observability** | Logged, alerted |
| **Lifecycle** | active |

#### `job.resource_budget_exceeded` — v1

| Field | Value |
|-------|-------|
| **Classification** | system |
| **Severity** | MEDIUM |
| **Owner module** | jobs-and-scheduler |
| **Consumers** | health-monitoring |
| **Description** | Job exceeded allocated resource budget |
| **Payload schema** | `{ job_id: uuid, job_type: string, timestamp: datetime, resource: enum[cpu, memory, time], budget: number, actual: number }` |
| **Delivery guarantee** | at-least-once |
| **Ordering** | best-effort |
| **Idempotency** | event_id |
| **Retry policy** | 3× exponential backoff |
| **Failure handling** | Log warning |
| **Observability** | Logged, monitored |
| **Lifecycle** | active |

#### `job.circuit_breaker_tripped` — v1

| Field | Value |
|-------|-------|
| **Classification** | system |
| **Severity** | HIGH |
| **Owner module** | jobs-and-scheduler |
| **Consumers** | health-monitoring, admin-panel |
| **Description** | Circuit breaker auto-paused a job after repeated dependency failures |
| **Payload schema** | `{ jobId: string, threshold: integer, reason: string }` |
| **Delivery guarantee** | at-least-once |
| **Ordering** | best-effort |
| **Idempotency** | event_id |
| **Retry policy** | 3× exponential backoff |
| **Failure handling** | Alert |
| **Observability** | Logged, traced, alerted |
| **Lifecycle** | active |


#### `job.resumed` — v1

| Field | Value |
|-------|-------|
| **Classification** | system |
| **Severity** | MEDIUM |
| **Owner module** | jobs-and-scheduler |
| **Consumers** | audit-logging, admin-panel |
| **Description** | Job manually resumed by operator |
| **Payload schema** | `{ job_id?: string, class?: string, reason: string, resumed_jobs: string[] }` |
| **Delivery guarantee** | at-least-once |
| **Ordering** | best-effort |
| **Idempotency** | event_id |
| **Lifecycle** | active |


#### `job.kill_switch_deactivated` — v1

| Field | Value |
|-------|-------|
| **Classification** | system |
| **Severity** | HIGH |
| **Owner module** | jobs-and-scheduler |
| **Consumers** | audit-logging, health-monitoring, admin-panel |
| **Description** | Kill switch deactivated — jobs resuming |
| **Payload schema** | `{ scope: string, class?: string, reason: string, deactivated_by: uuid }` |
| **Delivery guarantee** | exactly-once |
| **Ordering** | strict |
| **Idempotency** | event_id |
| **Lifecycle** | active |

### User Onboarding Events (PLAN-INVITE-001)

#### `user.invited` — v1

| Field | Value |
|-------|-------|
| **Classification** | audit |
| **Severity** | MEDIUM |
| **Owner module** | user-onboarding |
| **Consumers** | audit-logging |
| **Description** | Single invitation sent to a new user |
| **Payload schema** | `{ email: string, role_id: uuid | null, display_name: string | null, invitation_id: uuid }` |
| **Delivery guarantee** | at-least-once |
| **Ordering** | best-effort |
| **Idempotency** | event_id |
| **Retry policy** | 3× exponential backoff |
| **Failure handling** | Log warning |
| **Observability** | Logged, traced (correlation_id) |
| **Lifecycle** | active |
| **Added By** | PLAN-INVITE-001 Phase 3 |

#### `user.bulk_invited` — v1

| Field | Value |
|-------|-------|
| **Classification** | audit |
| **Severity** | MEDIUM |
| **Owner module** | user-onboarding |
| **Consumers** | audit-logging |
| **Description** | Bulk invitation batch processed |
| **Payload schema** | `{ total_requested: number, succeeded_count: number, failed_count: number, skipped_existing_count: number, role_id: uuid | null }` |
| **Delivery guarantee** | at-least-once |
| **Ordering** | best-effort |
| **Idempotency** | event_id |
| **Retry policy** | 3× exponential backoff |
| **Failure handling** | Log warning |
| **Observability** | Logged, traced (correlation_id) |
| **Lifecycle** | active |
| **Added By** | PLAN-INVITE-001 Phase 3 |

#### `user.invitation_accepted` — v1

| Field | Value |
|-------|-------|
| **Classification** | audit |
| **Severity** | MEDIUM |
| **Owner module** | user-onboarding |
| **Consumers** | audit-logging |
| **Description** | Invitation consumed during user signup (emitted by `accept_invitation_on_confirm` trigger) |
| **Payload schema** | `{ email: string, invited_role_id: uuid | null }` |
| **Delivery guarantee** | at-least-once |
| **Ordering** | strict |
| **Idempotency** | event_id |
| **Retry policy** | N/A (trigger-emitted) |
| **Failure handling** | Trigger logs error |
| **Observability** | Logged in audit_logs table |
| **Lifecycle** | active |
| **Added By** | PLAN-INVITE-001 Phase 1 (trigger) |

#### `user.invitation_revoked` — v1

| Field | Value |
|-------|-------|
| **Classification** | audit |
| **Severity** | MEDIUM |
| **Owner module** | user-onboarding |
| **Consumers** | audit-logging |
| **Description** | Pending invitation revoked by admin |
| **Payload schema** | `{ invitation_id: uuid, email: string }` |
| **Delivery guarantee** | at-least-once |
| **Ordering** | best-effort |
| **Idempotency** | event_id |
| **Retry policy** | 3× exponential backoff |
| **Failure handling** | Log warning |
| **Observability** | Logged, traced (correlation_id) |
| **Lifecycle** | active |
| **Added By** | PLAN-INVITE-001 Phase 3 |

#### `user.invitation_resent` — v1

| Field | Value |
|-------|-------|
| **Classification** | audit |
| **Severity** | LOW |
| **Owner module** | user-onboarding |
| **Consumers** | audit-logging |
| **Description** | Invitation resent with new token and TTL |
| **Payload schema** | `{ invitation_id: uuid, email: string, new_expires_at: datetime }` |
| **Delivery guarantee** | at-least-once |
| **Ordering** | best-effort |
| **Idempotency** | event_id |
| **Retry policy** | 3× exponential backoff |
| **Failure handling** | Log warning |
| **Observability** | Logged, traced (correlation_id) |
| **Lifecycle** | active |
| **Added By** | PLAN-INVITE-001 Phase 3 |

#### `user.signup_nudge_sent` — v1

| Field | Value |
|-------|-------|
| **Classification** | audit |
| **Severity** | LOW |
| **Owner module** | user-onboarding |
| **Consumers** | audit-logging |
| **Description** | Signup reminder sent when invite system is disabled |
| **Payload schema** | `{ email: string, user_id: uuid }` |
| **Delivery guarantee** | at-least-once |
| **Ordering** | best-effort |
| **Idempotency** | event_id |
| **Retry policy** | 3× exponential backoff |
| **Failure handling** | Log warning |
| **Observability** | Logged, traced (correlation_id) |
| **Lifecycle** | active |
| **Added By** | PLAN-INVITE-001 Phase 3 |

#### `system.config_changed` — v1

| Field | Value |
|-------|-------|
| **Classification** | audit |
| **Severity** | HIGH |
| **Owner module** | user-onboarding |
| **Consumers** | audit-logging, admin-panel |
| **Description** | System configuration changed (onboarding mode) |
| **Payload schema** | `{ key: string, before: object, after: object }` |
| **Delivery guarantee** | at-least-once |
| **Ordering** | strict |
| **Idempotency** | event_id |
| **Retry policy** | 3× exponential backoff |
| **Failure handling** | Alert on failure |
| **Observability** | Logged, traced (correlation_id) |
| **Action tracker** | Yes — config change requiring audit trail |
| **Lifecycle** | active |
| **Added By** | PLAN-INVITE-001 Phase 2 |

---

### Long-Short Events

#### `longshort.init` — v1

| Field | Value |
|-------|-------|
| **Event Key** | `longshort.init` |
| **Module** | longshort |
| **Version** | 1 |
| **Classification** | audit-critical |
| **Description** | Initial audit-event emission probe for the long-short strategy. Emitted by `longshort-emit-init` edge function (FP-005 Step 5.3) when an authenticated caller with `longshort.view` permission successfully exercises the audit pipeline. Used as AC-13 / AC-14 evidence surface for the bootstrap; subsequent strategy actions register their own `longshort.<verb>` vocabulary in FP-006. |
| **Emitted by** | `longshort-emit-init` edge function (`supabase/functions/longshort-emit-init/index.ts`) |
| **Target table** | `public.longshort_audit_logs` (NOT platform `audit_logs` — strategy events go to per-strategy table per DEC-031 sub-point 5 and DEC-033 v4.1) |
| **Writer** | `writeStrategyAuditEvent` from `supabase/functions/_shared/strategy-audit.ts` (DEC-033 v4.1 canonical writer) |
| **Delivery** | Best-effort, append-only via RLS; helper returns structured `{success, ...}` result rather than throwing |
| **Ordering** | Not ordered (correlation_id allows trace lookup but no cross-event sequencing guarantees at this surface) |
| **Idempotency** | Each call generates a new audit row; idempotency at caller level via correlation_id propagation from DEC-023 envelope |
| **Schema fields written** | `operator_id` (actor_id from auth context, or default UUID if absent), `action` ('longshort.init'), `correlation_id` (envelope-propagated), `ip_address`, `user_agent`, `metadata` (empty for init), `created_at` (DB default) |
| **Failure handling** | Fail-closed: edge function returns 500 error if audit write fails (rather than masking with success). Failure-code vocabulary per DEC-033 v4.1 clause 2: `unknown_strategy_key` / `rls_denied` / `db_unreachable` / `sanitization_violation` / `unexpected_error` |
| **Related risks** | T4 audit-writer trap (closed by DEC-033 v4.1); FP-005 G1 risk register item (mitigated by this AC-14 surface) |
| **Related tests** | Step 5.6 e2e suite (`e2e/longshort/longshort-access.spec.ts`) asserts correlation_id propagation from request header into longshort_audit_logs row |
| **Added by** | PLAN-TRADING-001-LONGSHORT-001 Step 5.3 |
| **Lifecycle** | active |

#### `longshort.universe.refresh.started` — v1

| Field | Value |
|-------|-------|
| **Event Key** | `longshort.universe.refresh.started` |
| **Module** | longshort/universe |
| **Version** | 1 |
| **Classification** | audit-critical (job-execution start marker; first-trading-day-of-quarter only) |
| **Description** | Emitted by `longshort-universe-quarterly-refresh` after the quarter-gating check passes and authentication + `longshort.view` authorization succeed, but before pipeline execution begins. Pairs with `.completed` or `.failed` on the same correlation_id. |
| **Emitted by** | `supabase/functions/longshort-universe-quarterly-refresh/index.ts` |
| **Target table** | `public.longshort_audit_logs` |
| **Writer** | `writeStrategyAuditEvent` |
| **Schema fields written** | `action`, `correlation_id` (request lifecycle UUID), `metadata` = `{ as_of }` |
| **Added by** | FP-008 sub-step 8.4, ACT-108 |
| **Lifecycle** | active |

#### `longshort.universe.refresh.completed` — v1

| Field | Value |
|-------|-------|
| **Event Key** | `longshort.universe.refresh.completed` |
| **Module** | longshort/universe |
| **Version** | 1 |
| **Classification** | audit-critical (job-execution success marker; AC-08 evidence trail) |
| **Description** | Emitted on successful pipeline completion + `universe_refresh_log` finalize. Carries refresh_id + counts (raw / post_filters / eligible_long / eligible_short) + outcome='completed'. |
| **Emitted by** | `supabase/functions/longshort-universe-quarterly-refresh/index.ts` |
| **Target table** | `public.longshort_audit_logs` |
| **Writer** | `writeStrategyAuditEvent` |
| **Schema fields written** | `action`, `correlation_id`, `metadata` = `{ refresh_id, as_of_date, quarter_label, outcome, total_constituents_raw, total_post_filters, total_eligible_long, total_eligible_short }` |
| **Added by** | FP-008 sub-step 8.4, ACT-108 |
| **Lifecycle** | active |

#### `longshort.universe.refresh.skipped` — v1

| Field | Value |
|-------|-------|
| **Event Key** | `longshort.universe.refresh.skipped` |
| **Module** | longshort/universe |
| **Version** | 1 |
| **Classification** | audit-critical (cron-no-op marker; emitted pre-auth on non-first-trading-day requests) |
| **Description** | Emitted when `isFirstTradingDayOfQuarter(as_of)` returns false. This is the dominant production path (≥99% of daily cron firings) — the job is registered to fire daily during the first week of Jan/Apr/Jul/Oct and skip on all but the first trading day of the quarter. |
| **Emitted by** | `supabase/functions/longshort-universe-quarterly-refresh/index.ts` |
| **Target table** | `public.longshort_audit_logs` |
| **Writer** | `writeStrategyAuditEvent` |
| **Schema fields written** | `action`, `correlation_id`, `metadata` = `{ reason: 'not_first_trading_day_of_quarter', as_of }` |
| **Added by** | FP-008 sub-step 8.4, ACT-108 |
| **Lifecycle** | active |

#### `longshort.universe.refresh.failed` — v1

| Field | Value |
|-------|-------|
| **Event Key** | `longshort.universe.refresh.failed` |
| **Module** | longshort/universe |
| **Version** | 1 |
| **Classification** | audit-critical (job-execution failure marker; paired with `universe_refresh_log.outcome='failed'`) |
| **Description** | Emitted on either (a) pipeline-internal failure surfaced by the orchestrator with `outcome='failed'` + `failure_reason`, or (b) handler-level catch surrounding `orch.run()` where the orchestrator itself threw before finalize could record outcome. Paired with `universe_refresh_log.outcome='failed'` row when (a); orphan when (b). |
| **Emitted by** | `supabase/functions/longshort-universe-quarterly-refresh/index.ts` |
| **Target table** | `public.longshort_audit_logs` |
| **Writer** | `writeStrategyAuditEvent` |
| **Schema fields written** | `action`, `correlation_id`, `metadata` = `{ refresh_id?, outcome:'failed', failure_reason?, error? }` |
| **Added by** | FP-008 sub-step 8.4, ACT-108 |
| **Lifecycle** | active |

---

## Dependencies

<!-- Inserted before "Dependencies" closure: ACT-109 event registrations -->
## Long-Short Universe Continuous Hard-Exclusion Refresh Events (FP-008 Sub-Step 8.5)

All events below are emitted by the one-dispatcher edge function
`supabase/functions/longshort-universe-hard-exclusion-refresh/index.ts`
(Surface 1 Option (a) at ACT-109 — one function, rule routed by `rule`
query/body param). Per-rule MIG-049 `job_registry` rows seed each rule's
invocation. All events write to `public.longshort_audit_logs` via
`writeStrategyAuditEvent`.

Event-key format: `longshort.universe.hard_exclusion_refresh_<rule_slug>.<outcome>`
where `<rule_slug>` ∈ `{3_3a, 3_3b, 3_3c, 3_3e}` (dot replaced with underscore
to match the MIG-049 `job_registry.id` slugging) and `<outcome>` ∈
`{skipped, completed, failed}`. The Cartesian product yields 12 stable event
keys (4 rules × 3 outcomes); enumeration via the per-rule blocks below.

#### `longshort.universe.hard_exclusion_refresh_<rule_slug>.skipped` — v1 (×4)

| Field | Value |
|-------|-------|
| **Event Keys** | `longshort.universe.hard_exclusion_refresh_3_3a.skipped`, `..._3_3b.skipped`, `..._3_3c.skipped`, `..._3_3e.skipped` |
| **Module** | longshort/universe |
| **Version** | 1 |
| **Classification** | audit-critical (dispatcher skip marker; dominant production path until sub-step 8.6 + 8.7 wire the `universe_membership` query source) |
| **Description** | Emitted on any of three skip conditions: (a) Surface 0 Option α — POST body `tickers` array is absent / empty (`skip_reason='awaiting_universe_membership_8_6'`); (b) per-rule data fetcher not yet wired (`skipped_reason='awaiting_per_rule_fetcher_wiring'`); (c) §3.3e cadence gate did not fire on this trading day (`skipped_reason='not_short_interest_trigger_day'`, `_3_3e` only). |
| **Emitted by** | `supabase/functions/longshort-universe-hard-exclusion-refresh/index.ts` |
| **Target table** | `public.longshort_audit_logs` |
| **Writer** | `writeStrategyAuditEvent` |
| **Schema fields written** | `action`, `correlation_id`, `metadata` = `{ rule, as_of, skip_reason \| skipped_reason, ... }` |
| **Added by** | FP-008 sub-step 8.5, ACT-109 |
| **Lifecycle** | active |

#### `longshort.universe.hard_exclusion_refresh_<rule_slug>.completed` — v1 (×4)

| Field | Value |
|-------|-------|
| **Event Keys** | `longshort.universe.hard_exclusion_refresh_3_3a.completed`, `..._3_3b.completed`, `..._3_3c.completed`, `..._3_3e.completed` |
| **Module** | longshort/universe |
| **Version** | 1 |
| **Classification** | audit-critical (per-rule refresh success marker; AC-09 evidence trail) |
| **Description** | Emitted when the orchestrator returned `outcome='completed'` for the given rule. Sub-step 8.5 ships the dispatcher infrastructure; per-rule data fetchers wire in at later sub-steps, so this event becomes routinely emitted only after rule-fetcher integration lands. |
| **Emitted by** | `supabase/functions/longshort-universe-hard-exclusion-refresh/index.ts` |
| **Target table** | `public.longshort_audit_logs` |
| **Writer** | `writeStrategyAuditEvent` |
| **Schema fields written** | `action`, `correlation_id`, `metadata` = `{ rule, as_of, outcome, tickers_considered, firings_count, skipped_reason: null }` |
| **Added by** | FP-008 sub-step 8.5, ACT-109 |
| **Lifecycle** | active |

#### `longshort.universe.hard_exclusion_refresh_<rule_slug>.failed` — v1 (×4)

| Field | Value |
|-------|-------|
| **Event Keys** | `longshort.universe.hard_exclusion_refresh_3_3a.failed`, `..._3_3b.failed`, `..._3_3c.failed`, `..._3_3e.failed` |
| **Module** | longshort/universe |
| **Version** | 1 |
| **Classification** | audit-critical (per-rule refresh failure marker; paired with §11.3 health surfacing at sub-step 8.9) |
| **Description** | Emitted from the handler-level catch around `orch.run()`. Carries error message in metadata. Per AC-09 the failure of one rule does not block the other rules (separate `job_registry` rows + separate dispatcher invocations + `forbid` concurrency policy at the row level). |
| **Emitted by** | `supabase/functions/longshort-universe-hard-exclusion-refresh/index.ts` |
| **Target table** | `public.longshort_audit_logs` |
| **Writer** | `writeStrategyAuditEvent` |
| **Schema fields written** | `action`, `correlation_id`, `metadata` = `{ rule, as_of, error }` |
| **Added by** | FP-008 sub-step 8.5, ACT-109 |
| **Lifecycle** | active |

---

## Dependencies

- [Dependency Map](../01-architecture/dependency-map.md)
- [Action Tracker](../06-tracking/action-tracker.md) — critical events create entries
- [Risk Register](../06-tracking/risk-register.md) — event patterns linked to risks
- [Change Control Policy](../00-governance/change-control-policy.md) — event contract changes follow change control

## Related Documents

- Module docs in `docs/04-modules/`
- [Config Index](config-index.md)
- [Function Index](function-index.md)
- [Route Index](route-index.md)
- [Permission Index](permission-index.md)

---

## Platform Kill-Switch Events (FP-006 Sub-Step 6.1)

#### `kill_switch.soft_pause` — v1

| Field | Value |
|-------|-------|
| **Classification** | audit, security |
| **Severity** | HIGH |
| **Owner module** | platform |
| **Description** | Soft-pause kill-switch activated for a strategy (halts new entries; existing positions held). |
| **Emitted by** | `kill_switch_soft_pause()` RPC via SQL-level INSERT into `audit_logs` |
| **Target table** | `public.audit_logs` (platform — SQL INSERT carve-out per T4 trap) |
| **Payload schema** | `metadata: { operator_id, strategy_key, reason, state_after: 'soft_paused' }`; `target_type='kill_switches'`; `target_id=NULL` |
| **Lifecycle** | active |
| **Added By** | FP-006 sub-step 6.1(d), MIG-040, ACT-075 |

#### `kill_switch.hard_pause` — v1

Same as soft_pause; `state_after='hard_paused'`. Halts all activity including monitoring.

#### `kill_switch.manual_liquidate` — v1

Same as soft_pause; `state_after='liquidating'`; CRITICAL severity. State transition only in sub-step 6.1; order-cancel loop is Phase 5.

#### `kill_switch.resume` — v1

Same as soft_pause; `state_after='active'`. Only valid from `soft_paused`.
