// @ts-check

import fs from "fs-extra";
import os from "os";
import path from "path";
import { CATEGORIES, getCategoryForExtension } from "./categories.js";
import { MANIFEST_NAME, readManifest, writeManifest } from "./manifest.js";

/** @typedef {import("./manifest.js").Manifest} Manifest */
/** @typedef {import("./manifest.js").ManifestMove} ManifestMove */

/**
 * Options controlling a sort or revert run.
 * @typedef {Object} SortOptions
 * @property {boolean} [dryRun] - Report what would happen without moving files.
 * @property {boolean} [revert] - Move files back out of category folders.
 * @property {boolean} [force] - Overwrite existing files instead of renaming.
 * @property {string[]} [include] - Only sort these categories (sorting only).
 * @property {string[]} [exclude] - Never sort these categories (sorting only).
 * @property {boolean} [includeHidden] - Also sort hidden files (dotfiles).
 * @property {boolean} [yes] - Allow running on a root or home directory.
 * @property {number} [depth] - How many levels of subfolders to descend into
 *   when sorting (default 0: only the top level). Infinity means unlimited.
 */

/** Directories that are never descended into, however deep we are asked to go. */
const NEVER_DESCEND = new Set(["node_modules", ".git"]);

/**
 * A file move, with paths relative to the target directory.
 * @typedef {Object} MoveAction
 * @property {string} from
 * @property {string} to
 */

/**
 * A move that failed.
 * @typedef {Object} MoveError
 * @property {string} file - Source path relative to the target directory.
 * @property {string} message - The underlying error message.
 */

/**
 * The outcome of a sort or revert run.
 * @typedef {Object} SortResult
 * @property {number} moved - Files moved (or that would be moved in a dry run).
 * @property {number} skipped - Entries left in place.
 * @property {MoveError[]} errors - Moves that failed.
 * @property {MoveAction[]} actions - Every move performed or planned.
 * @property {string[]} warnings - Non-fatal notes the caller should show.
 * @property {Record<string, number>} unknown - Files left in place for lack of a
 *   matching category, counted by extension ("" for no extension).
 */

/**
 * Moves one file; resolves to whether it moved (or would, in a dry run).
 * @callback MoveFile
 * @param {string} sourcePath
 * @param {string} desiredPath
 * @returns {Promise<boolean>}
 */

/**
 * Returns a destination path that does not collide with an existing file,
 * appending " (1)", " (2)", ... before the extension when needed.
 * @param {string} destinationPath - The desired destination path.
 * @returns {Promise<string>} A path that does not currently exist.
 */
export async function getAvailablePath(destinationPath) {
	if (!(await fs.pathExists(destinationPath))) {
		return destinationPath;
	}

	const { dir, name, ext } = path.parse(destinationPath);
	let counter = 1;
	let candidate;
	do {
		candidate = path.join(dir, `${name} (${counter})${ext}`);
		counter++;
	} while (await fs.pathExists(candidate));

	return candidate;
}

/**
 * Sorts the files in a directory into category folders, or moves them back.
 * Throws if the target is missing or not a directory; per-file failures are
 * collected in the result instead.
 * @param {string} targetDir - Directory to process.
 * @param {SortOptions} [options]
 * @returns {Promise<SortResult>}
 */
