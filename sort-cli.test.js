import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "fs-extra";
import { program } from "commander";
import { getCategoryForExtension, CATEGORIES, sortFiles } from "./sort-cli.js";

// Mock dependencies
vi.mock("fs-extra");
vi.mock("ora", () => ({
	default: vi.fn(() => ({
		start: vi.fn().mockReturnThis(),
		succeed: vi.fn().mockReturnThis(),
		fail: vi.fn().mockReturnThis(),
	})),
}));

// Suppress console and process.exit during tests
vi.spyOn(console, "log").mockImplementation(() => {});
vi.spyOn(console, "error").mockImplementation(() => {});
const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {});

describe("getCategoryForExtension", () => {
	it('should return "images" for .jpg extension', () => {
		expect(getCategoryForExtension("jpg")).toBe("images");
	});

	it('should return "code" for .js extension', () => {
		expect(getCategoryForExtension("js")).toBe("code");
	});

	it("should be case-insensitive", () => {
		expect(getCategoryForExtension("JPG")).toBe("images");
	});
});

describe("sortFiles logic", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		program.opts = vi.fn().mockReturnValue({ revert: false, dryRun: false });
		program.args = [];

		// Default fs mocks
		fs.pathExists.mockResolvedValue(true);
		fs.readdir.mockResolvedValue([]);
		fs.ensureDir.mockResolvedValue(true);
		fs.move.mockResolvedValue(true);
		fs.remove.mockResolvedValue(true);
	});

	it("should move files into category folders", async () => {
		const mockFiles = [
			{ isFile: () => true, name: "photo.jpg" },
			{ isFile: () => true, name: "document.pdf" },
		];

		fs.readdir.mockResolvedValue(mockFiles);

		await sortFiles();

		expect(fs.ensureDir).toHaveBeenCalledWith(
			expect.stringContaining("images")
		);
		expect(fs.ensureDir).toHaveBeenCalledWith(
			expect.stringContaining("documents")
		);
		expect(fs.move).toHaveBeenCalledTimes(2);
	});

	it("should skip hidden files", async () => {
		fs.readdir.mockResolvedValue([
			{ isFile: () => true, name: ".eslintrc.json" },
			{ isFile: () => true, name: "app.js" },
		]);

		await sortFiles();

		expect(fs.move).toHaveBeenCalledTimes(1);
		expect(fs.move).toHaveBeenCalledWith(
			expect.stringContaining("app.js"),
			expect.stringContaining("code"),
			expect.anything()
		);
	});

	it("should sort a user file named sort-cli.js", async () => {
		fs.readdir.mockResolvedValue([{ isFile: () => true, name: "sort-cli.js" }]);

		await sortFiles();

		expect(fs.move).toHaveBeenCalledTimes(1);
	});

	it("should respect dry-run flag", async () => {
		program.opts.mockReturnValue({ dryRun: true });

		const mockFiles = [{ isFile: () => true, name: "photo.jpg" }];
		fs.readdir.mockResolvedValue(mockFiles);

		await sortFiles();

		expect(fs.move).not.toHaveBeenCalled();
	});

	it("should handle missing directory", async () => {
		fs.pathExists.mockResolvedValue(false);

		await sortFiles();

		expect(exitSpy).toHaveBeenCalledWith(1);
	});

	it("should revert files correctly", async () => {
		program.opts.mockReturnValue({ revert: true });

		// Mock directory structure for revert
		fs.pathExists.mockImplementation(path => {
			// Check if the path ends with any of the category names
			return Object.keys(CATEGORIES).some(cat => path.endsWith(cat));
		});

		fs.readdir.mockImplementation(path => {
			if (path.endsWith("images")) return Promise.resolve(["photo.jpg"]);
			return Promise.resolve([]);
		});

		await sortFiles();

		expect(fs.move).toHaveBeenCalled();
		expect(fs.remove).toHaveBeenCalledWith(expect.stringContaining("images"));
	});
});
