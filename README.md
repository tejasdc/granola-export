# granola-export

Export your [Granola](https://granola.ai) meeting notes and transcripts to local markdown files. A daily launchd job runs the exporter.

**Current status (October 2026):** Granola moved its notes from the plaintext cache this exporter reads into encrypted local storage. The exporter now exits with an error when that cache is absent, has no document collection, or reports zero meetings. Until a supported source is connected and a live export succeeds, the daily job is a failure signal, not a current backup.

## Why

Granola's free plan limits access to older notes. This tool exports everything — notes and full transcripts — to markdown files you own forever.

## Install

```bash
# requires Bun (https://bun.sh) and Granola desktop app
git clone https://github.com/tejasdc/granola-export.git
cd granola-export
./setup.sh
```

`setup.sh` runs the initial export and installs a daily launchd job (10pm). After that, exports happen automatically — you don't need to run anything manually.

## Manual Usage (optional)

You shouldn't need these for normal use. The daily automation handles everything. These are for troubleshooting or one-off situations:

```bash
bun run export.ts                     # run export manually (same as what the daily job does)
bun run export.ts --output ~/backup   # export to a different directory
bun run export.ts --force             # re-export everything from scratch
```

## Original Design

The original exporter combined Granola's former plaintext cache with its transcript API. This source is no longer current; see the status above.

The original export combined both sources:

1. **Local cache** → meeting list, titles, dates, attendees, notes
2. **Granola API** → full transcripts (the cache rarely has these)

The result is one markdown file per meeting with all available data.

Each exported file looks like:

```markdown
# Meeting Title

- Date: 2025-10-08
- Time: 02:30 PM - 03:15 PM
- Attendees: Alice, Bob
- Type: meeting

---

## Notes

[AI-generated meeting notes]

## Transcript

**You** [02:30:15 PM]: So let's talk about...
**Them** [02:30:20 PM]: Sure, I think we should...
```

## Original Recovery Behavior

The export recovers from any failure state:

- **Missed runs**: Next run catches up automatically — no data lost
- **Deleted files**: Re-exports if a file was removed from disk
- **No transcript yet**: Re-checks meetings within the last 10 days on each run
- **API down**: Notes still export from cache; transcripts retry next run
- **Expired token**: Detected and skipped (Granola desktop app refreshes tokens)
- **Concurrent runs**: Atomic lock file prevents conflicts
- **Crash mid-export**: New files written before old ones deleted; state saved atomically

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

## Credits

Inspired by [granola-cli](https://github.com/aaronvanston/granola-cli) by [Aaron Vanston](https://github.com/aaronvanston), which figured out how to extract auth tokens from Granola's local storage and call the transcript API.

## License

MIT
