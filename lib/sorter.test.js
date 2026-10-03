import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "fs-extra";
import path from "path";
import { CATEGORIES } from "./categories.js";
import { getAvailablePath, sortFiles } from "./sorter.js";

// Mock the filesystem so these tests never touch disk
vi.mock("fs-extra");

const DIR = "/work";
const file = name => ({ isFile: () => true, name });
const dir = name => ({ isFile: () => false, name });
const isCategory = p => Object.keys(CATEGORIES).some(cat => p.endsWith(cat));

beforeEach(() => {
	vi.clearAllMocks();

	fs.pathExists.mockImplementation(async p => p === DIR);
	fs.stat.mockResolvedValue({ isDirectory: () => true });
	fs.readdir.mockResolvedValue([]);
	fs.ensureDir.mockResolvedValue(undefined);
	fs.move.mockResolvedValue(undefined);
	fs.rmdir = vi.fn().mockResolvedValue(undefined);
});

describe("sortFiles", () => {
	it("moves files into category folders", async () => {
		fs.readdir.mockResolvedValue([file("photo.jpg"), file("document.pdf")]);

		const result = await sortFiles(DIR);

		expect(fs.ensureDir).toHaveBeenCalledWith(path.join(DIR, "images"));
		expect(fs.ensureDir).toHaveBeenCalledWith(path.join(DIR, "documents"));
		expect(fs.move).toHaveBeenCalledTimes(2);
		expect(result.moved).toBe(2);
		expect(result.actions).toContainEqual({
			from: "photo.jpg",
			to: path.join("images", "photo.jpg"),
		});
	});

	it("skips hidden files, directories and unknown extensions", async () => {
		fs.readdir.mockResolvedValue([
			file(".eslintrc.json"),
			dir("folder"),
			file("mystery.xyz"),
			file("app.js"),
		]);

		const result = await sortFiles(DIR);

		expect(fs.move).toHaveBeenCalledTimes(1);
		expect(result.moved).toBe(1);
		expect(result.skipped).toBe(3);
	});

	it("sorts a user file named sort-cli.js", async () => {
		fs.readdir.mockResolvedValue([file("sort-cli.js")]);

		const result = await sortFiles(DIR);

		expect(result.moved).toBe(1);
	});

	it("renames instead of overwriting on collision", async () => {
		fs.readdir.mockResolvedValue([file("photo.jpg")]);
		fs.pathExists.mockImplementation(
			async p => p === DIR || p === path.join(DIR, "images", "photo.jpg")
		);

		await sortFiles(DIR);

		expect(fs.move).toHaveBeenCalledWith(
			path.join(DIR, "photo.jpg"),
			path.join(DIR, "images", "photo (1).jpg"),
			{ overwrite: false }
		);
	});

	it("overwrites on collision when force is set", async () => {
		fs.readdir.mockResolvedValue([file("photo.jpg")]);
		fs.pathExists.mockResolvedValue(true);

		await sortFiles(DIR, { force: true });

		expect(fs.move).toHaveBeenCalledWith(
			path.join(DIR, "photo.jpg"),
			path.join(DIR, "images", "photo.jpg"),
			{ overwrite: true }
		);
	});

	it("does not move anything in a dry run, but reports the plan", async () => {
		fs.readdir.mockResolvedValue([file("photo.jpg")]);

		const result = await sortFiles(DIR, { dryRun: true });

		expect(fs.move).not.toHaveBeenCalled();
		expect(fs.ensureDir).not.toHaveBeenCalled();
		expect(result.moved).toBe(1);
		expect(result.actions).toEqual([
			{ from: "photo.jpg", to: path.join("images", "photo.jpg") },
		]);
	});

	it("keeps going and records errors when a move fails", async () => {
		fs.readdir.mockResolvedValue([file("a.jpg"), file("b.pdf")]);
		fs.move.mockRejectedValueOnce(new Error("EACCES"));

		const result = await sortFiles(DIR);

		expect(fs.move).toHaveBeenCalledTimes(2);
		expect(result.moved).toBe(1);
		expect(result.errors).toEqual([{ file: "a.jpg", message: "EACCES" }]);
	});

	it("throws when the directory does not exist", async () => {
		fs.pathExists.mockResolvedValue(false);

		await expect(sortFiles(DIR)).rejects.toThrow("Directory not found");
	});

	it("throws when the target is not a directory", async () => {
		fs.stat.mockResolvedValue({ isDirectory: () => false });

		await expect(sortFiles(DIR)).rejects.toThrow("Not a directory");
		expect(fs.move).not.toHaveBeenCalled();
	});
});

describe("sortFiles with revert", () => {
	let imagesEntries;

	beforeEach(() => {
		imagesEntries = [file("photo.jpg")];

		fs.pathExists.mockImplementation(async p => p === DIR || isCategory(p));
		fs.readdir.mockImplementation(async (p, opts) => {
			if (!p.endsWith("images")) return [];
			// After the move loop the folder is checked without options
			return opts ? imagesEntries : [];
		});
	});

	it("moves files back and removes the emptied folder", async () => {
		const result = await sortFiles(DIR, { revert: true });

		expect(fs.move).toHaveBeenCalledTimes(1);
		expect(result.moved).toBe(1);
		expect(fs.rmdir).toHaveBeenCalledWith(path.join(DIR, "images"));
	});

	it("does not move subdirectories out of a category folder", async () => {
		imagesEntries = [dir("nested")];

		const result = await sortFiles(DIR, { revert: true });

		expect(fs.move).not.toHaveBeenCalled();
		expect(result.skipped).toBe(1);
	});

	it("does not remove a category folder that is not empty", async () => {
		fs.readdir.mockImplementation(async (p, opts) => {
			if (!p.endsWith("images")) return [];
			return opts ? imagesEntries : ["nested"];
		});

		await sortFiles(DIR, { revert: true });

		expect(fs.rmdir).not.toHaveBeenCalledWith(path.join(DIR, "images"));
	});

	it("renames instead of overwriting a file already in the root", async () => {
		fs.pathExists.mockImplementation(
			async p =>
				p === DIR || isCategory(p) || p === path.join(DIR, "photo.jpg")
		);

		await sortFiles(DIR, { revert: true });

		expect(fs.move).toHaveBeenCalledWith(
			path.join(DIR, "images", "photo.jpg"),
			path.join(DIR, "photo (1).jpg"),
			{ overwrite: false }
		);
	});

	it("leaves everything untouched in a dry run", async () => {
		const result = await sortFiles(DIR, { revert: true, dryRun: true });

		expect(fs.move).not.toHaveBeenCalled();
		expect(fs.rmdir).not.toHaveBeenCalled();
		expect(result.actions).toEqual([
			{ from: path.join("images", "photo.jpg"), to: "photo.jpg" },
		]);
	});
});

describe("getAvailablePath", () => {
	it("returns the path unchanged when it is free", async () => {
		fs.pathExists.mockResolvedValue(false);
		expect(await getAvailablePath("/x/a.txt")).toBe("/x/a.txt");
	});

	it("increments the counter until a free name is found", async () => {
		const taken = new Set(["/x/a.txt", "/x/a (1).txt"]);
		fs.pathExists.mockImplementation(async p => taken.has(p));
		expect(await getAvailablePath("/x/a.txt")).toBe("/x/a (2).txt");
	});
});
