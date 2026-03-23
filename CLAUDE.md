# granola-export

Automated backup of Granola meeting notes and transcripts to local markdown files.

## Quick Start

```bash
git clone https://github.com/tejasdc/granola-export.git
cd granola-export
./setup.sh
```

`setup.sh` runs the initial export and installs a daily launchd job (10pm).

## How It Works

Two data sources, each providing what the other lacks:

- **Local cache** (`cache-v6.json` or earlier) → meeting list, titles, dates, attendees, notes. The API doesn't expose this metadata reliably (`/v2/get-documents` rejects non-Granola clients, `/v1/get-document-metadata` only returns creator/attendees).
- **Granola API** (`/v1/get-document-transcript`) → full transcripts. The cache rarely has these (only 1 of 35 meetings in testing).

Auth tokens are extracted from `supabase.json` — tries WorkOS tokens first (new auth), falls back to Cognito (legacy). Both are serialized JSON strings inside the file.

The export tracks state in `notes/.export-state.json`:
- Skips unchanged meetings where the file still exists on disk
- Only fetches transcripts from the API for meetings within the last 10 days (Granola processes transcripts shortly after meetings, so older ones won't gain new transcripts)
- Re-exports if a file was deleted from disk

## Usage

```bash
bun run export.ts                     # export to ./notes/
bun run export.ts --output ~/backup   # export to custom directory
bun run export.ts --force             # re-export everything
```

## File Structure

- `export.ts` — the exporter (single file, no dependencies beyond Bun)
- `setup.sh` — installs launchd job and runs initial export
- `notes/` — exported markdown files (gitignored)
- `CLAUDE.md` — this file

## Requirements

- macOS (Linux paths supported but launchd is macOS-only)
- [Bun](https://bun.sh) runtime
- Granola desktop app installed and logged in

## Platform Support

Cache and auth paths are detected per-platform:
- macOS: `~/Library/Application Support/Granola/`
- Linux: `~/.config/Granola/`
- Windows: `~/AppData/Roaming/Granola/`

Cache versions v3 through v6 are auto-detected.
