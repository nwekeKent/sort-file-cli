// @ts-check

import fs from "fs-extra";
import path from "path";
import { CATEGORIES, getCategoryForExtension } from "./categories.js";

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
	const result = { moved: 0, skipped: 0, errors: [], actions: [] };

	/**
	 * Resolves a collision-free destination, then moves (or, in a dry run,
	 * only records) a single file. Failures are recorded, not thrown.
	 * @param {string} sourcePath
	 * @param {string} desiredPath
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
			return;
		}

		try {
			await fs.ensureDir(path.dirname(destinationPath));
			await fs.move(sourcePath, destinationPath, {
				overwrite: Boolean(options.force),
			});
			result.actions.push(action);
			result.moved++;
		} catch (error) {
			result.errors.push({
				file: action.from,
				message: error instanceof Error ? error.message : String(error),
			});
		}
	};

	if (options.revert) {
		await revertCategories(targetDir, options, result, moveFile);
	} else {
		await organizeFiles(targetDir, result, moveFile);
	}

	return result;
}

/**
 * Moves each sortable file in the root of targetDir into its category folder.
 * @param {string} targetDir
 * @param {SortResult} result
 * @param {(source: string, desired: string) => Promise<void>} moveFile
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
 * @param {(source: string, desired: string) => Promise<void>} moveFile
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
