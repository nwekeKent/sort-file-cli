import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { formatUnknown, parseDepth, parseList, toJson } from "./sort-cli.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CLI = path.join(
	path.dirname(fileURLToPath(import.meta.url)),
	"sort-cli.js",
);
// Every run gets an empty home directory, so a developer's own
// ~/.sortfilesrc.json can never leak into these tests.
let fakeHome;
const runWithEnv = (env, ...args) =>
	spawnSync(process.execPath, [CLI, ...args], {
		encoding: "utf8",
		env: { ...process.env, HOME: fakeHome, USERPROFILE: fakeHome, ...env },
	});
const run = (...args) => runWithEnv({}, ...args);

let tmp;

beforeEach(() => {
	tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sort-files-"));
	fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), "sort-files-home-"));
});

afterEach(() => {
	fs.rmSync(tmp, { recursive: true, force: true });
	fs.rmSync(fakeHome, { recursive: true, force: true });
});

describe("formatUnknown", () => {
	it("lists the most common extensions first", () => {
		expect(formatUnknown({ foo: 1, xyz: 3, "": 2 })).toBe(
			".xyz (3), no extension (2), .foo (1)",
		);
	});

	it("is empty when there is nothing to report", () => {
		expect(formatUnknown({})).toBe("");
	});
});

describe("parseList", () => {
	it("splits on commas, trims and lowercases", () => {
		expect(parseList(" Images, documents ,,CODE")).toEqual([
			"images",
			"documents",
			"code",
		]);
	});
});

describe("CLI selection options", () => {
	beforeEach(() => {
		for (const name of ["a.jpg", "b.pdf", "c.js", ".hidden.json"]) {
			fs.writeFileSync(path.join(tmp, name), "");
		}
	});

	it("--include sorts only the listed categories", () => {
		expect(run(tmp, "--include", "images,documents").status).toBe(0);

		expect(fs.existsSync(path.join(tmp, "images", "a.jpg"))).toBe(true);
		expect(fs.existsSync(path.join(tmp, "documents", "b.pdf"))).toBe(true);
		expect(fs.existsSync(path.join(tmp, "c.js"))).toBe(true);
	});

	it("--exclude skips the listed categories", () => {
		run(tmp, "--exclude", "code");

		expect(fs.existsSync(path.join(tmp, "c.js"))).toBe(true);
		expect(fs.existsSync(path.join(tmp, "images", "a.jpg"))).toBe(true);
	});

	it("reports a mistyped category and moves nothing", () => {
		const { status, stdout, stderr } = run(tmp, "--include", "imagse");

		expect(status).toBe(1);
		expect(stdout + stderr).toContain('Unknown category "imagse"');
		expect(fs.existsSync(path.join(tmp, "a.jpg"))).toBe(true);
	});

	it("rejects --include together with --revert", () => {
		const { status, stderr } = run(tmp, "--revert", "--include", "images");

		expect(status).toBe(1);
		expect(stderr).toContain("cannot be used with");
	});

	it("--include-hidden also sorts dotfiles", () => {
		run(tmp, "--include-hidden");

		expect(fs.existsSync(path.join(tmp, "code", ".hidden.json"))).toBe(true);
	});

	it.skipIf(process.platform === "win32")(
		"refuses the home directory without --yes, and proceeds with it",
		() => {
			const env = { HOME: tmp, USERPROFILE: tmp };

			const refused = runWithEnv(env, tmp);
			expect(refused.status).toBe(1);
			expect(refused.stdout + refused.stderr).toContain("--yes");
			expect(fs.existsSync(path.join(tmp, "a.jpg"))).toBe(true);

			expect(runWithEnv(env, tmp, "--yes").status).toBe(0);
			expect(fs.existsSync(path.join(tmp, "images", "a.jpg"))).toBe(true);
		},
	);
});

