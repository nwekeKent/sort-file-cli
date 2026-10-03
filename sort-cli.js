#!/usr/bin/env node
// @ts-check

import fs from "fs-extra";
import path from "path";
import { program } from "commander";
import chalk from "chalk";
import ora from "ora";
import { fileURLToPath } from "url";

/**
 * @typedef {keyof typeof CATEGORIES} CategoryName
 */

/**
 * Options accepted from the command line.
 * @typedef {Object} SortOptions
 * @property {boolean} [dryRun] - Show what would happen without moving files.
 * @property {boolean} [revert] - Move files back out of category folders.
 * @property {boolean} [force] - Overwrite existing files instead of renaming.
 */

/**
 * A move that failed, reported in the end-of-run summary.
 * @typedef {Object} MoveError
 * @property {string} file - Source path relative to the target directory.
 * @property {string} message - The underlying error message.
 */

/**
 * Reads the package version from package.json.
 * @returns {{ version: string }} The version, or "1.0.0" if it can't be read.
 */
function getPackageConfig() {
	try {
		const __dirname = path.dirname(fileURLToPath(import.meta.url));
		const data = fs.readJsonSync(path.join(__dirname, "package.json"));
		return { version: data.version || "1.0.0" };
	} catch (e) {
		return { version: "1.0.0" };
	}
}

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

program
	.version(getPackageConfig().version)
	.description("A CLI tool to sort files into predefined categories")
	.argument("[dir]", "Directory to sort (defaults to current directory)")
	.option("-d, --dry-run", "Show what would be done without making changes")
	.option("-r, --revert", "Revert files back to original directory")
	.option("-f, --force", "Overwrite existing files instead of renaming")
	.parse(process.argv);

/** @type {() => SortOptions} */
const getOptions = () => program.opts();

/**
 * Gets the category name for a given file extension.
 * @param {string} extension - The file extension (without dot).
 * @returns {string | null} The category name if found, otherwise null.
 */
export function getCategoryForExtension(extension) {
	for (const [category, extensions] of Object.entries(CATEGORIES)) {
		if (extensions.includes(extension.toLowerCase())) {
			return category;
		}
	}
	return null;
}

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
 * Sorts (or reverts) files in the directory given on the command line,
 * defaulting to the current working directory.
 * @returns {Promise<void>}
 */
async function sortFiles() {
	try {
		const targetDir = program.args[0] || process.cwd();
		const spinner = ora(
			getOptions().revert ? "Reverting files..." : "Sorting files..."
		).start();

		if (!(await fs.pathExists(targetDir))) {
			spinner.fail(chalk.red(`Directory not found: ${targetDir}`));
			process.exit(1);
			return;
		}

		if (!(await fs.stat(targetDir)).isDirectory()) {
			spinner.fail(chalk.red(`Not a directory: ${targetDir}`));
			process.exit(1);
			return;
		}

		const files = await fs.readdir(targetDir, { withFileTypes: true });
		let moveCount = 0;
		let skipCount = 0;
		/** @type {MoveError[]} */
		const errors = [];

		/**
		 * Moves a single file, recording a failure instead of aborting the run.
		 * @param {string} sourcePath
		 * @param {string} destinationPath
		 * @returns {Promise<void>}
		 */
		const moveFile = async (sourcePath, destinationPath) => {
			try {
				await fs.move(sourcePath, destinationPath, {
					overwrite: Boolean(getOptions().force),
				});
				moveCount++;
			} catch (error) {
				errors.push({
					file: path.relative(targetDir, sourcePath),
					message: error instanceof Error ? error.message : String(error),
				});
			}
		};

		if (getOptions().revert) {
			// Only revert predefined category folders
			for (const category of Object.keys(CATEGORIES)) {
				const categoryPath = path.join(targetDir, category);

				// Skip if category folder doesn't exist
				if (!(await fs.pathExists(categoryPath))) {
					continue;
				}

				const entries = await fs.readdir(categoryPath, {
					withFileTypes: true,
				});

				for (const entry of entries) {
					// Never move subdirectories out of a category folder
					if (!entry.isFile()) {
						skipCount++;
						continue;
					}

					const sourcePath = path.join(categoryPath, entry.name);
					const desiredPath = path.join(targetDir, entry.name);
					const destinationPath = getOptions().force
						? desiredPath
						: await getAvailablePath(desiredPath);

					if (getOptions().dryRun) {
						console.log(
							chalk.blue(
								`Would move back: ${path.join(category, entry.name)} → ${path.relative(
									targetDir,
									destinationPath
								)}`
							)
						);
						moveCount++;
						continue;
					}

					// Move file back to root directory
					await moveFile(sourcePath, destinationPath);
				}

				// Remove the category folder only if it is now empty
				if (
					!getOptions().dryRun &&
					(await fs.readdir(categoryPath)).length === 0
				) {
					await fs.rmdir(categoryPath);
				}
			}
		} else {
			// Sorting logic
			for (const file of files) {
				// Skip if it's not a file or if it's inside a directory
				if (!file.isFile()) {
					skipCount++;
					continue;
				}

				const fileExtension = path.extname(file.name).slice(1).toLowerCase();
				const category = getCategoryForExtension(fileExtension);

				// Skip hidden files (dotfiles) and files with no matching category
				if (file.name.startsWith(".") || !category) {
					skipCount++;
					continue;
				}

				const categoryFolder = path.join(targetDir, category);
				const sourcePath = path.join(targetDir, file.name);
				const desiredPath = path.join(categoryFolder, file.name);
				const destinationPath = getOptions().force
					? desiredPath
					: await getAvailablePath(desiredPath);

				if (getOptions().dryRun) {
					console.log(
						chalk.blue(
							`Would move: ${file.name} → ${path.relative(
								targetDir,
								destinationPath
							)}`
						)
					);
					moveCount++;
					continue;
				}

				await fs.ensureDir(categoryFolder);
				if (sourcePath !== destinationPath) {
					await moveFile(sourcePath, destinationPath);
				} else {
					skipCount++;
				}
			}
		}

		if (errors.length > 0) {
			spinner.warn(
				chalk.yellow(
					`Finished with ${errors.length} error${errors.length === 1 ? "" : "s"}:`
				)
			);
			for (const { file, message } of errors) {
				console.error(chalk.red(`  ${file}: ${message}`));
			}
			console.log(
				chalk.green(`${moveCount} moved, ${skipCount} skipped`)
			);
			process.exitCode = 1;
		} else if (getOptions().dryRun) {
			spinner.succeed(
				chalk.green(
					`Dry run complete. Would ${
						getOptions().revert ? "revert" : "move"
					} ${moveCount} files.`
				)
			);
		} else {
			spinner.succeed(
				chalk.green(
					`Successfully ${
						getOptions().revert ? "reverted" : "sorted"
					} ${moveCount} files (${skipCount} skipped)`
				)
			);
		}
	} catch (error) {
		console.error(
			chalk.red(
				"Error:",
				error instanceof Error ? error.message : String(error)
			)
		);
		process.exit(1);
	}
}

// Run the tool if this file is being executed directly
if (
	process.argv[1] &&
	(process.argv[1].endsWith("sort-cli.js") ||
		process.argv[1].endsWith("sort-files"))
) {
	sortFiles();
}

export { sortFiles };
