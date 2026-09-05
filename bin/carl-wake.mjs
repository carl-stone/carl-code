#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import {
  enqueueWakeEvent,
  EVENT_TYPES,
  WakeValidationError,
} from "../packages/harness/extensions/wake-channel-core.mjs";

const USAGE = `Usage:
  node bin/carl-wake.mjs --session-id ID --type TYPE --project PROJECT --phase PHASE --root ROOT --summary SUMMARY [--event-id ID] [--created-at ISO]
  node bin/carl-wake.mjs --session-id ID --event-json JSON

Types: ${EVENT_TYPES.join(", ")}`;

function fail(message) {
  throw new Error(message);
}

function parseArguments(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") return { help: true };
    if (!argument.startsWith("--")) fail(`Unknown argument: ${argument}`);
    const equals = argument.indexOf("=");
    const name = equals === -1 ? argument : argument.slice(0, equals);
    let value = equals === -1 ? argv[++index] : argument.slice(equals + 1);
    if (value === undefined || value.length === 0) fail(`Missing value for ${name}`);
    if (values.has(name)) fail(`Duplicate argument: ${name}`);
    values.set(name, value);
  }
  return Object.fromEntries(values);
}

function buildEvent(options) {
  if (options["--event-json"] !== undefined) {
    const allowed = new Set(["--session-id", "--event-json"]);
    for (const name of Object.keys(options)) {
      if (!allowed.has(name)) fail("--event-json cannot be combined with event field arguments");
    }
    try {
      return JSON.parse(options["--event-json"]);
    } catch {
      fail("--event-json must contain valid JSON");
    }
  }

  const required = ["--type", "--project", "--phase", "--root", "--summary"];
  for (const name of required) {
    if (options[name] === undefined) fail(`Missing required argument: ${name}`);
  }
  const allowed = new Set([
    "--session-id",
    "--type",
    "--project",
    "--phase",
    "--root",
    "--summary",
    "--event-id",
    "--created-at",
  ]);
  for (const name of Object.keys(options)) {
    if (!allowed.has(name)) fail(`Unknown argument: ${name}`);
  }

  return {
    event_id: options["--event-id"] ?? randomUUID(),
    type: options["--type"],
    project: options["--project"],
    phase: options["--phase"],
    root: options["--root"],
    summary: options["--summary"],
    created_at: options["--created-at"] ?? new Date().toISOString(),
  };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${USAGE}\n`);
    return;
  }
  if (options["--session-id"] === undefined) fail("Missing required argument: --session-id");

  const event = buildEvent(options);
  const result = await enqueueWakeEvent(options["--session-id"], event);
  process.stdout.write(`${JSON.stringify({
    session_id: options["--session-id"],
    event_id: event.event_id,
    file_path: result.filePath,
  })}\n`);
}

try {
  await main();
} catch (error) {
  const message = error instanceof WakeValidationError
    ? error.reason
    : error instanceof Error
      ? error.message
      : String(error);
  console.error(`carl-wake: ${message}`);
  console.error(USAGE);
  process.exitCode = 2;
}