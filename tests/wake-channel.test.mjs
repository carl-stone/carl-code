import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm, stat, symlink, writeFile, chmod } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  enqueueWakeEvent,
  ensureSessionSpool,
  getWakeRoot,
  MAX_EVENT_AGE_MS,
  MAX_SUMMARY_BYTES,
  validateEvent,
  validateSessionId,
} from "../packages/harness/extensions/wake-channel-core.mjs";

const { default: installWakeChannel, WAKE_INSTRUCTION } = await import(
  "../packages/harness/extensions/wake-channel.ts"
);

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitFor(predicate, timeout = 4000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await sleep(25);
  }
  assert.fail("Timed out waiting for wake channel state");
}

function event(eventId, overrides = {}) {
  return {
    event_id: eventId,
    type: "phase_complete",
    project: "wake-test-project",
    phase: "phase-one",
    root: "/tmp/wake-test-orchestration",
    summary: "phase completed",
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

function fakeExtension(sessionId, idle) {
  const handlers = new Map();
  const messages = [];
  const notifications = [];
  const state = { idle, idleWakeCount: 0, activeSteeringCount: 0 };
  const pi = {
    on(name, handler) {
      handlers.set(name, handler);
    },
    sendMessage(message, options) {
      messages.push({ message, options });
      if (state.idle && options.triggerTurn === true) state.idleWakeCount += 1;
      if (!state.idle && options.deliverAs === "steer") state.activeSteeringCount += 1;
    },
  };
  const ctx = {
    mode: "tui",
    hasUI: true,
    cwd: "/tmp/wake-test-project",
    sessionManager: { getSessionId: () => sessionId },
    ui: {
      notify(message, type) {
        notifications.push({ message, type });
      },
    },
  };
  return { pi, ctx, handlers, messages, notifications, state };
}

async function reasons(spool) {
  const names = await readdir(spool.quarantine);
  const reasonNames = names.filter((name) => name.endsWith(".reason.json"));
  return Promise.all(reasonNames.map(async (name) => JSON.parse(await readFile(join(spool.quarantine, name), "utf8"))));
}

const previousHome = process.env.CARL_CODE_HOME;
const home = await mkdtemp(join(tmpdir(), "carl-wake-test-"));
process.env.CARL_CODE_HOME = home;
const instances = [];

try {
  const valid = event("schema-event");
  assert.equal(validateSessionId("../escape").ok, false);
  assert.equal(validateSessionId("").ok, false);
  assert.equal(validateEvent({ ...valid, extra: true }).reason, "unknown_field:extra");
  assert.equal(validateEvent({ ...valid, type: "unknown" }).reason, "type_invalid");
  assert.equal(
    validateEvent({ ...valid, created_at: new Date(Date.now() - MAX_EVENT_AGE_MS - 1).toISOString() }).reason,
    "event_stale",
  );
  assert.equal(
    validateEvent({ ...valid, summary: "x".repeat(MAX_SUMMARY_BYTES + 1) }).reason,
    "summary_too_long",
  );

  const atomic = await enqueueWakeEvent("atomic-session", valid);
  const atomicNames = await readdir(atomic.spool.inbox);
  assert.deepEqual(atomicNames, [atomic.fileName]);
  assert.equal((await stat(atomic.filePath)).mode & 0o777, 0o600);
  for (const directory of [
    atomic.spool.wakeRoot,
    atomic.spool.sessionRoot,
    atomic.spool.inbox,
    atomic.spool.claimed,
    atomic.spool.archive,
    atomic.spool.quarantine,
    atomic.spool.receipts,
  ]) {
    assert.equal((await stat(directory)).mode & 0o777, 0o700);
  }

  const rootBeforeFactory = getWakeRoot(home);
  assert.equal(existsSync(rootBeforeFactory), true);
  const routeA = fakeExtension("route-session-a", true);
  const routeB = fakeExtension("route-session-b", false);
  instances.push(routeA, routeB);
  const routeARoot = getWakeRoot(home);
  const routeASessionPath = join(routeARoot, "route-session-a");
  assert.equal(existsSync(routeASessionPath), false);
  installWakeChannel(routeA.pi);
  installWakeChannel(routeB.pi);
  assert.equal(existsSync(routeASessionPath), false);

  const eventA = event("route-event-a", { project: "project-a", root: "/tmp/root-a" });
  const eventB = event("route-event-b", { project: "project-b", root: "/tmp/root-b" });
  await enqueueWakeEvent("route-session-a", eventA);
  await enqueueWakeEvent("route-session-b", eventB);
  await Promise.all([
    routeA.handlers.get("session_start")({ type: "session_start", reason: "startup" }, routeA.ctx),
    routeB.handlers.get("session_start")({ type: "session_start", reason: "startup" }, routeB.ctx),
  ]);

  assert.equal(routeA.messages.length, 1);
  assert.equal(routeB.messages.length, 1);
  assert.match(routeA.messages[0].message.content, /project-a/);
  assert.doesNotMatch(routeA.messages[0].message.content, /project-b/);
  assert.match(routeB.messages[0].message.content, /project-b/);
  assert.equal(routeA.messages[0].message.display, true);
  assert.deepEqual(routeA.messages[0].options, { triggerTurn: true, deliverAs: "steer" });
  assert.equal(routeA.state.idleWakeCount, 1);
  assert.equal(routeB.state.activeSteeringCount, 1);
  assert.match(routeA.messages[0].message.content, /untrusted data/i);
  assert.match(routeA.messages[0].message.content, /manage the agents/i);
  assert.match(WAKE_INSTRUCTION, /sole project manager/i);

  const routeASpool = await ensureSessionSpool("route-session-a");
  const routeBSpool = await ensureSessionSpool("route-session-b");
  assert.equal((await readdir(routeASpool.inbox)).length, 0);
  assert.equal((await readdir(routeBSpool.inbox)).length, 0);
  assert.equal((await readdir(routeASpool.archive)).length, 1);
  assert.equal((await readdir(routeBSpool.archive)).length, 1);
  assert.equal((await readdir(routeASpool.receipts)).length, 1);
  const receipt = JSON.parse(await readFile(join(routeASpool.receipts, "route-event-a.json"), "utf8"));
  assert.equal(receipt.status, "delivered");
  assert.equal((await stat(join(routeASpool.receipts, "route-event-a.json"))).mode & 0o777, 0o600);

  await enqueueWakeEvent("route-session-a", eventA);
  await waitFor(async () => (await readdir(routeASpool.quarantine)).some((name) => name.endsWith(".reason.json")));
  assert.equal(routeA.messages.length, 1);
  assert.ok((await reasons(routeASpool)).some((record) => record.reason === "duplicate_event_id"));

  const malformedPath = join(routeASpool.inbox, "malformed.json");
  await writeFile(malformedPath, "{not-json\n", { mode: 0o600 });
  await chmod(malformedPath, 0o600);
  const oversizedPath = join(routeASpool.inbox, "oversized.json");
  await writeFile(oversizedPath, Buffer.alloc(16 * 1024 + 1), { mode: 0o600 });
  await chmod(oversizedPath, 0o600);
  const symlinkTarget = join(home, "outside-event.json");
  await writeFile(symlinkTarget, JSON.stringify(event("symlink-event")), { mode: 0o600 });
  await symlink(symlinkTarget, join(routeASpool.inbox, "symlink.json"));
  await waitFor(async () => (await reasons(routeASpool)).length >= 4);
  const quarantineReasons = await reasons(routeASpool);
  assert.ok(quarantineReasons.some((record) => record.reason === "malformed_json"));
  assert.ok(quarantineReasons.some((record) => record.reason === "file_oversized"));
  assert.ok(quarantineReasons.some((record) => record.reason === "symbolic_link"));
  assert.equal(routeA.messages.length, 1);

  await routeA.handlers.get("session_shutdown")({ type: "session_shutdown", reason: "reload" }, routeA.ctx);
  const afterShutdown = event("after-shutdown");
  await enqueueWakeEvent("route-session-a", afterShutdown);
  await sleep(600);
  assert.equal(routeA.messages.length, 1);

  await routeA.handlers.get("session_start")({ type: "session_start", reason: "reload" }, routeA.ctx);
  await waitFor(() => routeA.messages.length === 2);
  assert.match(routeA.messages[1].message.content, /after-shutdown/);
  assert.equal(routeA.messages[1].options.deliverAs, "steer");

  await routeA.handlers.get("session_shutdown")({ type: "session_shutdown", reason: "quit" }, routeA.ctx);
  await routeB.handlers.get("session_shutdown")({ type: "session_shutdown", reason: "quit" }, routeB.ctx);
  console.log("wake channel tests passed");
} finally {
  for (const instance of instances) {
    try {
      await instance.handlers.get("session_shutdown")?.({ type: "session_shutdown", reason: "quit" }, instance.ctx);
    } catch {
    }
  }
  if (previousHome === undefined) delete process.env.CARL_CODE_HOME;
  else process.env.CARL_CODE_HOME = previousHome;
  await rm(home, { recursive: true, force: true });
}