describe("parseDepth", () => {
	it("accepts whole numbers", () => {
		expect(parseDepth("0")).toBe(0);
		expect(parseDepth("3")).toBe(3);
	});

	it.each(["-1", "1.5", "abc", ""])("rejects %j", value => {
		expect(() => parseDepth(value)).toThrow("whole number");
	});
});

describe("CLI config", () => {
	const CONFIG = ".sortfilesrc.json";
	const writeConfig = (where, categories) =>
		fs.writeFileSync(path.join(where, CONFIG), JSON.stringify({ categories }));

	beforeEach(() => {
		fs.writeFileSync(path.join(tmp, "march.inv"), "");
		fs.writeFileSync(path.join(tmp, "todo.md"), "");
	});

	it("applies .sortfilesrc.json from the target directory", () => {
		writeConfig(tmp, { invoices: ["inv"], notes: ["md"] });

		const { stdout, status } = run(tmp);

		expect(status).toBe(0);
		expect(stdout).toContain(`Using config: ${path.join(tmp, CONFIG)}`);
		expect(fs.existsSync(path.join(tmp, "invoices", "march.inv"))).toBe(true);
		expect(fs.existsSync(path.join(tmp, "notes", "todo.md"))).toBe(true);
		expect(fs.existsSync(path.join(tmp, CONFIG))).toBe(true);
	});

	it("falls back to the config in $HOME", () => {
		const home = fs.mkdtempSync(path.join(tmp, "home-"));
		writeConfig(home, { invoices: ["inv"] });
		const target = fs.mkdtempSync(path.join(tmp, "target-"));
		fs.writeFileSync(path.join(target, "a.inv"), "");

		runWithEnv({ HOME: home, USERPROFILE: home }, target);

		expect(fs.existsSync(path.join(target, "invoices", "a.inv"))).toBe(true);
	});

	it("--config uses an explicit file", () => {
		const file = path.join(tmp, "custom.json");
		fs.writeFileSync(file, JSON.stringify({ categories: { bills: ["inv"] } }));

		run(tmp, "--config", file);

		expect(fs.existsSync(path.join(tmp, "bills", "march.inv"))).toBe(true);
	});

	it("--no-config ignores config files", () => {
		writeConfig(tmp, { invoices: ["inv"] });

		const { stdout } = run(tmp, "--no-config");

		expect(stdout).not.toContain("Using config");
		expect(fs.existsSync(path.join(tmp, "march.inv"))).toBe(true);
		expect(fs.existsSync(path.join(tmp, "documents", "todo.md"))).toBe(true);
	});

	it("--include accepts a custom category", () => {
		writeConfig(tmp, { invoices: ["inv"] });

		run(tmp, "--include", "invoices");

		expect(fs.existsSync(path.join(tmp, "invoices", "march.inv"))).toBe(true);
		expect(fs.existsSync(path.join(tmp, "todo.md"))).toBe(true);
	});

	it("reverts a sort that used a config", () => {
		writeConfig(tmp, { invoices: ["inv"] });
		run(tmp);

		expect(run(tmp, "--revert").status).toBe(0);

		expect(fs.existsSync(path.join(tmp, "march.inv"))).toBe(true);
		expect(fs.existsSync(path.join(tmp, "invoices"))).toBe(false);
	});

	it("--json reports the config in use", () => {
		writeConfig(tmp, { invoices: ["inv"] });

		const parsed = JSON.parse(run(tmp, "--json", "--dry-run").stdout);

		expect(parsed.config).toBe(path.join(tmp, CONFIG));
	});

	it("fails clearly on an invalid config and moves nothing", () => {
		fs.writeFileSync(path.join(tmp, CONFIG), JSON.stringify({ category: {} }));

		const { status, stdout, stderr } = run(tmp);

		expect(status).toBe(1);
		expect(stdout + stderr).toContain('unknown key "category"');
		expect(fs.existsSync(path.join(tmp, "todo.md"))).toBe(true);
	});

	it("fails when --config points at a missing file", () => {
		const { status, stdout, stderr } = run(tmp, "--config", "nope.json");

		expect(status).toBe(1);
		expect(stdout + stderr).toContain("Config file not found");
	});
});

