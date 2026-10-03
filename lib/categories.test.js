import { describe, it, expect } from "vitest";
import { getCategoryForExtension, CATEGORIES } from "./categories.js";

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

describe("CATEGORIES", () => {
	it("lists every extension in exactly one category", () => {
		const all = Object.values(CATEGORIES).flat();
		expect(new Set(all).size).toBe(all.length);
	});

	it("returns null for unknown extensions", () => {
		expect(getCategoryForExtension("zzz")).toBeNull();
		expect(getCategoryForExtension("")).toBeNull();
	});
});

describe("category placements", () => {
	it.each([
		["md", "documents"],
		["markdown", "documents"],
		["csv", "documents"],
		["json", "code"],
		["yml", "code"],
		["heic", "images"],
		["avif", "images"],
		["opus", "music"],
		["tgz", "archives"],
		["gz", "archives"],
		["msi", "executables"],
		["apk", "executables"],
		["cbz", "ebooks"],
	])("puts .%s in %s", (extension, category) => {
		expect(getCategoryForExtension(extension)).toBe(category);
	});

	it("does not list .app, which is a directory bundle on macOS", () => {
		expect(getCategoryForExtension("app")).toBeNull();
	});

	it("keeps .ts as code rather than video", () => {
		expect(getCategoryForExtension("ts")).toBe("code");
	});
});
