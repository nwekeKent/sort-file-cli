import { describe, it, expect } from "vitest";
import {
	getCategoryForExtension,
	createCategoryLookup,
	mergeCategories,
	CATEGORIES,
} from "./categories.js";

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

describe("createCategoryLookup", () => {
	it("maps extensions case-insensitively and returns null for unknown ones", () => {
		const lookup = createCategoryLookup({ docs: ["pdf"], pics: ["png"] });

		expect(lookup("PDF")).toBe("docs");
		expect(lookup("png")).toBe("pics");
		expect(lookup("zip")).toBeNull();
	});

	it("rejects an extension listed in two categories", () => {
		expect(() => createCategoryLookup({ a: ["x"], b: ["x"] })).toThrow(
			'Extension "x" is listed in both "a" and "b"'
		);
	});
});

describe("mergeCategories", () => {
	it("returns the built-ins when there are no custom categories", () => {
		expect(mergeCategories()).toEqual(CATEGORIES);
		expect(mergeCategories({})).toEqual(CATEGORIES);
	});

	it("does not modify the built-in categories", () => {
		const before = structuredClone(CATEGORIES);

		mergeCategories({ notes: ["md"] });

		expect(CATEGORIES).toEqual(before);
	});

	it("adds new categories, normalising extensions", () => {
		const merged = mergeCategories({ invoices: [".INV", " invoice "] });

		expect(merged.invoices).toEqual(["inv", "invoice"]);
		expect(Object.keys(merged)).toContain("images");
	});

	it("takes claimed extensions away from built-in categories", () => {
		const merged = mergeCategories({ notes: ["md"] });

		expect(merged.notes).toEqual(["md"]);
		expect(merged.documents).not.toContain("md");
		expect(createCategoryLookup(merged)("md")).toBe("notes");
	});

	it("replaces a built-in category by name", () => {
		const merged = mergeCategories({ images: ["png"] });

		expect(merged.images).toEqual(["png"]);
		expect(merged.videos).toEqual(CATEGORIES.videos);
	});

	it("lets an empty list switch a category off", () => {
		expect(mergeCategories({ fonts: [] }).fonts).toEqual([]);
	});

	it.each([
		["a path separator in a name", { "a/b": [] }, "Invalid category name"],
		["a leading dot in a name", { ".hidden": [] }, "Invalid category name"],
		["an empty name", { "": [] }, "Invalid category name"],
		["a name differing only by case from a built-in", { Images: [] }, 'use "images"'],
		["names differing only by case", { Zed: [], zed: [] }, "differ only by case"],
		["a non-list value", { x: "pdf" }, "must be a list"],
		["a dotted extension", { x: ["tar.gz"] }, "single extension"],
		["an empty extension", { x: [""] }, "single extension"],
		["a non-string extension", { x: [1] }, "single extension"],
		["an extension in two custom categories", { a: ["q"], b: ["q"] }, "both"],
	])("rejects %s", (_, custom, message) => {
		expect(() => mergeCategories(custom)).toThrow(message);
	});

	it.each([null, [], "text", 5])("rejects %j as the whole value", value => {
		expect(() => mergeCategories(value)).toThrow("must be an object");
	});
});
