# Granola Backup

Automated backup of Granola meeting notes to local markdown files.

## Structure

```
granola-backup/
├── CLAUDE.md          # This file
├── export.ts          # Export script (Bun)
└── notes/             # Exported meeting notes
    ├── .export-state.json  # Tracks what's been exported
    └── YYYY-MM-DD - Title.md
```

## Why This Exists

Granola's free plan only keeps notes accessible for ~30 days. This exports all meeting notes, metadata, and transcripts as markdown files so they persist locally forever.

## How It Works

`export.ts` reads Granola's local cache file (`~/Library/Application Support/Granola/cache-v6.json`). This is the single source of truth — the desktop app writes it, we read it. For transcripts not in the cache, the script falls back to Granola's API using the auth token from `~/Library/Application Support/Granola/supabase.json`.

The script is incremental: `.export-state.json` tracks each document's `updated_at` timestamp. Only new or modified meetings get re-exported.

## Automated Schedule

A launchd agent runs the export daily at 10pm:
- Plist: `~/Library/LaunchAgents/com.tejas.granola-export.plist`
- Log: `/tmp/granola-export.log`

## Commands

```bash
# Run export manually
bun run ~/workspace/granola-backup/export.ts

# Check launchd status
launchctl list | grep granola

# View last run log
cat /tmp/granola-export.log
```

## Granola CLI (separate tool)

`granola` binary is installed globally for interactive queries:

```bash
granola list              # Recent meetings
granola search "topic"    # Search by keyword
granola show <id>         # Full meeting details
granola transcript <id>   # Meeting transcript
granola sync              # Refresh from API
```

Note: We patched the CLI source at `/tmp/granola-cli/` to support cache-v6.json. Rebuild with: `cd /tmp/granola-cli && bun build ./src/cli.ts --compile --outfile /usr/local/bin/granola`

## Dependencies

- Bun runtime (`~/.bun/bin/bun`)
- Granola desktop app (installed and logged in)