describe("CLI recursion", () => {
	beforeEach(() => {
		fs.mkdirSync(path.join(tmp, "trip", "day1"), { recursive: true });
		fs.writeFileSync(path.join(tmp, "trip", "a.jpg"), "");
		fs.writeFileSync(path.join(tmp, "trip", "day1", "b.pdf"), "");
	});

	it("--recursive sorts subfolders in place", () => {
		expect(run(tmp, "--recursive").status).toBe(0);

		expect(fs.existsSync(path.join(tmp, "trip", "images", "a.jpg"))).toBe(true);
		expect(
			fs.existsSync(path.join(tmp, "trip", "day1", "documents", "b.pdf")),
		).toBe(true);
	});

	it("--depth limits it and implies recursion", () => {
		run(tmp, "--depth", "1");

		expect(fs.existsSync(path.join(tmp, "trip", "images", "a.jpg"))).toBe(true);
		expect(fs.existsSync(path.join(tmp, "trip", "day1", "b.pdf"))).toBe(true);
	});

	it("rejects a bad depth and combining with --revert", () => {
		expect(run(tmp, "--depth", "x").status).toBe(1);
		expect(run(tmp, "--recursive", "--revert").stderr).toContain(
			"cannot be used with",
		);
		expect(fs.existsSync(path.join(tmp, "trip", "a.jpg"))).toBe(true);
	});

	it("reverts a recursive sort", () => {
		run(tmp, "-R");
		expect(run(tmp, "--revert").status).toBe(0);

		expect(fs.existsSync(path.join(tmp, "trip", "a.jpg"))).toBe(true);
		expect(fs.existsSync(path.join(tmp, "trip", "images"))).toBe(false);
	});
});

describe("toJson", () => {
	const result = {
		moved: 1,
		skipped: 0,
		errors: [],
		actions: [{ from: "a.jpg", to: "images/a.jpg" }],
		warnings: [],
		unknown: {},
	};

	it("describes a sort", () => {
		expect(toJson("/x", {}, result)).toEqual({
			directory: path.resolve("/x"),
			mode: "sort",
			dryRun: false,
			config: null,
			...result,
		});
	});

	it("includes the config file in use", () => {
		expect(toJson("/x", {}, result, "/x/.sortfilesrc.json").config).toBe(
			"/x/.sortfilesrc.json",
		);
	});

	it("describes a dry-run revert", () => {
		expect(toJson("/x", { revert: true, dryRun: true }, result)).toMatchObject({
			mode: "revert",
			dryRun: true,
		});
	});
});

