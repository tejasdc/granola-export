#!/usr/bin/env bun
/**
 * Granola Meeting Notes Exporter
 *
 * Reads meeting metadata from Granola's local cache, then fetches full
 * transcripts from the Granola API (the cache rarely has them).
 * Outputs one markdown file per meeting into a configurable output directory.
 *
 * Usage:
 *   bun run export.ts                     # exports to ./notes/
 *   bun run export.ts --output ~/backup   # exports to ~/backup/
 *   bun run export.ts --force             # re-export everything
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { homedir, platform } from "node:os";

const API_BASE = "https://api.granola.ai";

// -- Platform-aware paths --

function getGranolaCachePath(): string {
  const paths: Record<string, string[]> = {
    darwin: ["Library/Application Support/Granola"],
    linux: [".config/Granola"],
    win32: ["AppData/Roaming/Granola"],
  };
  const dir = join(homedir(), ...(paths[platform()] || paths.darwin));

  // Try cache versions in descending order
  for (const version of ["cache-v6.json", "cache-v5.json", "cache-v4.json", "cache-v3.json"]) {
    const path = join(dir, version);
    if (existsSync(path)) return path;
  }
  return join(dir, "cache-v6.json"); // default even if missing, so error message is clear
}

function getSupabasePath(): string {
  const paths: Record<string, string[]> = {
    darwin: ["Library/Application Support/Granola/supabase.json"],
    linux: [".config/Granola/supabase.json"],
    win32: ["AppData/Roaming/Granola/supabase.json"],
  };
  return join(homedir(), ...(paths[platform()] || paths.darwin));
}

function parseArgs(): { outputDir: string; force: boolean } {
  const args = process.argv.slice(2);
  let outputDir = join(dirname(resolve(process.argv[1])), "notes");
  let force = false;

  for (let i = 0; i < args.length; i++) {
    if ((args[i] === "--output" || args[i] === "-o") && args[i + 1]) {
      outputDir = resolve(args[++i]);
    } else if (args[i] === "--force" || args[i] === "-f") {
      force = true;
    }
  }
  return { outputDir, force };
}

// -- State tracking --

interface ExportedEntry {
  updatedAt: string;
  hasTranscript: boolean;
  filename: string;
}

interface ExportState {
  lastRun: string;
  exported: Record<string, ExportedEntry>;
}

function loadState(stateFile: string): ExportState {
  try {
    if (existsSync(stateFile)) {
      const data = JSON.parse(readFileSync(stateFile, "utf8"));
      if (data.exported) {
        for (const [id, val] of Object.entries(data.exported)) {
          if (typeof val === "string") {
            data.exported[id] = { updatedAt: val, hasTranscript: false, filename: "" };
          }
        }
      }
      return data;
    }
  } catch (err) {
    console.warn("Warning: could not read state file, starting fresh:", (err as Error).message);
  }
  return { lastRun: "", exported: {} };
}

function saveState(stateFile: string, state: ExportState) {
  const tmp = stateFile + ".tmp";
  writeFileSync(tmp, JSON.stringify(state, null, 2));
  renameSync(tmp, stateFile);
}

// -- Locking --

function acquireLock(lockFile: string): boolean {
  const { openSync, closeSync, fstatSync } = require("node:fs");
  try {
    // O_CREAT | O_EXCL is atomic — fails if file already exists
    const fd = openSync(lockFile, "wx");
    writeFileSync(fd, `${process.pid}\n${new Date().toISOString()}`);
    closeSync(fd);
    return true;
  } catch (err: any) {
    if (err.code !== "EEXIST") throw err;
    // Lock exists — check if stale
    try {
      const content = readFileSync(lockFile, "utf8");
      const timestamp = content.split("\n")[1] || content;
      const lockAge = Date.now() - new Date(timestamp).getTime();
      if (lockAge < 600_000) return false; // 10 minutes for API-heavy runs
      console.warn("Warning: stale lock file found (>10min), removing");
      unlinkSync(lockFile);
      return acquireLock(lockFile); // retry once
    } catch {
      return false;
    }
  }
}

function releaseLock(lockFile: string) {
  try { if (existsSync(lockFile)) unlinkSync(lockFile); } catch {}
}

// -- Token extraction --

function extractToken(): string {
  const supabasePath = getSupabasePath();
  try {
    if (!existsSync(supabasePath)) return "";
    const raw = JSON.parse(readFileSync(supabasePath, "utf8"));

    for (const field of ["workos_tokens", "cognito_tokens"]) {
      if (raw[field]) {
        const tokens = typeof raw[field] === "string" ? JSON.parse(raw[field]) : raw[field];
        if (tokens?.access_token) return tokens.access_token;
      }
    }
    return "";
  } catch {
    return "";
  }
}

// -- API --

async function fetchTranscript(token: string, docId: string): Promise<{ segments: any[]; error?: string }> {
  try {
    const response = await fetch(`${API_BASE}/v1/get-document-transcript`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ document_id: docId }),
    });

    if (response.status === 401 || response.status === 403) {
      return { segments: [], error: "auth_expired" };
    }
    if (!response.ok) {
      return { segments: [], error: `api_${response.status}` };
    }

    const data = await response.json();
    const segments = Array.isArray(data) ? data : data?.transcript || [];
    return { segments };
  } catch (err) {
    return { segments: [], error: (err as Error).message };
  }
}

// -- Formatting --

function sanitizeFilename(name: string): string {
  return name.replace(/[/\\:*?"<>|]/g, "-").replace(/\s+/g, " ").trim().slice(0, 100);
}

function formatDateLocal(dateStr?: string): string {
  if (!dateStr) return "unknown";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "unknown";
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  } catch { return "unknown"; }
}

function getAttendees(doc: any): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  const add = (name: string) => {
    const lower = name.toLowerCase();
    if (!seen.has(lower)) { seen.add(lower); result.push(name); }
  };

  for (const a of doc.google_calendar_event?.attendees || []) {
    const name = a.displayName || a.email || "";
    if (name) add(name);
  }
  if (doc.people) {
    const people = Array.isArray(doc.people) ? doc.people : Object.values(doc.people);
    for (const p of people as any[]) { if (p?.name) add(p.name); }
  }
  return result;
}

function formatTranscript(segments: any[]): string {
  if (!segments.length) return "";
  return segments.map((s) => {
    const speaker = s.speaker || s.speaker_name || s.source || "Unknown";
    const text = s.text || s.content || "";
    let time = "";
    if (s.start_timestamp) {
      try {
        const d = new Date(s.start_timestamp);
        time = `[${d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}]`;
      } catch {}
    } else if (s.start_time != null) {
      time = `[${Math.floor(s.start_time / 60)}:${String(Math.floor(s.start_time % 60)).padStart(2, "0")}]`;
    }
    return `**${speaker}** ${time}: ${text}`;
  }).join("\n\n");
}

function buildFilename(docDate: string, title: string, docId: string, used: Set<string>): string {
  const base = `${docDate} - ${sanitizeFilename(title)}`;
  let filename = `${base}.md`;
  if (used.has(filename)) filename = `${base} (${docId.slice(0, 8)}).md`;
  used.add(filename);
  return filename;
}

// -- Main --

async function main() {
  const { outputDir, force } = parseArgs();
  const stateFile = join(outputDir, ".export-state.json");
  const lockFile = join(outputDir, ".export.lock");

  mkdirSync(outputDir, { recursive: true });

  if (!acquireLock(lockFile)) {
    console.log("Another export is running. Exiting.");
    process.exit(0);
  }

  try {
    await runExport(outputDir, stateFile, force);
  } finally {
    releaseLock(lockFile);
  }
}

async function runExport(outputDir: string, stateFile: string, force: boolean) {
  const cachePath = getGranolaCachePath();

  if (!existsSync(cachePath)) {
    console.error(`Granola cache not found at ${cachePath}`);
    console.error("Is Granola installed and logged in?");
    process.exit(1);
  }

  let raw: any;
  try {
    raw = JSON.parse(readFileSync(cachePath, "utf8"));
  } catch (err) {
    console.error("Failed to parse Granola cache:", (err as Error).message);
    process.exit(1);
  }

  const cache = typeof raw.cache === "string" ? JSON.parse(raw.cache) : raw.cache;
  if (!cache?.state) {
    console.error("Unexpected cache format — missing state object");
    process.exit(1);
  }

  const documents = Object.values(cache.state.documents || {}) as any[];
  const cachedTranscripts = cache.state.transcripts || {};

  const token = extractToken();
  if (!token) console.warn("Warning: no API token found — will only use cached transcripts");

  const exportState = force ? { lastRun: "", exported: {} } as ExportState : loadState(stateFile);
  let newCount = 0, updatedCount = 0, skippedCount = 0, transcriptErrors = 0;
  let authExpired = false;

  const meetings = documents
    .filter((d) => !d.was_trashed && !d.deleted_at)
    .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());

  console.log(`Found ${meetings.length} meetings (cache: ${cachePath})`);

  const usedFilenames = new Set<string>();

  for (const doc of meetings) {
    const docDate = formatDateLocal(doc.google_calendar_event?.start?.dateTime || doc.created_at);
    const title = doc.title || "Untitled Meeting";
    const updatedAt = doc.updated_at || doc.created_at || "";

    const prev = exportState.exported[doc.id];
    const isUnchanged = prev && prev.updatedAt === updatedAt;

    if (isUnchanged && prev.hasTranscript) {
      skippedCount++;
      usedFilenames.add(prev.filename || buildFilename(docDate, title, doc.id, usedFilenames));
      continue;
    }

    const isUpdate = !!prev;
    const filename = buildFilename(docDate, title, doc.id, usedFilenames);
    const filepath = join(outputDir, filename);

    const attendees = getAttendees(doc);
    const notes = doc.notes_markdown || doc.notes_plain || "";

    let transcriptSegments = cachedTranscripts[doc.id] || [];
    if (!transcriptSegments.length && token && !authExpired) {
      const result = await fetchTranscript(token, doc.id);
      if (result.error === "auth_expired") {
        console.warn("  Warning: API token expired — transcript API disabled for this run");
        authExpired = true;
      } else if (result.error) {
        transcriptErrors++;
        console.warn(`  Warning: transcript fetch failed for "${title.slice(0, 40)}": ${result.error}`);
      }
      transcriptSegments = result.segments;
    }

    let md = `# ${title}\n\n`;
    md += `- **Date:** ${docDate}\n`;
    md += `- **ID:** ${doc.id}\n`;
    if (doc.google_calendar_event?.start?.dateTime) {
      try {
        const start = new Date(doc.google_calendar_event.start.dateTime);
        const end = doc.google_calendar_event.end?.dateTime
          ? new Date(doc.google_calendar_event.end.dateTime)
          : null;
        md += `- **Time:** ${start.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}`;
        if (end) md += ` - ${end.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}`;
        md += "\n";
      } catch {}
    }
    if (attendees.length) md += `- **Attendees:** ${attendees.join(", ")}\n`;
    if (doc.type) md += `- **Type:** ${doc.type}\n`;
    md += `- **Exported:** ${new Date().toISOString()}\n`;
    md += "\n---\n\n";

    if (notes) md += `## Notes\n\n${notes}\n\n`;
    if (transcriptSegments.length) md += `## Transcript\n\n${formatTranscript(transcriptSegments)}\n`;

    // Write new file first, THEN remove old one (prevents data loss on crash)
    writeFileSync(filepath, md);
    exportState.exported[doc.id] = { updatedAt, hasTranscript: transcriptSegments.length > 0, filename };

    if (prev?.filename && prev.filename !== filename) {
      const oldPath = join(outputDir, prev.filename);
      try { if (existsSync(oldPath)) unlinkSync(oldPath); } catch {}
      console.log(`  Renamed: ${prev.filename} -> ${filename}`);
    }

    console.log(`  ${isUpdate ? "Updated" : "Exported"}: ${filename} (${transcriptSegments.length} transcript segments)`);
    if (isUpdate) updatedCount++;
    else newCount++;
  }

  exportState.lastRun = new Date().toISOString();
  saveState(stateFile, exportState);

  console.log(`\nDone! ${newCount} new, ${updatedCount} updated, ${skippedCount} unchanged`);
  if (transcriptErrors > 0) console.log(`Warning: ${transcriptErrors} transcript errors (will retry next run)`);
  console.log(`Output: ${outputDir}`);
}

main().catch((err) => {
  console.error("Export failed:", err);
  process.exit(1);
});