export async function sortFiles(targetDir, options = {}) {
	const isSelected = buildCategoryFilter(options);
	const depth = options.depth ?? 0;
	if (!(depth >= 0) || (Number.isFinite(depth) && !Number.isInteger(depth))) {
		throw new Error(`Invalid depth "${depth}": use a whole number, 0 or more`);
	}

	if (!(await fs.pathExists(targetDir))) {
		throw new Error(`Directory not found: ${targetDir}`);
	}
	if (!(await fs.stat(targetDir)).isDirectory()) {
		throw new Error(`Not a directory: ${targetDir}`);
	}
	if (!options.yes) {
		await assertNotProtected(targetDir);
	}

	/** @type {SortResult} */
	const result = {
		moved: 0,
		skipped: 0,
		errors: [],
		actions: [],
		warnings: [],
		unknown: {},
	};

	// Validate any existing manifest before touching files, so a corrupt one
	// fails the run up front instead of after the moves.
	const manifest = await readManifest(targetDir);

	/**
	 * Resolves a collision-free destination, then moves (or, in a dry run,
	 * only records) a single file. Failures are recorded, not thrown.
	 * @type {MoveFile}
	 */
	const moveFile = async (sourcePath, desiredPath) => {
		const destinationPath = options.force
			? desiredPath
			: await getAvailablePath(desiredPath);
		const action = {
			from: path.relative(targetDir, sourcePath),
			to: path.relative(targetDir, destinationPath),
		};

		if (options.dryRun) {
			result.actions.push(action);
			result.moved++;
			return true;
		}

		try {
			await fs.ensureDir(path.dirname(destinationPath));
			await fs.move(sourcePath, destinationPath, {
				overwrite: Boolean(options.force),
			});
			result.actions.push(action);
			result.moved++;
			return true;
		} catch (error) {
			result.errors.push({
				file: action.from,
				message: error instanceof Error ? error.message : String(error),
			});
			return false;
		}
	};

	if (options.revert && manifest) {
		await revertFromManifest(targetDir, manifest, options, result, moveFile);
	} else if (options.revert) {
		await revertCategories(targetDir, options, result, moveFile);
		if (result.moved > 0) {
			result.warnings.push(
				"No manifest found; moved back every file in the category folders, " +
					"including any that were there before sorting."
			);
		}
	} else {
		await organizeFiles(targetDir, options, result, moveFile, isSelected);
		await recordMoves(targetDir, manifest, options, result);
	}

	return result;
}

/**
 * Appends this run's moves to the manifest so a later revert can undo them.
 * @param {string} targetDir
 * @param {Manifest | null} manifest - The manifest read before sorting.
 * @param {SortOptions} options
 * @param {SortResult} result
 */
async function recordMoves(targetDir, manifest, options, result) {
	if (options.dryRun || result.actions.length === 0) {
		return;
	}

	try {
		await writeManifest(targetDir, [
			...(manifest?.moves ?? []),
			...result.actions,
		]);
	} catch (error) {
		result.warnings.push(
			`Files were sorted but the undo manifest could not be written: ${
				error instanceof Error ? error.message : String(error)
			}`
		);
	}
}

/**
 * Undoes recorded moves, newest first, restoring each file to where it was
 * before sorting. Files the manifest does not mention are never touched.
 * Moves that could not be undone because of an error stay in the manifest.
 * @param {string} targetDir
 * @param {Manifest} manifest
 * @param {SortOptions} options
 * @param {SortResult} result
 * @param {MoveFile} moveFile
 */
async function revertFromManifest(
	targetDir,
	manifest,
	options,
	result,
	moveFile
) {
	/** @type {ManifestMove[]} */
	const remaining = [];

	for (const move of [...manifest.moves].reverse()) {
		const sourcePath = path.resolve(targetDir, move.to);
		const desiredPath = path.resolve(targetDir, move.from);

		if (!isInside(targetDir, sourcePath) || !isInside(targetDir, desiredPath)) {
			result.skipped++;
			result.warnings.push(`Ignored manifest entry outside the directory: ${move.to}`);
			continue;
		}

		if (!(await fs.pathExists(sourcePath))) {
			result.skipped++;
			result.warnings.push(`${move.to} no longer exists, so it was not restored.`);
			continue;
		}

		if (!(await moveFile(sourcePath, desiredPath))) {
			remaining.unshift(move);
			continue;
		}

		if (!options.dryRun) {
			await removeIfEmpty(path.dirname(sourcePath), targetDir);
		}
	}

	if (!options.dryRun) {
		await writeManifest(targetDir, remaining);
	}
}

/**
 * @param {string} parent
 * @param {string} child
 * @returns {boolean} Whether child is strictly inside parent.
 */