describe("CLI output modes", () => {
	beforeEach(() => {
		fs.writeFileSync(path.join(tmp, "a.jpg"), "");
		fs.writeFileSync(path.join(tmp, "b.xyz"), "");
	});

	it("--verbose lists each move of a real run", () => {
		const { stdout, stderr } = run(tmp, "--verbose");

		expect(stdout).toContain("Moved: a.jpg → ");
		expect(stderr).toContain("Successfully sorted 1 files");
	});

	it("--verbose labels reverted moves", () => {
		run(tmp);

		expect(run(tmp, "--revert", "--verbose").stdout).toContain("Moved back: ");
	});

	it("--quiet prints nothing on success", () => {
		const { stdout, stderr, status } = run(tmp, "--quiet");

		expect(status).toBe(0);
		expect(stdout).toBe("");
		expect(stderr).toBe("");
		expect(fs.existsSync(path.join(tmp, "images", "a.jpg"))).toBe(true);
	});

	it("--quiet still reports fatal errors on stderr", () => {
		const { stdout, stderr, status } = run(path.join(tmp, "nope"), "--quiet");

		expect(status).toBe(1);
		expect(stdout).toBe("");
		expect(stderr).toContain("Directory not found");
	});

	it("--quiet still shows warnings", () => {
		fs.mkdirSync(path.join(tmp, "docs-old"));
		fs.mkdirSync(path.join(tmp, "images"));
		fs.writeFileSync(path.join(tmp, "images", "x.jpg"), "");

		expect(run(tmp, "--revert", "--quiet").stderr).toContain("No manifest");
	});

	it("--json prints only a parseable result on stdout", () => {
		const { stdout, status } = run(tmp, "--json");

		const parsed = JSON.parse(stdout);
		expect(status).toBe(0);
		expect(parsed).toMatchObject({
			mode: "sort",
			dryRun: false,
			moved: 1,
			skipped: 1,
			errors: [],
			unknown: { xyz: 1 },
		});
		expect(parsed.actions).toEqual([
			{ from: "a.jpg", to: path.join("images", "a.jpg") },
		]);
	});

	it("--json with --dry-run reports the plan without moving", () => {
		const parsed = JSON.parse(run(tmp, "--json", "--dry-run").stdout);

		expect(parsed.dryRun).toBe(true);
		expect(parsed.moved).toBe(1);
		expect(fs.existsSync(path.join(tmp, "a.jpg"))).toBe(true);
	});

	it("--json reports fatal errors as JSON with a non-zero exit", () => {
		const { stdout, status } = run(path.join(tmp, "nope"), "--json");

		expect(status).toBe(1);
		expect(JSON.parse(stdout).error).toContain("Directory not found");
	});

	it.each([
		["--quiet", "--verbose"],
		["--json", "--quiet"],
		["--json", "--verbose"],
	])("rejects %s together with %s", (a, b) => {
		const { status, stderr } = run(tmp, a, b);

		expect(status).toBe(1);
		expect(stderr).toContain("cannot be used with");
		expect(fs.existsSync(path.join(tmp, "a.jpg"))).toBe(true);
	});
});

describe("CLI", () => {
	it("lists files left in place for lack of a category", () => {
		fs.writeFileSync(path.join(tmp, "a.xyz"), "");
		fs.writeFileSync(path.join(tmp, "b.xyz"), "");
		fs.writeFileSync(path.join(tmp, "Makefile"), "");
		fs.writeFileSync(path.join(tmp, "b.jpg"), "");

		const { stdout } = run(tmp);

		expect(stdout).toContain(
			"Left in place (no matching category): .xyz (2), no extension (1)",
		);
		expect(fs.existsSync(path.join(tmp, "a.xyz"))).toBe(true);
	});

	it("stays quiet about unknown files when everything was sorted", () => {
		fs.writeFileSync(path.join(tmp, "b.jpg"), "");

		expect(run(tmp).stdout).not.toContain("Left in place");
	});

	it("prints the package version", () => {
		const { version } = JSON.parse(
			fs.readFileSync(path.join(path.dirname(CLI), "package.json"), "utf8"),
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

	it("only reverts files it moved, and warns when there is no manifest", () => {
		fs.mkdirSync(path.join(tmp, "images"));
		fs.writeFileSync(path.join(tmp, "images", "earlier.jpg"), "x");
		fs.writeFileSync(path.join(tmp, "new.jpg"), "y");

		run(tmp);
		run(tmp, "--revert");
		expect(fs.existsSync(path.join(tmp, "images", "earlier.jpg"))).toBe(true);
		expect(fs.existsSync(path.join(tmp, "new.jpg"))).toBe(true);

		const fallback = run(tmp, "--revert");
		expect(fallback.stderr).toContain("No manifest found");
		expect(fs.existsSync(path.join(tmp, "earlier.jpg"))).toBe(true);
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

		execFileSync(process.execPath, [link, target], {
			env: { ...process.env, HOME: fakeHome, USERPROFILE: fakeHome },
		});

		expect(fs.existsSync(path.join(target, "documents", "a.pdf"))).toBe(true);
	});
});
