// packages.ts — carl-code harness extension
//
// Adds a `/packages` command that opens a TUI to enable/disable the resources
// bundled by each installed package (extensions, skills, prompts, themes), the
// same view `pi config` shows. On top of that plain per-item toggle it adds a
// package-wide "All" row: hit space on it to flip every resource of that
// package at once.
//
// Scope: the selector defaults to global resources (matching `pi config`).
// Tab switches to the project scope when the working directory is trusted.
// Project-scope writes follow the same +pattern / -pattern semantics as
// `pi config`, but inherited-global items are shown dimmed and read-only.
//
// When the flow closes after any change, the settings are flushed to disk and
// the session runs a `/reload` so the new resource set takes effect.

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { CONFIG_DIR_NAME, DefaultPackageManager, getAgentDir, SettingsManager, Theme } from "@earendil-works/pi-coding-agent";
import type { Component, KeybindingsManager, TUI } from "@earendil-works/pi-tui";
import { matchesKey, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { homedir } from "node:os";
import { basename, dirname, join, relative } from "node:path";

const RESOURCE_TYPES = ["extensions", "skills", "prompts", "themes"] as const;
type ResourceType = (typeof RESOURCE_TYPES)[number];
const RESOURCE_TYPE_LABELS: Record<ResourceType, string> = {
  extensions: "Extensions",
  skills: "Skills",
  prompts: "Prompts",
  themes: "Themes",
};
const TYPE_ORDER: Record<ResourceType, number> = { extensions: 0, skills: 1, prompts: 2, themes: 3 };

type WriteScope = "global" | "project";
type Row = { kind: "group"; group: Group } | { kind: "all"; group: Group } | { kind: "subgroup"; subgroup: Subgroup; group: Group } | { kind: "item"; item: Item; group: Group };

interface Item {
  path: string;
  enabled: boolean;
  metadata: { source: string; scope: string; origin: "package" | "top-level"; baseDir?: string };
  resourceType: ResourceType;
  displayName: string;
}
interface Subgroup {
  type: ResourceType;
  label: string;
  items: Item[];
}
interface Group {
  key: string;
  label: string;
  scope: string;
  origin: "package" | "top-level";
  source: string;
  subgroups: Subgroup[];
}

function formatBaseDir(baseDir: string): string {
  const homeDir = homedir();
  let displayPath: string;
  if (baseDir === homeDir) displayPath = "~";
  else if (baseDir.startsWith(homeDir)) displayPath = `~${baseDir.slice(homeDir.length).replace(/\\/g, "/")}`;
  else displayPath = baseDir.replace(/\\/g, "/");
  return displayPath.endsWith("/") ? displayPath : `${displayPath}/`;
}

function getGroupLabel(metadata: Item["metadata"], agentDir: string): string {
  if (metadata.origin === "package") return `${metadata.source} (${metadata.scope})`;
  if (metadata.source === "auto") {
    if (metadata.baseDir) return metadata.scope === "user" ? `User (${formatBaseDir(metadata.baseDir)})` : `Project (${formatBaseDir(metadata.baseDir)})`;
    return metadata.scope === "user" ? `User (${formatBaseDir(agentDir)})` : `Project (${CONFIG_DIR_NAME}/)`;
  }
  return metadata.scope === "user" ? "User settings" : "Project settings";
}

function buildGroups(resolved: { extensions: any[]; skills: any[]; prompts: any[]; themes: any[] }, agentDir: string): Group[] {
  const groupMap = new Map<string, Group>();
  const addToGroup = (resources: any[], resourceType: ResourceType) => {
    for (const res of resources) {
      const { path, enabled, metadata } = res;
      const groupKey = `${metadata.origin}:${metadata.scope}:${metadata.source}:${metadata.baseDir ?? ""}`;
      if (!groupMap.has(groupKey)) {
        groupMap.set(groupKey, {
          key: groupKey,
          label: getGroupLabel(metadata, agentDir),
          scope: metadata.scope,
          origin: metadata.origin,
          source: metadata.source,
          subgroups: [],
        });
      }
      const group = groupMap.get(groupKey)!;
      let subgroup = group.subgroups.find((sg) => sg.type === resourceType);
      if (!subgroup) {
        subgroup = { type: resourceType, label: RESOURCE_TYPE_LABELS[resourceType], items: [] };
        group.subgroups.push(subgroup);
      }
      const fileName = basename(path);
      const parentFolder = basename(dirname(path));
      let displayName: string;
      if (resourceType === "extensions" && parentFolder !== "extensions") displayName = `${parentFolder}/${fileName}`;
      else if (resourceType === "skills" && fileName === "SKILL.md") displayName = parentFolder;
      else displayName = fileName;
      subgroup.items.push({ path, enabled, metadata, resourceType, displayName });
    }
  };
  addToGroup(resolved.extensions, "extensions");
  addToGroup(resolved.skills, "skills");
  addToGroup(resolved.prompts, "prompts");
  addToGroup(resolved.themes, "themes");
  const groups = Array.from(groupMap.values());
  groups.sort((a, b) => {
    if (a.origin !== b.origin) return a.origin === "package" ? -1 : 1;
    if (a.scope !== b.scope) return a.scope === "user" ? -1 : 1;
    return a.source.localeCompare(b.source);
  });
  for (const group of groups) {
    group.subgroups.sort((a, b) => TYPE_ORDER[a.type] - TYPE_ORDER[b.type]);
    for (const subgroup of group.subgroups) subgroup.items.sort((a, b) => a.displayName.localeCompare(b.displayName));
  }
  return groups;
}

function stripPrefix(p: string): string {
  return p.startsWith("!") || p.startsWith("+") || p.startsWith("-") ? p.slice(1) : p;
}

function getResourcePattern(item: Item, agentDir: string, cwd: string): string {
  const baseDir = item.metadata.baseDir ?? (item.metadata.scope === "project" ? join(cwd, CONFIG_DIR_NAME) : agentDir);
  return relative(baseDir, item.path);
}

function getPackageResourcePattern(item: Item): string {
  const baseDir = item.metadata.baseDir ?? dirname(item.path);
  return relative(baseDir, item.path);
}

class PackagesSelector implements Component {
  private sm: SettingsManager;
  private agentDir: string;
  private cwd: string;
  private groupsByScope: Record<WriteScope, Group[]>;
  private rows: Row[] = [];
  private selectedIndex = 0;
  private maxVisible: number;
  private writeScope: WriteScope;
  private projectModeAvailable: boolean;
  private changed = false;
  private tui: TUI;
  private theme: Theme;
  private kb: KeybindingsManager;
  private done: (result: { changed: boolean }) => void;

  constructor(opts: {
    sm: SettingsManager;
    agentDir: string;
    cwd: string;
    groupsByScope: Record<WriteScope, Group[]>;
    projectModeAvailable: boolean;
    tui: TUI;
    theme: Theme;
    keybindings: KeybindingsManager;
    done: (result: { changed: boolean }) => void;
  }) {
    this.sm = opts.sm;
    this.agentDir = opts.agentDir;
    this.cwd = opts.cwd;
    this.groupsByScope = opts.groupsByScope;
    this.projectModeAvailable = opts.projectModeAvailable;
    this.tui = opts.tui;
    this.theme = opts.theme;
    this.kb = opts.keybindings;
    this.done = opts.done;
    this.writeScope = "global";
    this.maxVisible = Math.max(5, (opts.tui.terminal.rows ?? 24) - 8);
    this.buildFlatList();
  }

  private get scopeGroups(): Group[] {
    return this.groupsByScope[this.writeScope];
  }

  private buildFlatList() {
    this.rows = [];
    for (const group of this.scopeGroups) {
      this.rows.push({ kind: "group", group });
      const isInheritedProject = this.writeScope === "project" && group.scope === "user";
      if (group.origin === "package" && !isInheritedProject) {
        this.rows.push({ kind: "all", group });
      }
      for (const subgroup of group.subgroups) {
        this.rows.push({ kind: "subgroup", subgroup, group });
        for (const item of subgroup.items) this.rows.push({ kind: "item", item, group });
      }
    }
    this.selectedIndex = this.rows.findIndex((r) => this.isSelectable(r));
    if (this.selectedIndex < 0) this.selectedIndex = 0;
  }

  private isSelectable(row: Row): boolean {
    if (row.kind === "all") return true;
    if (row.kind === "item") return !this.isDimmedItem(row.item);
    return false;
  }

  private isDimmedItem(item: Item): boolean {
    return this.writeScope === "project" && item.metadata.scope === "user";
  }

  private findNextItem(fromIndex: number, direction: number): number {
    let idx = fromIndex + direction;
    while (idx >= 0 && idx < this.rows.length) {
      if (this.isSelectable(this.rows[idx])) return idx;
      idx += direction;
    }
    return fromIndex;
  }

  private allEnabled(group: Group): boolean {
    return group.subgroups.every((sg) => sg.items.length > 0) && group.subgroups.every((sg) => sg.items.every((i) => i.enabled));
  }

  private getScopeSettings() {
    return this.writeScope === "project" ? this.sm.getProjectSettings() : this.sm.getGlobalSettings();
  }

  private findPackageIndex(packages: any[], source: string): number {
    return packages.findIndex((pkg) => (typeof pkg === "string" ? pkg : pkg.source) === source);
  }

  private persistPackages(packages: any[]) {
    if (this.writeScope === "project") this.sm.setProjectPackages(packages);
    else this.sm.setPackages(packages);
  }

  private toggleTopLevelResource(item: Item, enabled: boolean) {
    const settings = this.getScopeSettings();
    const arrayKey = item.resourceType;
    const current = (settings[arrayKey] ?? []) as string[];
    const pattern = getResourcePattern(item, this.agentDir, this.cwd);
    const updated = current.filter((p) => stripPrefix(p) !== pattern);
    updated.push(enabled ? `+${pattern}` : `-${pattern}`);
    if (this.writeScope === "project") {
      if (arrayKey === "extensions") this.sm.setProjectExtensionPaths(updated);
      else if (arrayKey === "skills") this.sm.setProjectSkillPaths(updated);
      else if (arrayKey === "prompts") this.sm.setProjectPromptTemplatePaths(updated);
      else this.sm.setProjectThemePaths(updated);
    } else {
      if (arrayKey === "extensions") this.sm.setExtensionPaths(updated);
      else if (arrayKey === "skills") this.sm.setSkillPaths(updated);
      else if (arrayKey === "prompts") this.sm.setPromptTemplatePaths(updated);
      else this.sm.setThemePaths(updated);
    }
  }

  private togglePackageResource(item: Item, enabled: boolean) {
    const packages = [...(this.getScopeSettings().packages ?? [])];
    const pkgIndex = this.findPackageIndex(packages, item.metadata.source);
    if (pkgIndex === -1) return;
    let pkg = packages[pkgIndex];
    if (typeof pkg === "string") {
      pkg = { source: pkg };
      packages[pkgIndex] = pkg;
    }
    const arrayKey = item.resourceType;
    const current = (pkg[arrayKey] ?? []) as string[];
    const pattern = getPackageResourcePattern(item);
    const updated = current.filter((p) => stripPrefix(p) !== pattern);
    updated.push(enabled ? `+${pattern}` : `-${pattern}`);
    pkg[arrayKey] = updated.length > 0 ? updated : undefined;
    const hasFilters = RESOURCE_TYPES.some((k) => pkg[k] !== undefined);
    if (!hasFilters) packages[pkgIndex] = pkg.source;
    this.persistPackages(packages);
  }

  private updateItem(item: Item, enabled: boolean) {
    item.enabled = enabled;
    for (const group of this.scopeGroups) {
      for (const subgroup of group.subgroups) {
        const found = subgroup.items.find((i) => i.path === item.path && i.resourceType === item.resourceType);
        if (found) {
          found.enabled = enabled;
          return;
        }
      }
    }
  }

  private toggleAll(group: Group) {
    const packages = [...(this.getScopeSettings().packages ?? [])];
    const pkgIndex = this.findPackageIndex(packages, group.source);
    if (pkgIndex === -1) return;
    const target = !this.allEnabled(group);
    if (target) {
      packages[pkgIndex] = group.source;
    } else {
      const empty: Record<string, string[]> = {};
      for (const type of RESOURCE_TYPES) empty[type] = [];
      packages[pkgIndex] = { source: group.source, ...empty };
    }
    this.persistPackages(packages);
    for (const subgroup of group.subgroups) for (const item of subgroup.items) item.enabled = target;
    this.changed = true;
    this.tui.requestRender();
  }

  private toggleItem(item: Item) {
    const enabled = !item.enabled;
    if (item.metadata.origin === "top-level") this.toggleTopLevelResource(item, enabled);
    else this.togglePackageResource(item, enabled);
    this.updateItem(item, enabled);
    this.changed = true;
    this.tui.requestRender();
  }

  private switchWriteScope() {
    this.writeScope = this.writeScope === "global" ? "project" : "global";
    this.buildFlatList();
    this.tui.requestRender();
  }

  invalidate() {}

  render(width: number): string[] {
    const lines: string[] = [];
    const title = this.theme.bold(this.writeScope === "project" ? "Project Local Resources" : "Global Resources");
    const sep = this.theme.fg("muted", " · ");
    const switchHint = this.projectModeAvailable ? this.theme.fg("muted", "tab switch") + sep : "";
    const actionHint = this.theme.fg("muted", "space toggle");
    const hint = this.theme.fg("muted", "esc close");
    const spacing = Math.max(1, width - visibleWidth(title) - visibleWidth(switchHint + actionHint + sep + hint));
    lines.push(truncateToWidth(`${title}${" ".repeat(spacing)}${switchHint}${actionHint}${sep}${hint}`, width, ""));
    const scopeHint = this.writeScope === "project"
      ? this.theme.fg("muted", `${CONFIG_DIR_NAME}/settings.json · inherited global resources are dimmed`)
      : this.theme.fg("muted", `~/${CONFIG_DIR_NAME}/agent/settings.json`);
    lines.push(truncateToWidth(scopeHint, width, ""));
    lines.push("");

    if (this.rows.length === 0) {
      lines.push(this.theme.fg("muted", "  No resources found"));
      return lines;
    }
    const startIndex = Math.max(0, Math.min(this.selectedIndex - Math.floor(this.maxVisible / 2), this.rows.length - this.maxVisible));
    const endIndex = Math.min(startIndex + this.maxVisible, this.rows.length);
    for (let i = startIndex; i < endIndex; i++) {
      const row = this.rows[i];
      const isSelected = i === this.selectedIndex;
      if (row.kind === "group") {
        const inherited = this.writeScope === "project" && row.group.scope === "user";
        const label = this.theme.bold(`${row.group.label}${inherited ? " · inherited global" : ""}`);
        lines.push(truncateToWidth(`  ${this.theme.fg(inherited ? "dim" : "accent", label)}`, width, ""));
      } else if (row.kind === "all") {
        const cursor = isSelected ? "> " : "  ";
        const enabled = this.allEnabled(row.group);
        const checkbox = this.theme.fg(enabled ? "success" : "dim", enabled ? "[x]" : "[ ]");
        const name = this.theme.bold("All resources");
        lines.push(truncateToWidth(`${cursor}    ${checkbox} ${name}`, width, "..."));
      } else if (row.kind === "subgroup") {
        const color = this.writeScope === "project" && row.group.scope === "user" ? "dim" : "muted";
        lines.push(truncateToWidth(`    ${this.theme.fg(color, row.subgroup.label)}`, width, ""));
      } else {
        const item = row.item;
        const dimmed = this.isDimmedItem(item);
        const cursor = isSelected && !dimmed ? "> " : "  ";
        const checkbox = this.theme.fg(item.enabled ? "success" : "dim", item.enabled ? "[x]" : "[ ]");
        const nameText = isSelected && !dimmed ? this.theme.bold(item.displayName) : item.displayName;
        const name = dimmed ? this.theme.fg("dim", nameText) : nameText;
        lines.push(truncateToWidth(`${cursor}    ${checkbox} ${name}`, width, "..."));
      }
    }
    if (startIndex > 0 || endIndex < this.rows.length) {
      const count = this.rows.filter((r) => this.isSelectable(r)).length;
      const current = this.rows.slice(0, this.selectedIndex).filter((r) => this.isSelectable(r)).length + 1;
      lines.push(this.theme.fg("dim", `  (${current}/${count})`));
    }
    return lines;
  }

  handleInput(data: string): void {
    if (this.kb.matches(data, "tui.select.up")) {
      this.selectedIndex = this.findNextItem(this.selectedIndex, -1);
      return;
    }
    if (this.kb.matches(data, "tui.select.down")) {
      this.selectedIndex = this.findNextItem(this.selectedIndex, 1);
      return;
    }
    if (this.kb.matches(data, "tui.select.pageUp")) {
      let target = Math.max(0, this.selectedIndex - this.maxVisible);
      while (target < this.rows.length && !this.isSelectable(this.rows[target])) target++;
      if (target < this.rows.length) this.selectedIndex = target;
      return;
    }
    if (this.kb.matches(data, "tui.select.pageDown")) {
      let target = Math.min(this.rows.length - 1, this.selectedIndex + this.maxVisible);
      while (target >= 0 && !this.isSelectable(this.rows[target])) target--;
      if (target >= 0) this.selectedIndex = target;
      return;
    }
    if (this.kb.matches(data, "tui.select.cancel")) {
      this.done({ changed: this.changed });
      return;
    }
    if (matchesKey(data, "ctrl+c")) {
      this.done({ changed: this.changed });
      return;
    }
    if (this.kb.matches(data, "tui.input.tab")) {
      if (this.projectModeAvailable) this.switchWriteScope();
      return;
    }
    if (data === " " || this.kb.matches(data, "tui.select.confirm")) {
      const row = this.rows[this.selectedIndex];
      if (row?.kind === "all") this.toggleAll(row.group);
      else if (row?.kind === "item" && !this.isDimmedItem(row.item)) this.toggleItem(row.item);
      return;
    }
  }
}

export default function (pi: ExtensionAPI) {
  pi.registerCommand("packages", {
    description: "Enable or disable resources bundled by each installed package, then reload",
    handler: async (_args, ctx) => {
      if (ctx.mode !== "tui" || !ctx.hasUI) {
        ctx.ui.notify("/packages requires the interactive TUI", "warning");
        return;
      }
      const agentDir = getAgentDir();
      const cwd = ctx.cwd;
      const sm = SettingsManager.create(cwd, agentDir);
      const projectTrusted = sm.isProjectTrusted();

      const globalSm = SettingsManager.create(cwd, agentDir, { projectTrusted: false });
      const globalResolved = await new DefaultPackageManager({ cwd, agentDir, settingsManager: globalSm }).resolve(async () => "skip");
      const projectResolved = projectTrusted
        ? await new DefaultPackageManager({ cwd, agentDir, settingsManager: sm }).resolve(async () => "skip")
        : globalResolved;

      const groupsByScope: Record<WriteScope, Group[]> = {
        global: buildGroups(globalResolved, agentDir),
        project: buildGroups(projectResolved, agentDir),
      };

      const result = await ctx.ui.custom<{ changed: boolean }>((tui, theme, keybindings, done) => {
        return new PackagesSelector({ sm, agentDir, cwd, groupsByScope, projectModeAvailable: projectTrusted, tui, theme, keybindings, done });
      });

      if (result?.changed) {
        await sm.flush();
        ctx.ui.notify("/packages changed; reloading resources", "info");
        await ctx.reload();
      }
    },
  });
}
