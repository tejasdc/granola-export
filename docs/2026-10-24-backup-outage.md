# Granola backup outage, investigated 2026-10-24

## Confirmed

- The nightly launchd job logged 33 zero-meeting runs. The last exported Markdown note is dated 2026-04-21; `notes/.export-state.json` tracks 37 prior meetings.
- The former `cache-v6.json` had a version 8 state with no `documents` collection. Granola's app directory also held `cache-v6.json.enc` (1,404,124 bytes), `granola.db` (2,797,568 bytes), and `storage.dek` (51 bytes). The installed app's bundled code uses macOS safe storage for the encryption key and SQLCipher for the database.
- The installed Granola companion command exposed note-list, note-detail and transcript methods in its bundled code, but calls returned `APP_NOT_RUNNING`. Its bundled feature setting defaulted to disabled, and no `companion_cli` override was present in local state.
- The app was not running at the start of this investigation. After it was opened to test that command, Granola updated itself and its local app directory changed: `cache-v6.json` and `storage.dek` disappeared; `cache-v6.json.enc` became 22,245 bytes, `granola.db` became 4,096 bytes plus a 243,112-byte WAL, and `supabase.json.enc` became 30 bytes. Those files were not edited by this project. The exact reason Granola reinitialized them is unknown. No matching local APFS snapshot, Trash item, Spotlight copy, or workspace backup was found.
- On the new exporter commit, a manual run exited 1 and left the prior export state unchanged. A launchd kickstart also recorded exit code 1. The number of newly exported notes is **0**.

## Recovery boundary

The exporter cannot read the encrypted local files and the companion command is currently unavailable. Do not try to decrypt or rewrite Granola's app directory. Check Granola's account state with Tejas; only he can complete any sign-in. After access is restored, use a supported Granola read interface, compare its meeting count and most recent date with the Markdown output, then run the installed launchd job and confirm a zero exit and new files. Granola's [published API description](https://www.granola.ai/blog/granola-api-for-enterprise-audit-api-usage-analytics-and-compliance-archives) says Business and Enterprise plans can retrieve notes and transcripts with a user API key; plan and key availability for this account have not been established.

## Supported read paths, checked 2026-11-11

- On 2026-11-11 the Mac had no readable Granola sign-in: the app was not running, its app directory had not changed since 2026-10-24 21:58, and the third-party `granola check` found neither an API token nor a local cache. The nightly job's last exit status is 1, which is correct.
- **Granola public API** (`https://public-api.granola.ai/v1/notes`, with `include=transcript` or `/v1/notes/{id}/transcript`): uses a personal API key created in the desktop app under Settings → Connectors → API keys. Keys are available **only on Business or Enterprise plans** and can expire. It returns only notes that have a generated summary and transcript. Rate limit: burst of 25, then 5 requests per second. Because this is a cloud API, the backup no longer needs the Mac: with a key, it could run on the server, which keeps credentials off the Mac. [API key docs](https://docs.granola.ai/help-center/sharing/integrations/granola-api), [API reference](https://docs.granola.ai/introduction).
- **Granola MCP** (`https://mcp.granola.ai/mcp`): browser OAuth sign-in on any plan. On Basic (free), it reaches only the last 30 days of notes and has no transcript tool. That makes it a poor archive source unless the plan is paid. [MCP docs](https://docs.granola.ai/help-center/sharing/integrations/mcp).
- The next step needs Tejas: sign in to the Granola app, confirm the plan, and, on Business, create a personal-notes key and deliver it through the credential portal. Until then the job keeps exiting 1.
