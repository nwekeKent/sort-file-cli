import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getAvailablePath, sortFiles } from "./sorter.js";
import { MANIFEST_NAME } from "./manifest.js";

// These tests run against a real temporary directory, so they verify what
// actually ends up on disk rather than which fs calls were made.

let root;

/** Creates files (path -> contents) and directories (trailing "/") under root. */
function build(tree) {
	for (const [rel, contents] of Object.entries(tree)) {
		const full = path.join(root, rel);
		if (rel.endsWith("/")) {
			fs.mkdirSync(full, { recursive: true });
		} else {
			fs.mkdirSync(path.dirname(full), { recursive: true });
			fs.writeFileSync(full, contents);
		}
	}
}

/** Returns every file under root as { "relative/path": contents }, plus dirs. */
function snapshot(dir = root, base = "") {
	const out = {};
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const rel = path.join(base, entry.name);
		if (entry.isDirectory()) {
			out[rel + path.sep] = null;
			Object.assign(out, snapshot(path.join(dir, entry.name), rel));
		} else {
			out[rel] = fs.readFileSync(path.join(dir, entry.name), "utf8");
		}
	}
	return out;
}

const p = (...parts) => path.join(...parts);

beforeEach(() => {
	root = fs.mkdtempSync(path.join(os.tmpdir(), "sort-files-core-"));
});

afterEach(() => {
	fs.rmSync(root, { recursive: true, force: true });
});

describe("sortFiles", () => {
	it("moves files into category folders", async () => {
		build({ "photo.jpg": "img", "report.pdf": "doc", "app.js": "code" });

		const result = await sortFiles(root);

		expect(snapshot()).toEqual({
			[p("images") + path.sep]: null,
			[p("images", "photo.jpg")]: "img",
			[p("documents") + path.sep]: null,
			[p("documents", "report.pdf")]: "doc",
			[p("code") + path.sep]: null,
			[p("code", "app.js")]: "code",
			[MANIFEST_NAME]: expect.any(String),
		});
		expect(result.moved).toBe(3);
		expect(result.errors).toEqual([]);
	});

	it("matches extensions case-insensitively", async () => {
		build({ "PHOTO.JPG": "img" });

		await sortFiles(root);

		expect(fs.existsSync(p(root, "images", "PHOTO.JPG"))).toBe(true);
	});

	it("leaves hidden files, directories and unknown extensions alone", async () => {
		build({
			".eslintrc.json": "hidden",
			"folder/": null,
			"mystery.xyz": "?",
			"noextension": "?",
			"app.js": "code",
		});

		const result = await sortFiles(root);

		expect(fs.existsSync(p(root, ".eslintrc.json"))).toBe(true);
		expect(fs.existsSync(p(root, "folder"))).toBe(true);
		expect(fs.existsSync(p(root, "mystery.xyz"))).toBe(true);
		expect(fs.existsSync(p(root, "noextension"))).toBe(true);
		expect(fs.existsSync(p(root, "code", "app.js"))).toBe(true);
		expect(result.moved).toBe(1);
		expect(result.skipped).toBe(4);
	});

	it("sorts a user file named sort-cli.js", async () => {
		build({ "sort-cli.js": "mine" });

		await sortFiles(root);

		expect(fs.existsSync(p(root, "code", "sort-cli.js"))).toBe(true);
	});

	it("does not touch files already inside category folders", async () => {
		build({ "images/old.png": "old", "new.png": "new" });

		await sortFiles(root);

		expect(fs.readFileSync(p(root, "images", "old.png"), "utf8")).toBe("old");
		expect(fs.readFileSync(p(root, "images", "new.png"), "utf8")).toBe("new");
	});

	describe("collisions", () => {
		beforeEach(() => {
			build({ "images/photo.jpg": "existing", "photo.jpg": "incoming" });
		});

		it("keeps both files by renaming the incoming one", async () => {
			const result = await sortFiles(root);

			expect(snapshot()).toMatchObject({
				[p("images", "photo.jpg")]: "existing",
				[p("images", "photo (1).jpg")]: "incoming",
			});
			expect(fs.existsSync(p(root, "photo.jpg"))).toBe(false);
			expect(result.actions).toEqual([
				{ from: "photo.jpg", to: p("images", "photo (1).jpg") },
			]);
		});

		it("picks the next free number when (1) is also taken", async () => {
			build({ "images/photo (1).jpg": "second" });

			await sortFiles(root);

			expect(
				fs.readFileSync(p(root, "images", "photo (2).jpg"), "utf8")
			).toBe("incoming");
			expect(
				fs.readFileSync(p(root, "images", "photo (1).jpg"), "utf8")
			).toBe("second");
		});

		it("overwrites the existing file only with force", async () => {
			await sortFiles(root, { force: true });

			expect(fs.readFileSync(p(root, "images", "photo.jpg"), "utf8")).toBe(
				"incoming"
			);
			expect(fs.existsSync(p(root, "images", "photo (1).jpg"))).toBe(false);
		});
	});

	describe("dry run", () => {
		it("changes nothing but reports the planned moves", async () => {
			build({ "photo.jpg": "img", "images/photo.jpg": "existing" });
			const before = snapshot();

			const result = await sortFiles(root, { dryRun: true });

			expect(snapshot()).toEqual(before);
			expect(result.moved).toBe(1);
			expect(result.actions).toEqual([
				{ from: "photo.jpg", to: p("images", "photo (1).jpg") },
			]);
		});

		it("does not create category folders", async () => {
			build({ "photo.jpg": "img" });

			await sortFiles(root, { dryRun: true });

			expect(fs.existsSync(p(root, "images"))).toBe(false);
		});
	});

	describe("errors", () => {
		it("throws when the directory does not exist", async () => {
			await expect(sortFiles(p(root, "nope"))).rejects.toThrow(
				"Directory not found"
			);
		});

		it("throws when the target is a file", async () => {
			build({ "a.txt": "x" });

			await expect(sortFiles(p(root, "a.txt"))).rejects.toThrow(
				"Not a directory"
			);
		});

		it(
			"records a failed move and continues with the rest",
			async () => {
				build({ "a.jpg": "1", "b.pdf": "2" });
				// A file where the images folder should go makes that move fail
				fs.writeFileSync(p(root, "images"), "blocker");

				const result = await sortFiles(root);

				expect(result.errors).toHaveLength(1);
				expect(result.errors[0].file).toBe("a.jpg");
				expect(fs.existsSync(p(root, "a.jpg"))).toBe(true);
				expect(fs.existsSync(p(root, "documents", "b.pdf"))).toBe(true);
				expect(result.moved).toBe(1);
			}
		);
	});
});

