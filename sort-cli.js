#!/usr/bin/env node
// @ts-check

import fs from "fs-extra";
import path from "path";
import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { fileURLToPath } from "url";
import { sortFiles } from "./lib/sorter.js";

export { CATEGORIES, getCategoryForExtension } from "./lib/categories.js";
export { sortFiles, getAvailablePath } from "./lib/sorter.js";

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
 * Describes files left in place for lack of a matching category, most
 * common extension first, e.g. ".xyz (3), no extension (1)".
 * @param {Record<string, number>} unknown - Counts keyed by extension.
 * @returns {string} Empty when there is nothing to report.
 */
export function formatUnknown(unknown) {
	return Object.entries(unknown)
		.sort(([extA, a], [extB, b]) => b - a || extA.localeCompare(extB))
		.map(([ext, count]) => `${ext ? `.${ext}` : "no extension"} (${count})`)
		.join(", ");
}

/**
 * Runs the CLI: parses arguments, sorts or reverts, and prints the outcome.
 * Failures set process.exitCode rather than exiting, so callers stay in control.
 * @param {string[]} [argv] - Full argv, including the node and script entries.
 * @returns {Promise<void>}
 */
export async function main(argv = process.argv) {
	const program = new Command();

	program
		.version(getPackageConfig().version)
		.description("A CLI tool to sort files into predefined categories")
		.argument("[dir]", "Directory to sort (defaults to current directory)")
		.option("-d, --dry-run", "Show what would be done without making changes")
		.option(
			"-r, --revert",
			"Undo the last sort(s), using the recorded manifest when available"
		)
		.option("-f, --force", "Overwrite existing files instead of renaming");

	program.parse(argv);

	/** @type {import("./lib/sorter.js").SortOptions} */
	const options = program.opts();
	const targetDir = program.args[0] || process.cwd();
	const spinner = ora(
		options.revert ? "Reverting files..." : "Sorting files..."
	).start();

	try {
		const result = await sortFiles(targetDir, options);

		// Stop the spinner before printing so the output doesn't interleave
		spinner.stop();

		if (options.dryRun) {
			for (const { from, to } of result.actions) {
				const verb = options.revert ? "Would move back" : "Would move";
				console.log(chalk.blue(`${verb}: ${from} → ${to}`));
			}
		}

		for (const warning of result.warnings) {
			console.warn(chalk.yellow(`Warning: ${warning}`));
		}

		if (result.errors.length > 0) {
			const count = result.errors.length;
			console.log(
				chalk.yellow(`Finished with ${count} error${count === 1 ? "" : "s"}:`)
			);
			for (const { file, message } of result.errors) {
				console.error(chalk.red(`  ${file}: ${message}`));
			}
			console.log(
				chalk.green(`${result.moved} moved, ${result.skipped} skipped`)
			);
			process.exitCode = 1;
		} else if (options.dryRun) {
			spinner.succeed(
				chalk.green(
					`Dry run complete. Would ${
						options.revert ? "revert" : "move"
					} ${result.moved} files.`
				)
			);
		} else {
			spinner.succeed(
				chalk.green(
					`Successfully ${options.revert ? "reverted" : "sorted"} ${
						result.moved
					} files (${result.skipped} skipped)`
				)
			);
		}

		const unknown = formatUnknown(result.unknown);
		if (unknown && !options.revert) {
			console.log(chalk.gray(`Left in place (no matching category): ${unknown}`));
		}
	} catch (error) {
		spinner.fail(
			chalk.red(error instanceof Error ? error.message : String(error))
		);
		process.exitCode = 1;
	}
}

/**
 * True when this module is the process entry point, including when it is
 * launched through an npm-installed symlink (where argv[1] is the link path).
 * @returns {boolean}
 */
function isMainModule() {
	if (!process.argv[1]) return false;
	try {
		return (
			fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
		);
	} catch (e) {
		return false;
	}
}

if (isMainModule()) {
	main();
}
