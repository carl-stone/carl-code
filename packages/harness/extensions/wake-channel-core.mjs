import { randomUUID } from "node:crypto";
import { constants, lstatSync, realpathSync } from "node:fs";
import { chmod, link, lstat, mkdir, open, rename, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, parse, relative, resolve, sep } from "node:path";

export const EVENT_TYPES = Object.freeze([
  "phase_complete",
  "phase_failed",
  "blocker",
  "stale",
  "pipeline_complete",
]);

export const DIRECTORY_MODE = 0o700;
export const FILE_MODE = 0o600;
export const MAX_SESSION_ID_BYTES = 128;
export const MAX_EVENT_FILE_BYTES = 16 * 1024;
export const MAX_EVENT_AGE_MS = 24 * 60 * 60 * 1000;
export const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;
export const MAX_PROJECT_BYTES = 128;
export const MAX_PHASE_BYTES = 128;
export const MAX_ROOT_BYTES = 1024;
export const MAX_SUMMARY_BYTES = 4096;
export const MAX_EVENT_ID_BYTES = 128;

const EVENT_FIELDS = Object.freeze([
  "event_id",
  "type",
  "project",
  "phase",
  "root",
  "summary",
  "created_at",
]);
const SESSION_ID_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/;
const EVENT_ID_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/;
const TEMP_FILE_PATTERN = /^\.wake-[A-Za-z0-9._-]+\.tmp$/;

export class WakeValidationError extends Error {
  constructor(reason) {
    super(reason);
    this.name = "WakeValidationError";
    this.reason = reason;
  }
}

function byteLength(value) {
  return Buffer.byteLength(value, "utf8");
}

function invalid(reason) {
  return { ok: false, reason };
}

function isObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function validText(value, maximum, field) {
  if (typeof value !== "string" || value.length === 0) return `${field}_invalid`;
  if (byteLength(value) > maximum) return `${field}_too_long`;
  if (Buffer.from(value, "utf8").toString("utf8") !== value) return `${field}_invalid_utf8`;
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint < 0x20 || codePoint === 0x7f) return `${field}_contains_control`;
  }
  return undefined;
}

export function validateSessionId(sessionId) {
  if (typeof sessionId !== "string" || sessionId.length === 0) return invalid("session_id_invalid");
  if (byteLength(sessionId) > MAX_SESSION_ID_BYTES) return invalid("session_id_too_long");
  if (!SESSION_ID_PATTERN.test(sessionId)) return invalid("session_id_invalid");
  return { ok: true, value: sessionId };
}

export function isTemporaryInboxName(name) {
  return TEMP_FILE_PATTERN.test(name);
}

export function currentUserOwns(stat) {
  const uid = typeof process.getuid === "function" ? process.getuid() : undefined;
  return uid === undefined || stat.uid === uid;
}

export function validateEvent(value, now = Date.now()) {
  if (!isObject(value)) return invalid("event_not_object");

  const keys = Object.keys(value);
  const unknown = keys.filter((key) => !EVENT_FIELDS.includes(key));
  if (unknown.length > 0) return invalid(`unknown_field:${unknown[0]}`);
  for (const field of EVENT_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(value, field)) return invalid(`missing_field:${field}`);
  }

  if (typeof value.type !== "string" || !EVENT_TYPES.includes(value.type)) return invalid("type_invalid");

  const eventIdError = validText(value.event_id, MAX_EVENT_ID_BYTES, "event_id");
  if (eventIdError) return invalid(eventIdError);
  if (!EVENT_ID_PATTERN.test(value.event_id)) return invalid("event_id_invalid");

  for (const [field, maximum] of [
    ["project", MAX_PROJECT_BYTES],
    ["phase", MAX_PHASE_BYTES],
    ["root", MAX_ROOT_BYTES],
    ["summary", MAX_SUMMARY_BYTES],
  ]) {
    const textError = validText(value[field], maximum, field);
    if (textError) return invalid(textError);
  }

  if (!isAbsolute(value.root)) return invalid("root_not_absolute");

  const dateError = validText(value.created_at, 32, "created_at");
  if (dateError) return invalid(dateError);
  let createdAt;
  try {
    const date = new Date(value.created_at);
    if (Number.isNaN(date.getTime()) || date.toISOString() !== value.created_at) return invalid("created_at_invalid");
    createdAt = date.getTime();
  } catch {
    return invalid("created_at_invalid");
  }

  if (now - createdAt > MAX_EVENT_AGE_MS) return invalid("event_stale");
  if (createdAt - now > MAX_FUTURE_SKEW_MS) return invalid("event_from_future");

  let encoded;
  try {
    encoded = JSON.stringify(value);
  } catch {
    return invalid("event_not_serializable");
  }
  if (typeof encoded !== "string" || byteLength(`${encoded}\n`) > MAX_EVENT_FILE_BYTES) {
    return invalid("event_too_large");
  }

  return { ok: true, value };
}