describe("sortFiles with revert", () => {
	it("restores sorted files and removes the emptied folders", async () => {
		build({ "photo.jpg": "img", "report.pdf": "doc" });
		const original = snapshot();

		await sortFiles(root);
		const result = await sortFiles(root, { revert: true });

		expect(snapshot()).toEqual(original);
		expect(result.moved).toBe(2);
	});

	it("only touches the predefined category folders", async () => {
		build({ "photos/vacation.jpg": "keep", "images/a.jpg": "move" });

		await sortFiles(root, { revert: true });

		expect(fs.existsSync(p(root, "photos", "vacation.jpg"))).toBe(true);
		expect(fs.existsSync(p(root, "a.jpg"))).toBe(true);
	});

	it("never moves subdirectories and keeps a folder that is not empty", async () => {
		build({ "images/a.jpg": "move", "images/nested/b.jpg": "stay" });

		const result = await sortFiles(root, { revert: true });

		expect(fs.existsSync(p(root, "a.jpg"))).toBe(true);
		expect(fs.existsSync(p(root, "images", "nested", "b.jpg"))).toBe(true);
		expect(fs.existsSync(p(root, "nested"))).toBe(false);
		expect(result.skipped).toBe(1);
	});

	it("does not overwrite a file already in the root", async () => {
		build({ "photo.jpg": "root", "images/photo.jpg": "sorted" });

		await sortFiles(root, { revert: true });

		expect(fs.readFileSync(p(root, "photo.jpg"), "utf8")).toBe("root");
		expect(fs.readFileSync(p(root, "photo (1).jpg"), "utf8")).toBe("sorted");
	});

	it("overwrites a file in the root only with force", async () => {
		build({ "photo.jpg": "root", "images/photo.jpg": "sorted" });

		await sortFiles(root, { revert: true, force: true });

		expect(fs.readFileSync(p(root, "photo.jpg"), "utf8")).toBe("sorted");
	});

	it("changes nothing in a dry run", async () => {
		build({ "images/a.jpg": "x", "documents/b.pdf": "y" });
		const before = snapshot();

		const result = await sortFiles(root, { revert: true, dryRun: true });

		expect(snapshot()).toEqual(before);
		expect(result.actions).toEqual(
			expect.arrayContaining([
				{ from: p("images", "a.jpg"), to: "a.jpg" },
				{ from: p("documents", "b.pdf"), to: "b.pdf" },
			])
		);
	});

	it("is a no-op when there are no category folders", async () => {
		build({ "notes.txt": "hi" });

		const result = await sortFiles(root, { revert: true });

		expect(result.moved).toBe(0);
		expect(fs.existsSync(p(root, "notes.txt"))).toBe(true);
	});
});

