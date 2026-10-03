// @ts-check

import fs from "fs-extra";
import path from "path";
import { CATEGORIES, getCategoryForExtension } from "./categories.js";
import { readManifest, writeManifest } from "./manifest.js";

/** @typedef {import("./manifest.js").Manifest} Manifest */
/** @typedef {import("./manifest.js").ManifestMove} ManifestMove */

/**
 * Options controlling a sort or revert run.
 * @typedef {Object} SortOptions
 * @property {boolean} [dryRun] - Report what would happen without moving files.
 * @property {boolean} [revert] - Move files back out of category folders.
 * @property {boolean} [force] - Overwrite existing files instead of renaming.
 */

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
	if (!(await fs.pathExists(targetDir))) {
		throw new Error(`Directory not found: ${targetDir}`);
	}
	if (!(await fs.stat(targetDir)).isDirectory()) {
		throw new Error(`Not a directory: ${targetDir}`);
	}

	/** @type {SortResult} */
	const result = {
		moved: 0,
		skipped: 0,
		errors: [],
		actions: [],
		warnings: [],
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
		await organizeFiles(targetDir, result, moveFile);
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
 * Moves each sortable file in the root of targetDir into its category folder.
 * @param {string} targetDir
 * @param {SortResult} result
 * @param {MoveFile} moveFile
 */
async function organizeFiles(targetDir, result, moveFile) {
	const entries = await fs.readdir(targetDir, { withFileTypes: true });

	for (const entry of entries) {
		const extension = path.extname(entry.name).slice(1);
		const category = getCategoryForExtension(extension);

		// Skip directories, hidden files, and files with no matching category
		if (!entry.isFile() || entry.name.startsWith(".") || !category) {
			result.skipped++;
			continue;
		}

		await moveFile(
			path.join(targetDir, entry.name),
			path.join(targetDir, category, entry.name)
		);
	}
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
