/**
 * Predefined categories mapped to their file extensions (lowercase, no dot).
 * @type {Record<string, string[]>}
 */
export const CATEGORIES = {
	images: [
		"jpg",
		"jpeg",
		"png",
		"gif",
		"bmp",
		"svg",
		"webp",
		"ico",
		"tiff",
		"raw",
		"heic",
		"heif",
		"avif",
		"jfif",
		"psd",
		"ai",
		"eps",
	],
	videos: [
		"mp4",
		"mov",
		"avi",
		"mkv",
		"wmv",
		"flv",
		"webm",
		"m4v",
		"mpeg",
		"3gp",
		"ogv",
	],
	documents: [
		"pdf",
		"doc",
		"docx",
		"txt",
		"rtf",
		"odt",
		"xls",
		"xlsx",
		"ppt",
		"pptx",
		"csv",
		"tsv",
		"odp",
		"ods",
		"pages",
		"numbers",
		"key",
		"md",
		"markdown",
		"log",
	],
	archives: [
		"zip",
		"rar",
		"7z",
		"tar",
		"gz",
		"bz2",
		"xz",
		"iso",
		"tgz",
		"zst",
		"cab",
	],
	music: [
		"mp3",
		"wav",
		"flac",
		"m4a",
		"aac",
		"ogg",
		"wma",
		"aiff",
		"alac",
		"mid",
		"midi",
		"opus",
		"amr",
	],
	code: [
		"js",
		"mjs",
		"cjs",
		"py",
		"html",
		"css",
		"ts",
		"json",
		"go",
		"jsx",
		"tsx",
		"c",
		"cpp",
		"java",
		"h",
		"hpp",
		"cs",
		"rs",
		"rb",
		"php",
		"swift",
		"kt",
		"lua",
		"sql",
		"yml",
		"yaml",
		"toml",
		"xml",
		"scss",
		"sass",
		"less",
		"vue",
		"svelte",
		"ipynb",
	],
	executables: [
		"exe",
		"dmg",
		"pkg",
		"sh",
		"bin",
		"msi",
		"apk",
		"deb",
		"rpm",
		"appimage",
		"bat",
	],
	ebooks: ["epub", "mobi", "azw", "azw3", "fb2", "cbz", "cbr"],
	fonts: ["ttf", "otf", "woff", "woff2", "eot"],
};

/**
 * Builds a function mapping a file extension to its category name.
 * @param {Record<string, string[]>} categories - Category name -> extensions.
 * @returns {(extension: string) => string | null}
 * @throws {Error} If an extension is listed in more than one category.
 */
export function createCategoryLookup(categories) {
	/** @type {Map<string, string>} */
	const extensionToCategory = new Map();

	for (const [category, extensions] of Object.entries(categories)) {
		for (const extension of extensions) {
			const existing = extensionToCategory.get(extension);
			if (existing) {
				throw new Error(
					`Extension "${extension}" is listed in both "${existing}" and "${category}"`,
				);
			}
			extensionToCategory.set(extension, category);
		}
	}

	return extension => extensionToCategory.get(extension.toLowerCase()) ?? null;
}

/** Lookup for the built-in categories; also validates them at load time. */
const lookupBuiltIn = createCategoryLookup(CATEGORIES);

/**
 * Gets the built-in category name for a given file extension.
 * @param {string} extension - The file extension (without dot).
 * @returns {string | null} The category name if found, otherwise null.
 */
export function getCategoryForExtension(extension) {
	return lookupBuiltIn(extension);
}

const CATEGORY_NAME = /^[A-Za-z0-9][A-Za-z0-9 _-]{0,63}$/;

/**
 * Combines the built-in categories with custom ones. A custom category with a
 * built-in's name replaces it; any extension a custom category claims is taken
 * away from the built-ins, so custom definitions always win.
 * @param {Record<string, string[]>} [custom] - Custom category name -> extensions.
 * @returns {Record<string, string[]>} The effective categories.
 * @throws {Error} If the custom categories are malformed.
 */
export function mergeCategories(custom = {}) {
	if (custom === null || typeof custom !== "object" || Array.isArray(custom)) {
		throw new Error('"categories" must be an object of name -> extensions');
	}

	/** @type {Record<string, string[]>} */
	const cleaned = {};
	const seenNames = new Map();
	const builtInNames = new Map(
		Object.keys(CATEGORIES).map(name => [name.toLowerCase(), name]),
	);

	for (const [name, extensions] of Object.entries(custom)) {
		if (!CATEGORY_NAME.test(name)) {
			throw new Error(
				`Invalid category name "${name}": use letters, numbers, spaces, ` +
					`"-" or "_" (at most 64 characters, no slashes or leading dot)`,
			);
		}

		const lower = name.toLowerCase();
		const builtIn = builtInNames.get(lower);
		if (builtIn && builtIn !== name) {
			throw new Error(
				`Category "${name}" differs from built-in "${builtIn}" only by case; use "${builtIn}"`,
			);
		}
		if (seenNames.has(lower)) {
			throw new Error(
				`Categories "${seenNames.get(lower)}" and "${name}" differ only by case`,
			);
		}
		seenNames.set(lower, name);

		if (!Array.isArray(extensions)) {
			throw new Error(`Category "${name}" must be a list of extensions`);
		}
		cleaned[name] = extensions.map(extension => {
			const value =
				typeof extension === "string"
					? extension.trim().replace(/^\./, "").toLowerCase()
					: "";
			if (!value || /[./\\]/.test(value)) {
				throw new Error(
					`Invalid extension ${JSON.stringify(extension)} in "${name}": ` +
						`use a single extension such as "pdf" (the last one is matched)`,
				);
			}
			return value;
		});
	}

	const claimed = new Set(Object.values(cleaned).flat());
	/** @type {Record<string, string[]>} */
	const merged = {};
	for (const [name, extensions] of Object.entries(CATEGORIES)) {
		if (!(name in cleaned)) {
			merged[name] = extensions.filter(extension => !claimed.has(extension));
		}
	}
	Object.assign(merged, cleaned);

	createCategoryLookup(merged); // rejects an extension claimed by two categories
	return merged;
}
