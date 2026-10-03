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
	],
	archives: ["zip", "rar", "7z", "tar", "gz", "bz2", "xz", "iso"],
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
	],
	code: [
		"js",
		"py",
		"html",
		"css",
		"ts",
		"json",
		"go",
		"md",
		"jsx",
		"tsx",
		"c",
		"cpp",
		"java",
	],
	executables: ["exe", "dmg", "pkg", "app", "sh", "bin"],
	ebooks: ["epub", "mobi", "azw3", "fb2"],
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
