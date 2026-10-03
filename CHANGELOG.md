# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [2.0.0] - 2026-10-03

Several defaults changed to stop the tool from losing data, so this is a new
major version. See "Upgrading from 1.x" in the README.

### Changed

- **Name collisions no longer overwrite files.** An incoming `photo.jpg` that
  collides becomes `photo (1).jpg`, `photo (2).jpg`, and so on. Pass `--force`
  for the old overwrite behaviour. This applies to sorting and to reverting.
- **Hidden files (dotfiles) are skipped** unless `--include-hidden` is passed.
  Previously `.eslintrc.json` and similar files were moved into `code/`.
- **`--revert` is now a real undo.** Each sort records its moves in
  `.sort-files-manifest.json`, and revert restores exactly those files to where
  they came from, leaving anything else in the category folders alone. Without
  a manifest it falls back to the old behaviour and prints a warning.
- Revert no longer deletes category folders recursively. A folder is removed
  only if it ends up empty, and subdirectories inside it are never moved.
- Running on a filesystem root or your home directory is refused unless
  `--yes` is passed.
- A failed move no longer aborts the whole run. Errors are collected, listed at
  the end, and the exit code is 1.
- Categories: `md` and `markdown` moved from `code` to `documents`; `app` was
  removed (macOS `.app` bundles are directories, so it never matched); many
  extensions were added (for example `heic`, `avif`, `opus`, `yml`, `toml`,
  `rs`, `msi`, `apk`, `cbz`).
- Requires Node.js 20 or newer (was unspecified).
- The published package now contains only the runtime files (8 files, about
  13 kB) instead of also shipping tests and coverage output.
- `--help` shows the installed command name, `sort-files`.

### Added

- `--include` and `--exclude` to choose which categories are sorted.
- `--recursive` and `--depth <n>` to sort subfolders. Each file goes into a
  category folder beside it (`trip/a.jpg` becomes `trip/images/a.jpg`).
  `node_modules`, `.git` and existing category folders are never entered.
- Custom categories through `.sortfilesrc.json` (in the target directory, then
  the home directory), plus `--config <path>` and `--no-config`.
- `--verbose`, `--quiet` and `--json` output modes.
- `--include-hidden` and `--yes`.
- Files left in place for lack of a matching category are listed by extension.
- A programmatic API: `sortFiles(dir, options)` returns a result object.

### Fixed

- Dry-run output no longer interleaves with the progress spinner.
- A user file named `sort-cli.js` is no longer silently ignored.
- The CLI now starts correctly when launched through a symlink or under a
  different file name.
- Caught errors keep their original as `cause`.

### Development

- The code is split into `lib/categories.js`, `lib/sorter.js`,
  `lib/manifest.js`, `lib/config.js` and a thin `sort-cli.js`.
- Tests run against real temporary directories instead of mocked `fs`.
- Added ESLint, Prettier, a strict `tsc` check over the JSDoc types, a
  coverage script, GitHub Actions (Linux, macOS and Windows on Node 20, 22
  and 24), a publish workflow with npm provenance, and Dependabot.
- Added the missing `LICENSE` file and removed the duplicate `yarn.lock`.

## [1.1.2]

Earlier releases; see the git history.

[Unreleased]: https://github.com/nwekeKent/sort-file-cli/compare/v2.0.0...HEAD
[2.0.0]: https://github.com/nwekeKent/sort-file-cli/compare/v1.1.2...v2.0.0
[1.1.2]: https://github.com/nwekeKent/sort-file-cli/releases/tag/v1.1.2
