#!/usr/bin/env bun
/**
 * Granola Meeting Notes Exporter
 * Exports all meeting notes and transcripts to ~/Documents/granola-export/
 * as individual markdown files. Runs incrementally — only exports new/updated notes.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";

const EXPORT_DIR = join(homedir(), "workspace/granola-backup/notes");
const STATE_FILE = join(EXPORT_DIR, ".export-state.json");
const CACHE_PATH = join(homedir(), "Library/Application Support/Granola/cache-v6.json");
const SUPABASE_PATH = join(homedir(), "Library/Application Support/Granola/supabase.json");

interface ExportState {
  lastRun: string;
  exported: Record<string, string>; // id -> updated_at
}

function loadState(): ExportState {
  if (existsSync(STATE_FILE)) {
    return JSON.parse(readFileSync(STATE_FILE, "utf8"));
  }
  return { lastRun: "", exported: {} };
}

function saveState(state: ExportState) {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function sanitizeFilename(name: string): string {
  return name
    .replace(/[/\\:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return "unknown";
  return new Date(dateStr).toISOString().split("T")[0];
}

function getAttendees(doc: any): string[] {
  const attendees: string[] = [];

  // From google calendar event
  const calAttendees = doc.google_calendar_event?.attendees || [];
  for (const a of calAttendees) {
    const name = a.displayName || a.email || "";
    if (name) attendees.push(name);
  }

  // From people field
  if (doc.people) {
    const people = Array.isArray(doc.people) ? doc.people : Object.values(doc.people);
    for (const p of people as any[]) {
      if (p?.name && !attendees.includes(p.name)) attendees.push(p.name);
    }
  }

  return attendees;
}

async function getTranscriptFromAPI(docId: string, token: string): Promise<any[]> {
  try {
    const response = await fetch("https://api.granola.ai/v1/get-document-transcript", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ document_id: docId }),
    });
    if (!response.ok) return [];
    const data = await response.json();
    return Array.isArray(data) ? data : data.transcript || [];
  } catch {
    return [];
  }
}

function formatTranscript(segments: any[]): string {
  if (!segments.length) return "";

  return segments
    .map((s) => {
      const speaker = s.speaker || s.speaker_name || "Unknown";
      const text = s.text || s.content || "";
      const time = s.start_time ? `[${Math.floor(s.start_time / 60)}:${String(Math.floor(s.start_time % 60)).padStart(2, "0")}]` : "";
      return `**${speaker}** ${time}: ${text}`;
    })
    .join("\n\n");
}

async function main() {
  mkdirSync(EXPORT_DIR, { recursive: true });

  // Load cache
  if (!existsSync(CACHE_PATH)) {
    console.error("Granola cache not found. Is Granola installed?");
    process.exit(1);
  }

  const raw = JSON.parse(readFileSync(CACHE_PATH, "utf8"));
  const cache = typeof raw.cache === "string" ? JSON.parse(raw.cache) : raw.cache;
  const state = cache.state;
  const documents = Object.values(state.documents || {}) as any[];
  const transcripts = state.transcripts || {};

  // Get API token for transcript fetching
  let token = "";
  if (existsSync(SUPABASE_PATH)) {
    const supabase = JSON.parse(readFileSync(SUPABASE_PATH, "utf8"));
    token = supabase.access_token || "";
  }

  const exportState = loadState();
  let newCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;

  const meetings = documents
    .filter((d) => !d.was_trashed)
    .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());

  console.log(`Found ${meetings.length} meetings in cache`);

  for (const doc of meetings) {
    const docDate = formatDate(doc.google_calendar_event?.start?.dateTime || doc.created_at);
    const title = doc.title || "Untitled Meeting";
    const updatedAt = doc.updated_at || doc.created_at || "";

    // Skip if already exported and not updated
    if (exportState.exported[doc.id] === updatedAt) {
      skippedCount++;
      continue;
    }

    const isUpdate = !!exportState.exported[doc.id];

    // Build filename: YYYY-MM-DD - Title.md
    const filename = `${docDate} - ${sanitizeFilename(title)}.md`;
    const filepath = join(EXPORT_DIR, filename);

    // Build markdown content
    const attendees = getAttendees(doc);
    const notes = doc.notes_markdown || doc.notes_plain || "";

    // Get transcript (from cache first, then API)
    let transcriptSegments = transcripts[doc.id] || [];
    if (!transcriptSegments.length && token && doc.type === "meeting") {
      transcriptSegments = await getTranscriptFromAPI(doc.id, token);
    }

    let md = `# ${title}\n\n`;
    md += `- **Date:** ${docDate}\n`;
    md += `- **ID:** ${doc.id}\n`;
    if (doc.google_calendar_event?.start?.dateTime) {
      const start = new Date(doc.google_calendar_event.start.dateTime);
      const end = doc.google_calendar_event.end?.dateTime ? new Date(doc.google_calendar_event.end.dateTime) : null;
      md += `- **Time:** ${start.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}`;
      if (end) md += ` - ${end.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}`;
      md += "\n";
    }
    if (attendees.length) {
      md += `- **Attendees:** ${attendees.join(", ")}\n`;
    }
    if (doc.type) {
      md += `- **Type:** ${doc.type}\n`;
    }
    md += `- **Exported:** ${new Date().toISOString()}\n`;
    md += "\n---\n\n";

    if (notes) {
      md += `## Notes\n\n${notes}\n\n`;
    }

    if (transcriptSegments.length) {
      md += `## Transcript\n\n${formatTranscript(transcriptSegments)}\n`;
    }

    writeFileSync(filepath, md);
    exportState.exported[doc.id] = updatedAt;

    if (isUpdate) {
      updatedCount++;
      console.log(`  Updated: ${filename}`);
    } else {
      newCount++;
      console.log(`  Exported: ${filename}`);
    }
  }

  exportState.lastRun = new Date().toISOString();
  saveState(exportState);

  console.log(`\nDone! ${newCount} new, ${updatedCount} updated, ${skippedCount} unchanged`);
  console.log(`Export directory: ${EXPORT_DIR}`);
}

main().catch(console.error);