const readManifestFile = () =>
	JSON.parse(fs.readFileSync(p(root, MANIFEST_NAME), "utf8"));

describe("undo manifest", () => {
	it("records each successful move relative to the directory", async () => {
		build({ "photo.jpg": "img", "report.pdf": "doc" });

		await sortFiles(root);

		const manifest = readManifestFile();
		expect(manifest.version).toBe(1);
		expect(manifest.moves).toEqual(
			expect.arrayContaining([
				{ from: "photo.jpg", to: p("images", "photo.jpg") },
				{ from: "report.pdf", to: p("documents", "report.pdf") },
			])
		);
	});

	it("is not written in a dry run or when nothing moved", async () => {
		build({ "photo.jpg": "img" });
		await sortFiles(root, { dryRun: true });
		expect(fs.existsSync(p(root, MANIFEST_NAME))).toBe(false);

		fs.rmSync(p(root, "photo.jpg"));
		build({ "notes.xyz": "?" });
		await sortFiles(root);
		expect(fs.existsSync(p(root, MANIFEST_NAME))).toBe(false);
	});

	it("is never sorted itself", async () => {
		build({ "a.jpg": "1" });
		await sortFiles(root);
		build({ "b.jpg": "2" });

		await sortFiles(root);

		expect(fs.existsSync(p(root, MANIFEST_NAME))).toBe(true);
		expect(readManifestFile().moves).toHaveLength(2);
	});

	it("revert restores only files the sort moved", async () => {
		build({ "images/earlier.jpg": "was here first", "new.jpg": "moved" });

		await sortFiles(root);
		await sortFiles(root, { revert: true });

		expect(snapshot()).toEqual({
			[p("images") + path.sep]: null,
			[p("images", "earlier.jpg")]: "was here first",
			"new.jpg": "moved",
		});
	});

	it("revert undoes several sorts, newest first", async () => {
		build({ "a.jpg": "1" });
		await sortFiles(root);
		build({ "b.jpg": "2" });
		await sortFiles(root);

		const result = await sortFiles(root, { revert: true });

		expect(snapshot()).toEqual({ "a.jpg": "1", "b.jpg": "2" });
		expect(result.moved).toBe(2);
		expect(result.warnings).toEqual([]);
	});

	it("revert restores a renamed collision to its original name", async () => {
		build({ "images/photo.jpg": "existing", "photo.jpg": "incoming" });

		await sortFiles(root);
		await sortFiles(root, { revert: true });

		expect(snapshot()).toEqual({
			[p("images") + path.sep]: null,
			[p("images", "photo.jpg")]: "existing",
			"photo.jpg": "incoming",
		});
	});

	it("revert does not overwrite a new file that took the original name", async () => {
		build({ "photo.jpg": "old" });
		await sortFiles(root);
		build({ "photo.jpg": "newer" });

		await sortFiles(root, { revert: true });

		expect(fs.readFileSync(p(root, "photo.jpg"), "utf8")).toBe("newer");
		expect(fs.readFileSync(p(root, "photo (1).jpg"), "utf8")).toBe("old");
	});

	it("revert warns about and skips files that were moved or deleted", async () => {
		build({ "a.jpg": "1", "b.jpg": "2" });
		await sortFiles(root);
		fs.rmSync(p(root, "images", "a.jpg"));

		const result = await sortFiles(root, { revert: true });

		expect(fs.readFileSync(p(root, "b.jpg"), "utf8")).toBe("2");
		expect(result.skipped).toBe(1);
		expect(result.warnings).toEqual([
			expect.stringContaining("images" + path.sep + "a.jpg"),
		]);
		expect(fs.existsSync(p(root, MANIFEST_NAME))).toBe(false);
	});

	it("revert removes the manifest and the emptied folders", async () => {
		build({ "a.jpg": "1" });
		await sortFiles(root);

		await sortFiles(root, { revert: true });

		expect(fs.existsSync(p(root, MANIFEST_NAME))).toBe(false);
		expect(fs.existsSync(p(root, "images"))).toBe(false);
	});

	it("dry-run revert reports the plan and changes nothing", async () => {
		build({ "a.jpg": "1" });
		await sortFiles(root);
		const before = snapshot();

		const result = await sortFiles(root, { revert: true, dryRun: true });

		expect(snapshot()).toEqual(before);
		expect(result.actions).toEqual([{ from: p("images", "a.jpg"), to: "a.jpg" }]);
	});

	it("ignores entries that point outside the directory", async () => {
		build({ "images/a.jpg": "1" });
		const outside = fs.mkdtempSync(path.join(os.tmpdir(), "sort-files-out-"));
		fs.writeFileSync(p(outside, "secret.txt"), "keep");
		fs.writeFileSync(
			p(root, MANIFEST_NAME),
			JSON.stringify({
				version: 1,
				moves: [
					{ from: "a.jpg", to: p("images", "a.jpg") },
					{ from: p("..", path.basename(outside), "stolen.txt"), to: p("..", path.basename(outside), "secret.txt") },
				],
			})
		);

		const result = await sortFiles(root, { revert: true });

		expect(fs.readFileSync(p(outside, "secret.txt"), "utf8")).toBe("keep");
		expect(fs.existsSync(p(root, "a.jpg"))).toBe(true);
		expect(result.warnings).toHaveLength(1);
		fs.rmSync(outside, { recursive: true, force: true });
	});

	it("falls back to folder contents with a warning when there is no manifest", async () => {
		build({ "images/a.jpg": "1" });

		const result = await sortFiles(root, { revert: true });

		expect(fs.existsSync(p(root, "a.jpg"))).toBe(true);
		expect(result.warnings).toEqual([expect.stringContaining("No manifest")]);
	});

	it.each([
		["not JSON", "{oops"],
		["the wrong shape", JSON.stringify({ version: 1, moves: [{ from: 1 }] })],
		["an unknown version", JSON.stringify({ version: 99, moves: [] })],
	])("refuses a manifest that is %s, before moving anything", async (_, body) => {
		build({ "photo.jpg": "img", [MANIFEST_NAME]: body });

		await expect(sortFiles(root)).rejects.toThrow(MANIFEST_NAME);
		await expect(sortFiles(root, { revert: true })).rejects.toThrow(MANIFEST_NAME);

		expect(fs.existsSync(p(root, "photo.jpg"))).toBe(true);
		expect(fs.existsSync(p(root, "images"))).toBe(false);
	});
});

describe("getAvailablePath", () => {
	it("returns the path unchanged when it is free", async () => {
		expect(await getAvailablePath(p(root, "a.txt"))).toBe(p(root, "a.txt"));
	});

	it("increments the counter until a free name is found", async () => {
		build({ "a.txt": "", "a (1).txt": "" });

		expect(await getAvailablePath(p(root, "a.txt"))).toBe(p(root, "a (2).txt"));
	});

	it("handles names without an extension", async () => {
		build({ README: "" });

		expect(await getAvailablePath(p(root, "README"))).toBe(
			p(root, "README (1)")
		);
	});
});
