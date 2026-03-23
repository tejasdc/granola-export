# granola-export

Export your [Granola](https://granola.ai) meeting notes and transcripts to local markdown files. Runs daily via launchd so you always have a local backup.

## Why

Granola's free plan limits access to older notes. This tool exports everything — notes and full transcripts — to markdown files you own forever.

## Install

```bash
# requires Bun (https://bun.sh) and Granola desktop app
git clone https://github.com/tejasdc/granola-export.git
cd granola-export
./setup.sh
```

`setup.sh` runs the initial export and installs a daily launchd job at 10pm.

## Usage

```bash
bun run export.ts                     # export to ./notes/
bun run export.ts --output ~/backup   # export to custom directory
bun run export.ts --force             # re-export everything
```

## How It Works

1. Reads meeting metadata from Granola's local cache file
2. Fetches full transcripts from Granola's API (the cache rarely has them)
3. Writes one markdown file per meeting with metadata, notes, and transcript
4. Tracks state for incremental updates — only re-exports new or changed meetings
5. Re-checks meetings that previously had no transcript
6. Validates files on disk — re-exports if a file is missing or corrupted

Each exported file looks like:

```markdown
# Meeting Title

- Date: 2025-10-08
- Time: 02:30 PM - 03:15 PM
- Attendees: Alice, Bob
- Type: meeting

---

## Notes

[Meeting notes content]

## Transcript

**You** [02:30:15 PM]: So let's talk about...
**Them** [02:30:20 PM]: Sure, I think we should...
```

## Resilience

The export is designed to recover from failures:

- **Missed runs**: Next run catches up automatically
- **Missing files**: Re-exports if a file was deleted or is suspiciously small
- **No transcript yet**: Re-checks on every run until transcript is available
- **API failures**: Notes still export; transcripts retry next run
- **Expired token**: Detected and skipped gracefully (Granola app refreshes it)
- **Concurrent runs**: Atomic lock file prevents conflicts
- **Crash safety**: New files written before old ones deleted; state saved atomically via temp+rename

## Requirements

- macOS (launchd scheduling is macOS-only; the exporter itself works on Linux/Windows)
- [Bun](https://bun.sh) runtime
- [Granola](https://granola.ai) desktop app installed and logged in

## For AI Agents

If you're an AI agent setting this up for a user:

1. Clone the repo anywhere — paths are relative to the script location
2. Run `./setup.sh` — it handles everything (initial export + launchd install)
3. The `notes/` directory is gitignored — it contains the user's private meeting data
4. See `CLAUDE.md` for technical details on cache format and API behavior

## License

MIT
