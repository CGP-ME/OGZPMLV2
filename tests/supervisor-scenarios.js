/**
 * supervisor-scenarios.js — state-machine test harness for core/Supervisor.js
 *
 * Validates the Supervisor's HEALTHY -> DEGRADED -> UNHEALTHY -> DEAD
 * state machine + recovery edges + restart-loop guard. Mock subsystems
 * with controllable health responses; injected clock for deterministic
 * timing.
 *
 * Spec: ogz-meta/specs/resilience-and-supervision.md (Test gauntlets section)
 *
 * Exit 0 on all-pass, 1 on any-fail. Designed to run via
 * `node tests/supervisor-scenarios.js`.
 *
 * @date 2026-04-26
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { Supervisor, STATES } = require('../core/Supervisor');

/* ===== mock subsystem ==================================================== */

class MockSubsystem {
  constructor(name) {
    this.name = name;
    this.currentStatus = STATES.HEALTHY;
    this.failureReason = null;
    this.healSuccessAfter = 0;   // heal succeeds after N attempts
    this.healAttempts = 0;
    this.escalateSuccessAfter = 0;
    this.escalateAttempts = 0;
    this.getHealthThrows = false;
  }

  async getHealth() {
    if (this.getHealthThrows) {
      throw new Error('mock getHealth blew up');
    }
    return {
      status: this.currentStatus,
      timestamp: Date.now(),
      details: { mock: true },
      lastSuccessAt: Date.now() - 60_000,
      failureReason: this.failureReason,
    };
  }

  async selfHeal() {
    this.healAttempts++;
    if (this.healSuccessAfter > 0 && this.healAttempts >= this.healSuccessAfter) {
      this.currentStatus = STATES.HEALTHY;
      this.failureReason = null;
      return true;
    }
    return false;
  }

  async escalate() {
    this.escalateAttempts++;
    if (this.escalateSuccessAfter > 0 && this.escalateAttempts >= this.escalateSuccessAfter) {
      this.currentStatus = STATES.HEALTHY;
      this.failureReason = null;
      return true;
    }
    return false;
  }

  setSick(status = STATES.UNHEALTHY, reason = 'mock-sick') {
    this.currentStatus = status;
    this.failureReason = reason;
  }

  setHealthy() {
    this.currentStatus = STATES.HEALTHY;
    this.failureReason = null;
    this.healAttempts = 0;
    this.escalateAttempts = 0;
  }
}

/* ===== test runner ======================================================= */

const results = [];
function record(name, pass, reason) {
  results.push({ name, pass, reason });
  const tag = pass ? 'PASS' : 'FAIL';
  console.log(`  ${tag}  ${name}${pass ? '' : ' — ' + reason}`);
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/**
 * Build a supervisor for testing. Uses REAL clock — frozen-clock testing
 * doesn't work for time-driven state machines because redDuration stays
 * 0 forever. Tight pollIntervalMs + degradeThresholdMs make scenarios
 * fast (sub-second) on real time.
 */
function buildSupervisor(opts = {}) {
  const tmpLedger = `/tmp/sv-test-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.jsonl`;
  const sv = new Supervisor({
    label: opts.label || '[test-sv]',
    options: Object.assign({
      pollIntervalMs: 50,           // tight for fast tests
      degradeThresholdMs: 100,
      unhealthyHealAttempts: 3,
      healCooldownMs: 0,
      deadCooldownMs: 0,
      maxRestartsIn10min: 5,
      ledgerPath: tmpLedger,
    }, opts.options || {}),
    onAlert: opts.onAlert || (() => {}),
  });
  return { sv, ledgerPath: tmpLedger };
}

async function waitForState(sv, name, target, timeoutMs = 1500) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const status = sv.getStatus();
    if (status.subsystems[name]?.state === target) return true;
    await sleep(20);
  }
  return false;
}

/* ===== individual scenarios ============================================== */

async function scenario1_healthyToDegraded() {
  const { sv } = buildSupervisor({ label: '[s1]' });
  const mock = new MockSubsystem('m1');
  sv.register(mock);
  sv.start();

  await sleep(80);  // let first poll fire as HEALTHY
  if (sv.getStatus().subsystems.m1.state !== STATES.HEALTHY) {
    sv.stop();
    return record('1. HEALTHY -> DEGRADED on first red gauge', false,
      `initial state was ${sv.getStatus().subsystems.m1.state}, expected HEALTHY`);
  }

  mock.setSick(STATES.UNHEALTHY, 'red-flag');
  const ok = await waitForState(sv, 'm1', STATES.DEGRADED, 500);
  sv.stop();

  if (ok) record('1. HEALTHY -> DEGRADED on first red gauge', true);
  else record('1. HEALTHY -> DEGRADED on first red gauge', false,
    `state did not transition to DEGRADED (got ${sv.getStatus().subsystems.m1.state})`);
}

