# granola-export

Automated backup of Granola meeting notes and transcripts to local markdown files.

## Quick Start

```bash
git clone <repo-url>
cd granola-export
./setup.sh
```

`setup.sh` runs the initial export and installs a daily launchd job (10pm).

## How It Works

1. Reads meeting metadata from Granola's local cache (`cache-v6.json` or earlier)
2. Fetches full transcripts from Granola's API (`/v1/get-document-transcript`)
3. Writes one markdown file per meeting to `notes/`
4. Tracks export state in `notes/.export-state.json` for incremental updates
5. Re-checks meetings that previously had no transcript available

The local cache rarely contains transcripts — the API is the primary transcript source. Auth tokens are extracted from Granola's `supabase.json` (WorkOS or Cognito format).

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