function canonicalHome(home) {
  const absolute = resolve(home);
  try {
    const stat = lstatSync(absolute);
    if (stat.isSymbolicLink()) throw new Error(`Symbolic link in wake path: ${absolute}`);
    return realpathSync(absolute);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  const missing = [];
  let existing = absolute;
  while (true) {
    try {
      const stat = lstatSync(existing);
      if (stat.isSymbolicLink()) throw new Error(`Symbolic link in wake path: ${existing}`);
      return join(realpathSync(existing), ...missing.reverse());
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      const parent = dirname(existing);
      if (parent === existing) throw error;
      missing.push(existing.slice(parent.length + 1));
      existing = parent;
    }
  }
}

export function getWakeRoot(homeOverride) {
  const configuredHome = homeOverride ?? process.env.CARL_CODE_HOME;
  const carlHome = configuredHome ? resolve(configuredHome) : join(homedir(), ".carl-code");
  return join(canonicalHome(carlHome), "wake");
}

function pathComponents(directory) {
  const absolute = resolve(directory);
  const root = parse(absolute).root;
  const parts = relative(root, absolute).split(sep).filter(Boolean);
  if (parts.length === 0) throw new Error(`Refusing to use filesystem root as a state directory: ${absolute}`);
  return { absolute, root, parts };
}

export async function ensurePrivateDirectory(directory) {
  const { absolute, root, parts } = pathComponents(directory);
  let current = root;

  for (const part of parts) {
    current = join(current, part);
    let stat;
    try {
      stat = await lstat(current);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      try {
        await mkdir(current, { mode: DIRECTORY_MODE });
      } catch (mkdirError) {
        if (mkdirError?.code !== "EEXIST") throw mkdirError;
      }
      stat = await lstat(current);
    }
    if (stat.isSymbolicLink()) throw new Error(`Symbolic link in wake path: ${current}`);
    if (!stat.isDirectory()) throw new Error(`Wake path is not a directory: ${current}`);
  }

  const targetStat = await lstat(absolute);
  if (targetStat.isSymbolicLink()) throw new Error(`Symbolic link in wake path: ${absolute}`);
  if (!targetStat.isDirectory()) throw new Error(`Wake path is not a directory: ${absolute}`);
  if (!currentUserOwns(targetStat)) throw new Error(`Wake directory is not owned by the current user: ${absolute}`);
  await chmod(absolute, DIRECTORY_MODE);
  return absolute;
}

export async function ensureSessionSpool(sessionId, homeOverride) {
  const sessionCheck = validateSessionId(sessionId);
  if (!sessionCheck.ok) throw new WakeValidationError(sessionCheck.reason);

  const wakeRoot = await ensurePrivateDirectory(getWakeRoot(homeOverride));
  const sessionRoot = await ensurePrivateDirectory(join(wakeRoot, sessionId));
  const directories = {
    wakeRoot,
    sessionRoot,
    inbox: await ensurePrivateDirectory(join(sessionRoot, "inbox")),
    claimed: await ensurePrivateDirectory(join(sessionRoot, "claimed")),
    archive: await ensurePrivateDirectory(join(sessionRoot, "archive")),
    quarantine: await ensurePrivateDirectory(join(sessionRoot, "quarantine")),
    receipts: await ensurePrivateDirectory(join(sessionRoot, "receipts")),
  };
  return { sessionId, ...directories };
}

async function closeHandle(handle) {
  try {
    await handle.close();
  } catch {
  }
}

export async function atomicWriteFile(filePath, content, { mode = FILE_MODE, replace = false } = {}) {
  const directory = dirname(filePath);
  const temporaryPath = join(directory, `.wake-${randomUUID()}.tmp`);
  let handle;
  try {
    handle = await open(temporaryPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, mode);
    await handle.writeFile(content, "utf8");
    await handle.sync();
    await handle.chmod(mode);
    await handle.close();
    handle = undefined;
    if (replace) {
      await rename(temporaryPath, filePath);
    } else {
      try {
        await link(temporaryPath, filePath);
      } catch (error) {
        if (error?.code === "EEXIST") throw new Error(`Refusing to replace existing wake file: ${filePath}`);
        throw error;
      }
      await unlink(temporaryPath);
    }
  } catch (error) {
    await closeHandle(handle);
    try {
      await unlink(temporaryPath);
    } catch {
    }
    throw error;
  }
  return filePath;
}

export async function atomicWriteJson(filePath, value, options) {
  return atomicWriteFile(filePath, `${JSON.stringify(value)}\n`, options);
}

export async function enqueueWakeEvent(sessionId, event, { home, now = Date.now() } = {}) {
  const sessionCheck = validateSessionId(sessionId);
  if (!sessionCheck.ok) throw new WakeValidationError(sessionCheck.reason);
  const eventCheck = validateEvent(event, now);
  if (!eventCheck.ok) throw new WakeValidationError(eventCheck.reason);

  const spool = await ensureSessionSpool(sessionId, home);
  const encoded = `${JSON.stringify(event)}\n`;
  if (byteLength(encoded) > MAX_EVENT_FILE_BYTES) throw new WakeValidationError("event_too_large");

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const fileName = `event-${event.event_id}-${randomUUID()}.json`;
    const filePath = join(spool.inbox, fileName);
    try {
      await lstat(filePath);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      await atomicWriteFile(filePath, encoded, { mode: FILE_MODE });
      return { event, fileName, filePath, spool };
    }
  }

  throw new Error("Could not allocate a unique wake event file name");
}