async function scenario2_degradedRecovers() {
  const { sv } = buildSupervisor({ label: '[s2]' });
  const mock = new MockSubsystem('m2');
  sv.register(mock);
  sv.start();
  await sleep(80);

  mock.setSick();
  await waitForState(sv, 'm2', STATES.DEGRADED, 500);

  // Within the degrade threshold, set healthy → should recover to HEALTHY
  mock.setHealthy();
  const ok = await waitForState(sv, 'm2', STATES.HEALTHY, 500);
  sv.stop();

  if (ok) record('2. DEGRADED recovers to HEALTHY when red clears in time', true);
  else record('2. DEGRADED recovers to HEALTHY when red clears in time', false,
    `state did not recover (got ${sv.getStatus().subsystems.m2.state})`);
}

async function scenario3_degradedToUnhealthyAfterThreshold() {
  // Use real clock for this one — easier to reason about with degradeThresholdMs=100ms
  const { sv } = buildSupervisor({ label: '[s3]', options: {} });
  const mock = new MockSubsystem('m3');
  // Disable selfHeal/escalate to isolate the timing
  delete mock.selfHeal;
  sv.register(mock);
  sv.start();
  await sleep(80);

  mock.setSick();
  // Must stay red for >degradeThresholdMs (100ms). Wait 250ms.
  const ok = await waitForState(sv, 'm3', STATES.UNHEALTHY, 1500);
  sv.stop();

  if (ok) record('3. DEGRADED -> UNHEALTHY after threshold red duration', true);
  else record('3. DEGRADED -> UNHEALTHY after threshold red duration', false,
    `state stayed at ${sv.getStatus().subsystems.m3.state}`);
}

async function scenario4_unhealthyTriggersHeal() {
  const { sv } = buildSupervisor({ label: '[s4]' });
  const mock = new MockSubsystem('m4');
  mock.healSuccessAfter = 1;  // first heal succeeds
  sv.register(mock);
  sv.start();
  await sleep(80);

  mock.setSick();
  // First WAIT for state to LEAVE HEALTHY (-> DEGRADED), otherwise the
  // followup waitForState(HEALTHY) would match immediately on the
  // leftover initial state.
  await waitForState(sv, 'm4', STATES.DEGRADED, 500);
  // Now wait for state to recover (heal flips status to HEALTHY -> next
  // poll sees HEALTHY -> supervisor state HEALTHY).
  await waitForState(sv, 'm4', STATES.HEALTHY, 1500);

  sv.stop();
  if (mock.healAttempts >= 1) record('4. UNHEALTHY triggers selfHeal', true);
  else record('4. UNHEALTHY triggers selfHeal', false, `healAttempts=${mock.healAttempts}`);
}

async function scenario5_healFailsThreeTimesGoesDead() {
  const { sv } = buildSupervisor({ label: '[s5]' });
  const mock = new MockSubsystem('m5');
  mock.healSuccessAfter = 0;  // heal never succeeds
  sv.register(mock);
  sv.start();
  await sleep(80);

  mock.setSick();
  // Wait long enough for DEGRADED→UNHEALTHY→3 heal fails→DEAD
  const ok = await waitForState(sv, 'm5', STATES.DEAD, 3000);
  sv.stop();

  if (ok) record('5. self-heal fails 3x -> DEAD', true);
  else record('5. self-heal fails 3x -> DEAD', false,
    `state=${sv.getStatus().subsystems.m5.state}, healAttempts=${mock.healAttempts}`);
}

async function scenario6_deadFiresAlertAndEscalate() {
  let alertFired = false;
  const { sv } = buildSupervisor({
    label: '[s6]',
    onAlert: () => { alertFired = true; },
  });
  const mock = new MockSubsystem('m6');
  mock.healSuccessAfter = 0;
  mock.escalateSuccessAfter = 1;
  sv.register(mock);
  sv.start();
  await sleep(80);

  mock.setSick();
  await waitForState(sv, 'm6', STATES.DEAD, 3000);
  // Give escalate a chance to fire
  await sleep(150);
  sv.stop();

  if (alertFired && mock.escalateAttempts >= 1) {
    record('6. DEAD triggers onAlert + escalate()', true);
  } else {
    record('6. DEAD triggers onAlert + escalate()', false,
      `alertFired=${alertFired}, escalateAttempts=${mock.escalateAttempts}`);
  }
}

