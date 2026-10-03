#!/usr/bin/env node
// @ts-check

import fs from "fs-extra";
import path from "path";
import { Command, InvalidArgumentError, Option } from "commander";
import chalk from "chalk";
import ora from "ora";
import { fileURLToPath } from "url";
import { loadConfig } from "./lib/config.js";
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
 * Options accepted on the command line: the sorter's options plus output modes.
 * @typedef {import("./lib/sorter.js").SortOptions & {
 *   verbose?: boolean,
 *   quiet?: boolean,
 *   json?: boolean,
 *   recursive?: boolean,
 *   config?: string | false
 * }} CliOptions
 */

/**
 * Parses a comma-separated option value into trimmed, lowercase names.
 * @param {string} value
 * @returns {string[]}
 */
export function parseList(value) {
	return value
		.split(",")
		.map(item => item.trim().toLowerCase())
		.filter(Boolean);
}

/**
 * Parses --depth into a non-negative whole number.
 * @param {string} value
 * @returns {number}
 */
export function parseDepth(value) {
	const depth = Number(value);
	if (!/^\d+$/.test(value.trim()) || !Number.isSafeInteger(depth)) {
		throw new InvalidArgumentError("Use a whole number, 0 or more.");
	}
	return depth;
}

/**
 * Builds the object printed by --json.
 * @param {string} targetDir
 * @param {CliOptions} options
 * @param {import("./lib/sorter.js").SortResult} result
 * @param {string | null} [configPath] - The config file in use, if any.
 */
export function toJson(targetDir, options, result, configPath = null) {
	return {
		directory: path.resolve(targetDir),
		mode: options.revert ? "revert" : "sort",
		dryRun: Boolean(options.dryRun),
		config: configPath,
		...result,
	};
}

/**
 * Prints a finished run for a person. --quiet limits this to warnings and
 * errors; --verbose lists every move, not just the planned ones of a dry run.
 * @param {import("./lib/sorter.js").SortResult} result
 * @param {CliOptions} options
 * @param {import("ora").Ora | null} spinner - Null when output is suppressed.
 * @param {string | null} configPath - The config file in use, if any.
 */
function printReport(result, options, spinner, configPath) {
	// Stop the spinner before printing so the output doesn't interleave
	spinner?.stop();

	if (configPath && !options.quiet) {
		console.log(chalk.gray(`Using config: ${configPath}`));
	}

	if (!options.quiet && (options.dryRun || options.verbose)) {
		const verb = options.dryRun
			? options.revert
				? "Would move back"
				: "Would move"
			: options.revert
			? "Moved back"
			: "Moved";
		for (const { from, to } of result.actions) {
			console.log(chalk.blue(`${verb}: ${from} → ${to}`));
		}
	}

	for (const warning of result.warnings) {
		console.warn(chalk.yellow(`Warning: ${warning}`));
	}

	if (result.errors.length > 0) {
		const count = result.errors.length;
		if (!options.quiet) {
			console.log(
				chalk.yellow(`Finished with ${count} error${count === 1 ? "" : "s"}:`)
			);
		}
		for (const { file, message } of result.errors) {
			console.error(chalk.red(`  ${file}: ${message}`));
		}
		if (!options.quiet) {
			console.log(
				chalk.green(`${result.moved} moved, ${result.skipped} skipped`)
			);
		}
	} else if (options.dryRun) {
		spinner?.succeed(
			chalk.green(
				`Dry run complete. Would ${options.revert ? "revert" : "move"} ${
					result.moved
				} files.`
			)
		);
	} else {
		spinner?.succeed(
			chalk.green(
				`Successfully ${options.revert ? "reverted" : "sorted"} ${
					result.moved
				} files (${result.skipped} skipped)`
			)
		);
	}

	const unknown = formatUnknown(result.unknown);
	if (unknown && !options.revert && !options.quiet) {
		console.log(chalk.gray(`Left in place (no matching category): ${unknown}`));
	}
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
		.option("-f, --force", "Overwrite existing files instead of renaming")
		.addOption(
			new Option(
				"--include <categories>",
				"Only sort these categories (comma-separated, e.g. images,documents)"
			)
				.argParser(parseList)
				.conflicts("revert")
		)
		.addOption(
			new Option(
				"--exclude <categories>",
				"Never sort these categories (comma-separated, e.g. code)"
			)
				.argParser(parseList)
				.conflicts("revert")
		)
		.addOption(
			new Option(
				"-R, --recursive",
				"Also sort files in subfolders, into category folders beside them"
			).conflicts("revert")
		)
		.addOption(
			new Option(
				"--depth <levels>",
				"Limit how many subfolder levels --recursive descends (implies --recursive)"
			)
				.argParser(parseDepth)
				.conflicts("revert")
		)
		.option(
			"--config <path>",
			"Read custom categories from this file instead of .sortfilesrc.json"
		)
		.option("--no-config", "Ignore any .sortfilesrc.json")
		.option("--include-hidden", "Also sort hidden files (dotfiles)")
		.option("-y, --yes", "Allow running on a root or home directory")
		.addOption(
			new Option("-v, --verbose", "List every file moved").conflicts([
				"quiet",
				"json",
			])
		)
		.addOption(
			new Option("-q, --quiet", "Only print warnings and errors").conflicts([
				"verbose",
				"json",
			])
		)
		.addOption(
			new Option("--json", "Print the result as JSON for scripts").conflicts([
				"verbose",
				"quiet",
			])
		);

	program.parse(argv);

	/** @type {CliOptions} */
	const options = program.opts();
	if (options.depth === undefined && options.recursive) {
		options.depth = Infinity;
	}
	const targetDir = program.args[0] || process.cwd();
	const spinner =
		options.json || options.quiet
			? null
			: ora(options.revert ? "Reverting files..." : "Sorting files...").start();

	try {
		const config =
			options.config === false
				? null
				: await loadConfig(targetDir, {
						configPath: options.config,
				  });
		const result = await sortFiles(targetDir, {
			...options,
			categories: config?.categories,
		});

		if (result.errors.length > 0) {
			process.exitCode = 1;
		}

		if (options.json) {
			console.log(
				JSON.stringify(
					toJson(targetDir, options, result, config?.path ?? null),
					null,
					2
				)
			);
		} else {
			printReport(result, options, spinner, config?.path ?? null);
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		process.exitCode = 1;

		if (options.json) {
			console.log(JSON.stringify({ error: message }, null, 2));
		} else if (spinner) {
			spinner.fail(chalk.red(message));
		} else {
			console.error(chalk.red(message));
		}
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
