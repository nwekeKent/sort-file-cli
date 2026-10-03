#!/usr/bin/env node

import fs from "fs-extra";
import path from "path";
import { program } from "commander";
import chalk from "chalk";
import ora from "ora";
import { fileURLToPath } from "url";

// Helper to get package info
function getPackageConfig() {
	try {
		const __dirname = path.dirname(fileURLToPath(import.meta.url));
		const data = fs.readJsonSync(path.join(__dirname, "package.json"));
		return { version: data.version || "1.0.0" };
	} catch (e) {
		return { version: "1.0.0" };
	}
}

// Predefined categories and their extensions
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
	.parse(process.argv);

/**
 * Gets the category name for a given file extension.
 * @param {string} extension - The file extension (without dot).
 * @returns {string|null} The category name if found, otherwise null.
 */
export function getCategoryForExtension(extension) {
	for (const [category, extensions] of Object.entries(CATEGORIES)) {
		if (extensions.includes(extension.toLowerCase())) {
			return category;
		}
	}
	return null;
}

async function sortFiles() {
	try {
		const targetDir = program.args[0] || process.cwd();
		const spinner = ora(
			program.opts().revert ? "Reverting files..." : "Sorting files..."
		).start();

		if (!(await fs.pathExists(targetDir))) {
			spinner.fail(chalk.red(`Directory not found: ${targetDir}`));
			process.exit(1);
		}

		const files = await fs.readdir(targetDir, { withFileTypes: true });
		let moveCount = 0;
		let skipCount = 0;

		if (program.opts().revert) {
			// Only revert predefined category folders
			for (const category of Object.keys(CATEGORIES)) {
				const categoryPath = path.join(targetDir, category);

				// Skip if category folder doesn't exist
				if (!(await fs.pathExists(categoryPath))) {
					continue;
				}

				const categoryFiles = await fs.readdir(categoryPath);

				for (const file of categoryFiles) {
					const sourcePath = path.join(categoryPath, file);
					const destinationPath = path.join(targetDir, file);

					if (program.opts().dryRun) {
						console.log(
							chalk.blue(
								`Would move back: ${path.join(category, file)} → ${file}`
							)
						);
						moveCount++;
						continue;
					}

					// Move file back to root directory
					await fs.move(sourcePath, destinationPath, { overwrite: true });
					moveCount++;
				}

				// Remove the empty category folder
				if (!program.opts().dryRun) {
					await fs.remove(categoryPath);
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
				const destinationPath = path.join(categoryFolder, file.name);

				if (program.opts().dryRun) {
					console.log(
						chalk.blue(
							`Would move: ${file.name} → ${path.join(category, file.name)}`
						)
					);
					moveCount++;
					continue;
				}

				await fs.ensureDir(categoryFolder);
				if (sourcePath !== destinationPath) {
					await fs.move(sourcePath, destinationPath, { overwrite: true });
					moveCount++;
				} else {
					skipCount++;
				}
			}
		}

		if (program.opts().dryRun) {
			spinner.succeed(
				chalk.green(
					`Dry run complete. Would ${
						program.opts().revert ? "revert" : "move"
					} ${moveCount} files.`
				)
			);
		} else {
			spinner.succeed(
				chalk.green(
					`Successfully ${
						program.opts().revert ? "reverted" : "sorted"
					} ${moveCount} files (${skipCount} skipped)`
				)
			);
		}
	} catch (error) {
		console.error(chalk.red("Error:", error.message));
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
