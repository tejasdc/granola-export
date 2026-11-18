import { expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

function runFixture(prepare?: (home: string) => void) {
  const home = mkdtempSync(join(tmpdir(), "granola-receipt-"));
  try {
    prepare?.(home);
    const before = Date.now() / 1000;
    const result = spawnSync(process.execPath, ["run", join(import.meta.dir, "export.ts"), "--output", join(home, "output")], {
      env: { ...process.env, HOME: home, USERPROFILE: home }, encoding: "utf8", timeout: 10000,
    });
    const after = Date.now() / 1000;
    const receiptPath = join(home, ".local/state/recurring-jobs/runs/com.granola-export.daily.json");
    return { result, before, after, receiptPath, home };
  } catch (err) {
    rmSync(home, { recursive: true, force: true });
    throw err;
  }
}

for (const succeeds of [false, true]) {
  test(`actual exporter exit ${succeeds ? 0 : 1} records real timing and unknown cost`, () => {
    const fixture = runFixture(succeeds ? (home) => {
      const cacheDir = join(home, process.platform === "darwin" ? "Library/Application Support/Granola" : ".config/Granola");
      mkdirSync(cacheDir, { recursive: true });
      writeFileSync(join(cacheDir, "cache-v6.json"), JSON.stringify({ cache: { state: {
        documents: { fixture: { id: "fixture", title: "Fixture meeting", created_at: "2000-01-01T00:00:00Z" } },
      } } }));
    } : undefined);
    try {
      expect(fixture.result.status).toBe(succeeds ? 0 : 1);
      if (!succeeds) expect(fixture.result.stderr).toContain("This exporter cannot read Granola's encrypted storage; the backup did not run.");
      const receipt = JSON.parse(readFileSync(fixture.receiptPath, "utf8"));
      expect(receipt.schemaVersion).toBe(1);
      expect(receipt.label).toBe("com.granola-export.daily");
      expect(receipt.exitCode).toBe(fixture.result.status);
      expect(receipt.startedAt).toBeGreaterThanOrEqual(fixture.before);
      expect(receipt.endedAt).toBeGreaterThanOrEqual(receipt.startedAt);
      expect(receipt.endedAt).toBeLessThanOrEqual(fixture.after);
      expect(receipt.durationSeconds).toBeGreaterThanOrEqual(0);
      expect(receipt.durationSeconds).toBeLessThanOrEqual(fixture.after - fixture.before + 0.01);
      expect(receipt).not.toHaveProperty("cpuSeconds");
      expect(receipt).not.toHaveProperty("peakMemoryBytes");
      expect(statSync(fixture.receiptPath).mode & 0o777).toBe(0o600);
    } finally {
      rmSync(fixture.home, { recursive: true, force: true });
    }
  });
}

test("receipt storage failure preserves original export error and exit code", () => {
  const fixture = runFixture((home) => writeFileSync(join(home, ".local"), "blocked"));
  try {
    expect(fixture.result.status).toBe(1);
    expect(fixture.result.stderr).toContain("This exporter cannot read Granola's encrypted storage");
    expect(fixture.result.stderr).toContain("Could not write Granola run receipt:");
  } finally {
    rmSync(fixture.home, { recursive: true, force: true });
  }
});
