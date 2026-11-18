import { closeSync, fsyncSync, mkdirSync, openSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// Stay inside Bun: a parent wrapper would change the scheduled reader's identity.
export function recordRunOnExit() {
  const startedAt = Date.now() / 1000;
  const startedTick = performance.now();
  const label = "com.granola-export.daily";
  const directory = join(homedir(), ".local/state/recurring-jobs/runs");
  const output = join(directory, `${label}.json`);

  process.once("exit", (exitCode) => {
    const receipt = {
      schemaVersion: 1,
      label,
      startedAt,
      endedAt: Date.now() / 1000,
      durationSeconds: (performance.now() - startedTick) / 1000,
      exitCode,
      // Resource costs are unmeasured; omission means unknown to the collector.
    };
    const temporary = join(directory, `.granola-run-${process.pid}-${crypto.randomUUID()}`);
    let fd: number | undefined;
    try {
      mkdirSync(directory, { recursive: true });
      fd = openSync(temporary, "wx", 0o600);
      writeFileSync(fd, JSON.stringify(receipt) + "\n");
      fsyncSync(fd);
      closeSync(fd);
      fd = undefined;
      renameSync(temporary, output);
    } catch (err) {
      console.error("Could not write Granola run receipt:", err);
    } finally {
      if (fd !== undefined) { try { closeSync(fd); } catch {} }
      try { unlinkSync(temporary); } catch {}
    }
  });
}
