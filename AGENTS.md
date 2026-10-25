# Granola backup

This project runs a nightly local backup from the Mac's Granola installation. See [README.md](README.md) for the user-facing behavior, [docs/legacy-exporter.md](docs/legacy-exporter.md) for the original cache and transcript design, and [docs/2026-10-24-backup-outage.md](docs/2026-10-24-backup-outage.md) for the current outage and recovery boundary.

The exporter currently reads Granola's former plaintext cache. Current Granola versions use encrypted storage, so an absent document collection or zero meetings is an error. Do not mark the job healthy from a zero-count run or edit Granola's storage or sign-in to make it pass. Verify any replacement source against live meeting counts and exported files before describing the backup as restored.
