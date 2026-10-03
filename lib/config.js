// @ts-check

import fs from "fs-extra";
import os from "os";
import path from "path";
import { mergeCategories } from "./categories.js";

/** Name of the config file, looked for in the target directory then in $HOME. */
export const CONFIG_NAME = ".sortfilesrc.json";

/**
 * A loaded config file.
 * @typedef {Object} LoadedConfig
 * @property {string} path - The file it was read from.
 * @property {Record<string, string[]>} categories - Custom categories, as written.
 */

/**
 * Finds and reads the config file. An explicit configPath must exist;
 * otherwise the target directory is checked first, then the home directory.
 * Config files are never merged: the first one found is used.
 * @param {string} targetDir
 * @param {{ configPath?: string, home?: string }} [options]
 * @returns {Promise<LoadedConfig | null>} Null if there is no config file.
 * @throws {Error} If the file is missing (explicit path only) or invalid.
 */
export async function loadConfig(targetDir, options = {}) {
	const { configPath, home = os.homedir() } = options;

	const candidates = configPath
		? [path.resolve(configPath)]
		: [path.resolve(targetDir, CONFIG_NAME), path.resolve(home, CONFIG_NAME)];

	for (const candidate of candidates) {
		if (await fs.pathExists(candidate)) {
			return readConfig(candidate);
		}
	}

	if (configPath) {
		throw new Error(`Config file not found: ${candidates[0]}`);
	}
	return null;
}

/**
 * @param {string} file
 * @returns {Promise<LoadedConfig>}
 */
async function readConfig(file) {
	/** @type {any} */
	let data;
	try {
		data = await fs.readJson(file);
	} catch (error) {
		throw new Error(`Invalid config ${file}: not valid JSON`);
	}

	if (data === null || typeof data !== "object" || Array.isArray(data)) {
		throw new Error(`Invalid config ${file}: expected a JSON object`);
	}

	for (const key of Object.keys(data)) {
		if (key !== "categories") {
			throw new Error(
				`Invalid config ${file}: unknown key "${key}" (expected "categories")`
			);
		}
	}

	const categories = data.categories ?? {};
	try {
		mergeCategories(categories);
	} catch (error) {
		throw new Error(
			`Invalid config ${file}: ${error instanceof Error ? error.message : error}`
		);
	}

	return { path: file, categories };
}
