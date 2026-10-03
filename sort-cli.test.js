import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CLI = path.join(path.dirname(fileURLToPath(import.meta.url)), "sort-cli.js");
const run = (...args) =>
	spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8" });

let tmp;

beforeEach(() => {
	tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sort-files-"));
});

afterEach(() => {
	fs.rmSync(tmp, { recursive: true, force: true });
});

describe("CLI", () => {
	it("prints the package version", () => {
		const { version } = JSON.parse(
			fs.readFileSync(path.join(path.dirname(CLI), "package.json"), "utf8")
		);
		expect(run("--version").stdout.trim()).toBe(version);
	});

	it("sorts a directory and reverts it", () => {
		fs.writeFileSync(path.join(tmp, "photo.jpg"), "x");

		expect(run(tmp).status).toBe(0);
		expect(fs.existsSync(path.join(tmp, "images", "photo.jpg"))).toBe(true);

		expect(run(tmp, "--revert").status).toBe(0);
		expect(fs.existsSync(path.join(tmp, "photo.jpg"))).toBe(true);
		expect(fs.existsSync(path.join(tmp, "images"))).toBe(false);
	});

	it("prints each planned move in a dry run without touching files", () => {
		fs.writeFileSync(path.join(tmp, "photo.jpg"), "x");

		const { stdout, status } = run(tmp, "--dry-run");

		expect(status).toBe(0);
		expect(stdout).toContain("Would move: photo.jpg");
		expect(fs.existsSync(path.join(tmp, "photo.jpg"))).toBe(true);
	});

	it("exits non-zero for a missing directory", () => {
		const { status, stderr, stdout } = run(path.join(tmp, "nope"));

		expect(status).toBe(1);
		expect(stdout + stderr).toContain("Directory not found");
	});

	it("runs when launched through a symlink (as npm bin links do)", () => {
		const link = path.join(tmp, "some-other-name");
		fs.symlinkSync(CLI, link);
		const target = fs.mkdtempSync(path.join(tmp, "target-"));
		fs.writeFileSync(path.join(target, "a.pdf"), "x");

		execFileSync(process.execPath, [link, target]);

		expect(fs.existsSync(path.join(target, "documents", "a.pdf"))).toBe(true);
	});
});
