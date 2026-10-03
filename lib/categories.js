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
 * Lookup from lowercase extension to category name, built once at load time.
 * @type {Map<string, string>}
 */
const EXTENSION_TO_CATEGORY = new Map();

for (const [category, extensions] of Object.entries(CATEGORIES)) {
	for (const extension of extensions) {
		const existing = EXTENSION_TO_CATEGORY.get(extension);
		if (existing) {
			throw new Error(
				`Extension "${extension}" is listed in both "${existing}" and "${category}"`
			);
		}
		EXTENSION_TO_CATEGORY.set(extension, category);
	}
}

/**
 * Gets the category name for a given file extension.
 * @param {string} extension - The file extension (without dot).
 * @returns {string | null} The category name if found, otherwise null.
 */
export function getCategoryForExtension(extension) {
	return EXTENSION_TO_CATEGORY.get(extension.toLowerCase()) ?? null;
}
