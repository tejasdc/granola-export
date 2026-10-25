# Granola backup outage, investigated 2026-10-24

## Confirmed

- The nightly launchd job logged 33 zero-meeting runs. The last exported Markdown note is dated 2026-04-21; `notes/.export-state.json` tracks 37 prior meetings.
- The former `cache-v6.json` had a version 8 state with no `documents` collection. Granola's app directory also held `cache-v6.json.enc` (1,404,124 bytes), `granola.db` (2,797,568 bytes), and `storage.dek` (51 bytes). The installed app's bundled code uses macOS safe storage for the encryption key and SQLCipher for the database.
- The installed Granola companion command exposed note-list, note-detail and transcript methods in its bundled code, but calls returned `APP_NOT_RUNNING`. Its bundled feature setting defaulted to disabled, and no `companion_cli` override was present in local state.
- The app was not running at the start of this investigation. After it was opened to test that command, Granola updated itself and its local app directory changed: `cache-v6.json` and `storage.dek` disappeared; `cache-v6.json.enc` became 22,245 bytes, `granola.db` became 4,096 bytes plus a 243,112-byte WAL, and `supabase.json.enc` became 30 bytes. Those files were not edited by this project. The exact reason Granola reinitialized them is unknown. No matching local APFS snapshot, Trash item, Spotlight copy, or workspace backup was found.
- On the new exporter commit, a manual run exited 1 and left the prior export state unchanged. A launchd kickstart also recorded exit code 1. The number of newly exported notes is **0**.

## Recovery boundary

The exporter cannot read the encrypted local files and the companion command is currently unavailable. Do not try to decrypt or rewrite Granola's app directory. Check Granola's account state with Tejas; only he can complete any sign-in. After access is restored, use a supported Granola read interface, compare its meeting count and most recent date with the Markdown output, then run the installed launchd job and confirm a zero exit and new files. Granola's [published API description](https://www.granola.ai/blog/granola-api-for-enterprise-audit-api-usage-analytics-and-compliance-archives) says Business and Enterprise plans can retrieve notes and transcripts with a user API key; plan and key availability for this account have not been established.
