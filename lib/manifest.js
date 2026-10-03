// @ts-check

import fs from "fs-extra";
import path from "path";

/** Name of the file recording moves, stored in the sorted directory. */
export const MANIFEST_NAME = ".sort-files-manifest.json";

const MANIFEST_VERSION = 1;

/**
 * A recorded move, with paths relative to the sorted directory.
 * @typedef {Object} ManifestMove
 * @property {string} from - Where the file was before sorting.
 * @property {string} to - Where sorting put it.
 */

/**
 * @typedef {Object} Manifest
 * @property {number} version
 * @property {ManifestMove[]} moves - In the order they were performed.
 */

/**
 * Reads the manifest from a directory.
 * @param {string} targetDir
 * @returns {Promise<Manifest | null>} The manifest, or null if none exists.
 * @throws {Error} If the manifest exists but is unreadable or malformed.
 */
export async function readManifest(targetDir) {
	const manifestPath = path.join(targetDir, MANIFEST_NAME);

	if (!(await fs.pathExists(manifestPath))) {
		return null;
	}

	/** @type {any} */
	let data;
	try {
		data = await fs.readJson(manifestPath);
	} catch (error) {
		throw corruptManifestError(manifestPath, "it is not valid JSON");
	}

	const valid =
		data &&
		data.version === MANIFEST_VERSION &&
		Array.isArray(data.moves) &&
		data.moves.every(
			(/** @type {any} */ m) =>
				m && typeof m.from === "string" && typeof m.to === "string"
		);

	if (!valid) {
		throw corruptManifestError(manifestPath, "it has an unexpected format");
	}

	return data;
}

/**
 * Writes the manifest, or deletes it when there are no moves left to record.
 * @param {string} targetDir
 * @param {ManifestMove[]} moves
 * @returns {Promise<void>}
 */
export async function writeManifest(targetDir, moves) {
	const manifestPath = path.join(targetDir, MANIFEST_NAME);

	if (moves.length === 0) {
		await fs.remove(manifestPath);
		return;
	}

	await fs.writeJson(
		manifestPath,
		{ version: MANIFEST_VERSION, moves },
		{ spaces: 2 }
	);
}

/**
 * @param {string} manifestPath
 * @param {string} reason
 * @returns {Error}
 */
function corruptManifestError(manifestPath, reason) {
	return new Error(
		`Cannot use ${manifestPath}: ${reason}. Fix or delete it to continue ` +
			`(without it, --revert falls back to emptying category folders).`
	);
}
