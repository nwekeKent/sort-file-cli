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