function isInside(parent, child) {
	const relative = path.relative(parent, child);
	return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

/**
 * Removes a directory if it is empty, never removing the root itself.
 * @param {string} dir
 * @param {string} root
 */
async function removeIfEmpty(dir, root) {
	if (isInside(root, dir) && (await fs.readdir(dir)).length === 0) {
		await fs.rmdir(dir);
	}
}

/**
 * Builds a predicate for which categories --include/--exclude allow.
 * @param {SortOptions} options
 * @returns {(category: string) => boolean}
 * @throws {Error} On unknown category names, or filters combined with revert.
 */
function buildCategoryFilter(options) {
	const include = options.include ?? [];
	const exclude = options.exclude ?? [];

	if (options.revert && (include.length > 0 || exclude.length > 0)) {
		throw new Error("--include and --exclude cannot be used with --revert");
	}

	const valid = Object.keys(CATEGORIES);
	for (const name of [...include, ...exclude]) {
		if (!valid.includes(name)) {
			throw new Error(
				`Unknown category "${name}". Valid categories: ${valid.join(", ")}`
			);
		}
	}

	return category =>
		(include.length === 0 || include.includes(category)) &&
		!exclude.includes(category);
}

/**
 * Refuses to run on a filesystem root or the user's home directory, where a
 * sort would scatter or bury far more than the user likely intends.
 * @param {string} targetDir
 * @throws {Error} If targetDir is protected.
 */
async function assertNotProtected(targetDir) {
	const resolved = await fs.realpath(targetDir);
	const home = await fs.realpath(os.homedir()).catch(() => null);
	const isRoot = path.parse(resolved).root === resolved;

	if (isRoot || resolved === home) {
		throw new Error(
			`Refusing to run on ${resolved}: it is ${
				isRoot ? "a filesystem root" : "your home directory"
			}. Pass --yes to proceed anyway.`
		);
	}
}

/**
 * Moves each sortable file into a category folder next to it. With a depth
 * above 0 this also descends into subfolders, so a file in "trip/" ends up in
 * "trip/images/" rather than being pulled up to the top.
 * @param {string} targetDir
 * @param {SortOptions} options
 * @param {SortResult} result
 * @param {MoveFile} moveFile
 * @param {(category: string) => boolean} isSelected
 */
async function organizeFiles(targetDir, options, result, moveFile, isSelected) {
	const maxDepth = options.depth ?? 0;

	/**
	 * @param {string} dir
	 * @param {number} level - 0 for targetDir itself.
	 */
	const visit = async (dir, level) => {
		const entries = await fs.readdir(dir, { withFileTypes: true });

		for (const entry of entries) {
			if (
				entry.isDirectory() &&
				level < maxDepth &&
				shouldDescend(entry.name, options)
			) {
				await visit(path.join(dir, entry.name), level + 1);
				continue;
			}

			const extension = path.extname(entry.name).slice(1);
			const category = getCategoryForExtension(extension);

			// Skip directories, hidden files (unless asked for), and our own manifest
			const hidden = entry.name.startsWith(".") && !options.includeHidden;
			if (!entry.isFile() || hidden || entry.name === MANIFEST_NAME) {
				result.skipped++;
				continue;
			}

			// Leave files with no matching category in place, and say which
			if (!category) {
				const key = extension.toLowerCase();
				result.unknown[key] = (result.unknown[key] ?? 0) + 1;
				result.skipped++;
				continue;
			}

			// Leave files in categories the user filtered out untouched
			if (!isSelected(category)) {
				result.skipped++;
				continue;
			}

			await moveFile(
				path.join(dir, entry.name),
				path.join(dir, category, entry.name)
			);
		}
	};

	await visit(targetDir, 0);
}

/**
 * Whether a recursive sort should look inside a subfolder. Category folders
 * are already sorted, and version-control and dependency folders are not ours
 * to touch.
 * @param {string} name - The directory's name.
 * @param {SortOptions} options
 * @returns {boolean}
 */
function shouldDescend(name, options) {
	if (NEVER_DESCEND.has(name) || Object.hasOwn(CATEGORIES, name)) {
		return false;
	}
	return !name.startsWith(".") || Boolean(options.includeHidden);
}

/**
 * Moves files out of the predefined category folders back into targetDir,
 * removing each category folder only if it ends up empty.
 * @param {string} targetDir
 * @param {SortOptions} options
 * @param {SortResult} result
 * @param {MoveFile} moveFile
 */
async function revertCategories(targetDir, options, result, moveFile) {
	for (const category of Object.keys(CATEGORIES)) {
		const categoryPath = path.join(targetDir, category);

		if (!(await fs.pathExists(categoryPath))) {
			continue;
		}

		const entries = await fs.readdir(categoryPath, { withFileTypes: true });

		for (const entry of entries) {
			// Never move subdirectories out of a category folder
			if (!entry.isFile()) {
				result.skipped++;
				continue;
			}

			await moveFile(
				path.join(categoryPath, entry.name),
				path.join(targetDir, entry.name)
			);
		}

		if (!options.dryRun && (await fs.readdir(categoryPath)).length === 0) {
			await fs.rmdir(categoryPath);
		}
	}
}