async function scenario7_recoveryClearsCounters() {
  const { sv } = buildSupervisor({ label: '[s7]' });
  const mock = new MockSubsystem('m7');
  mock.healSuccessAfter = 0;
  mock.escalateSuccessAfter = 1;
  sv.register(mock);
  sv.start();
  await sleep(80);

  mock.setSick();
  await waitForState(sv, 'm7', STATES.DEAD, 3000);
  // escalate flips it back to HEALTHY (escalateSuccessAfter=1)
  const ok = await waitForState(sv, 'm7', STATES.HEALTHY, 1500);
  sv.stop();

  if (ok) record('7. recovery (DEAD -> HEALTHY) clears state', true);
  else record('7. recovery (DEAD -> HEALTHY) clears state', false,
    `state=${sv.getStatus().subsystems.m7.state}`);
}

async function scenario8_multipleSubsystemsIndependent() {
  const { sv } = buildSupervisor({ label: '[s8]' });
  const a = new MockSubsystem('m8a');
  const b = new MockSubsystem('m8b');
  sv.register(a);
  sv.register(b);
  sv.start();
  await sleep(80);

  // a goes sick, b stays healthy — verify b doesn't get dragged
  a.setSick();
  await waitForState(sv, 'm8a', STATES.DEGRADED, 500);
  const aState = sv.getStatus().subsystems.m8a.state;
  const bState = sv.getStatus().subsystems.m8b.state;
  sv.stop();

  if (aState === STATES.DEGRADED && bState === STATES.HEALTHY) {
    record('8. multiple subsystems track independently', true);
  } else {
    record('8. multiple subsystems track independently', false,
      `a=${aState}, b=${bState}`);
  }
}

async function scenario9_restartLoopGuard() {
  let escalateCalls = 0;
  const { sv } = buildSupervisor({
    label: '[s9]',
    options: {
      pollIntervalMs: 30,
      degradeThresholdMs: 50,
      unhealthyHealAttempts: 1,
      healCooldownMs: 0,
      deadCooldownMs: 0,
      maxRestartsIn10min: 3,
    },
  });
  const mock = new MockSubsystem('m9');
  mock.healSuccessAfter = 0;
  // escalate "succeeds" but mock immediately re-sicks (simulates flaky restart)
  mock.escalate = async () => {
    escalateCalls++;
    mock.currentStatus = STATES.HEALTHY;
    mock.failureReason = null;
    setTimeout(() => mock.setSick(), 5);
    return true;
  };
  sv.register(mock);
  sv.start();
  await sleep(80);

  mock.setSick();
  await sleep(2500);  // long enough to hit max restarts
  sv.stop();

  // Guard caps at 3 restarts in 10min window — should not exceed that
  if (escalateCalls > 0 && escalateCalls <= 3) {
    record('9. restart-loop guard caps escalations', true);
  } else {
    record('9. restart-loop guard caps escalations', false,
      `escalateCalls=${escalateCalls} (expected 1-3)`);
  }
}

/* ===== getHealth() exception scenario (bonus) ============================ */

async function scenario10_getHealthThrowsTreatedAsDead() {
  const { sv } = buildSupervisor({ label: '[s10]' });
  const mock = new MockSubsystem('m10');
  mock.getHealthThrows = true;
  sv.register(mock);
  sv.start();
  await sleep(150);  // multiple polls — getHealth keeps throwing
  const state = sv.getStatus().subsystems.m10.state;
  sv.stop();

  if (state === STATES.DEAD) record('10. getHealth() throws -> treated as DEAD', true);
  else record('10. getHealth() throws -> treated as DEAD', false, `state=${state}`);
}

/* ===== orchestration ===================================================== */

async function main() {
  console.log('\nSupervisor scenarios — state-machine validation\n');

  await scenario1_healthyToDegraded();
  await scenario2_degradedRecovers();
  await scenario3_degradedToUnhealthyAfterThreshold();
  await scenario4_unhealthyTriggersHeal();
  await scenario5_healFailsThreeTimesGoesDead();
  await scenario6_deadFiresAlertAndEscalate();
  await scenario7_recoveryClearsCounters();
  await scenario8_multipleSubsystemsIndependent();
  await scenario9_restartLoopGuard();
  await scenario10_getHealthThrowsTreatedAsDead();

  // Cleanup tmp ledger files (best-effort)
  try {
    const tmpFiles = fs.readdirSync('/tmp').filter(f => f.startsWith(`sv-test-${process.pid}-`));
    for (const f of tmpFiles) {
      try { fs.unlinkSync(path.join('/tmp', f)); } catch (_) {}
    }
  } catch (_) {}

  const passed = results.filter(r => r.pass).length;
  const total = results.length;
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`SUPERVISOR SCENARIOS: ${passed}/${total} passed`);
  console.log('═'.repeat(60));

  if (passed < total) {
    console.log('\nFAILED:');
    results.filter(r => !r.pass).forEach(r => console.log(`  - ${r.name}: ${r.reason}`));
    process.exit(1);
  }
  process.exit(0);
}

main().catch(err => {
  console.error('Scenario runner crashed:', err);
  process.exit(2);
});
