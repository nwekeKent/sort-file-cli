import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { CONFIG_NAME, loadConfig } from "./config.js";

let dir;
let home;

const write = (where, contents) =>
	fs.writeFileSync(
		path.join(where, CONFIG_NAME),
		typeof contents === "string" ? contents : JSON.stringify(contents),
	);

beforeEach(() => {
	const base = fs.mkdtempSync(path.join(os.tmpdir(), "sort-files-config-"));
	dir = path.join(base, "target");
	home = path.join(base, "home");
	fs.mkdirSync(dir);
	fs.mkdirSync(home);
});

afterEach(() => {
	fs.rmSync(path.dirname(dir), { recursive: true, force: true });
});

describe("loadConfig", () => {
	it("returns null when there is no config file", async () => {
		expect(await loadConfig(dir, { home })).toBeNull();
	});

	it("reads the config from the target directory", async () => {
		write(dir, { categories: { invoices: ["inv"] } });

		expect(await loadConfig(dir, { home })).toEqual({
			path: path.join(dir, CONFIG_NAME),
			categories: { invoices: ["inv"] },
		});
	});

	it("reports an absolute path even for a relative target", async () => {
		write(dir, { categories: {} });
		const relative = path.relative(process.cwd(), dir);

		const loaded = await loadConfig(relative, { home });

		expect(loaded.path).toBe(path.join(dir, CONFIG_NAME));
	});

	it("falls back to the home directory", async () => {
		write(home, { categories: { notes: ["md"] } });

		const loaded = await loadConfig(dir, { home });

		expect(loaded.path).toBe(path.join(home, CONFIG_NAME));
		expect(loaded.categories).toEqual({ notes: ["md"] });
	});

	it("prefers the target directory over home and never merges them", async () => {
		write(dir, { categories: { a: ["aa"] } });
		write(home, { categories: { b: ["bb"] } });

		expect((await loadConfig(dir, { home })).categories).toEqual({ a: ["aa"] });
	});

	it("uses an explicit path above everything else", async () => {
		write(dir, { categories: { a: ["aa"] } });
		const explicit = path.join(home, "custom.json");
		fs.writeFileSync(explicit, JSON.stringify({ categories: { c: ["cc"] } }));

		const loaded = await loadConfig(dir, { home, configPath: explicit });

		expect(loaded).toEqual({ path: explicit, categories: { c: ["cc"] } });
	});

	it("fails when an explicit path does not exist", async () => {
		await expect(
			loadConfig(dir, { home, configPath: path.join(home, "nope.json") }),
		).rejects.toThrow("Config file not found");
	});

	it("treats a missing categories key as no custom categories", async () => {
		write(dir, {});

		expect((await loadConfig(dir, { home })).categories).toEqual({});
	});

	it.each([
		["not JSON", "{oops", "not valid JSON"],
		["an array", "[]", "expected a JSON object"],
		["a typo'd key", { category: {} }, 'unknown key "category"'],
		[
			"an invalid category",
			{ categories: { "a/b": [] } },
			"Invalid category name",
		],
		["a clashing extension", { categories: { a: ["x"], b: ["x"] } }, "both"],
	])("rejects %s, naming the file", async (_, contents, message) => {
		write(dir, contents);

		const failure = loadConfig(dir, { home });

		await expect(failure).rejects.toThrow(message);
		await expect(failure).rejects.toThrow(path.join(dir, CONFIG_NAME));
	});
});
