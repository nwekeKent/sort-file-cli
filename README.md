# 📂 Sort Files CLI

[![npm version](https://img.shields.io/npm/v/sort-files-cli.svg?style=flat-square)](https://www.npmjs.com/package/sort-files-cli)
[![npm total downloads](https://img.shields.io/npm/dt/sort-files-cli.svg?style=flat-square&label=downloads)](https://www.npmjs.com/package/sort-files-cli)
[![npm monthly downloads](https://img.shields.io/npm/dm/sort-files-cli.svg?style=flat-square&label=downloads%2Fmonth)](https://www.npmjs.com/package/sort-files-cli)
[![CI](https://img.shields.io/github/actions/workflow/status/nwekeKent/sort-file-cli/ci.yml?branch=main&style=flat-square&label=CI)](https://github.com/nwekeKent/sort-file-cli/actions/workflows/ci.yml)
[![node](https://img.shields.io/node/v/sort-files-cli.svg?style=flat-square)](https://nodejs.org)
[![install size](https://packagephobia.com/badge?p=sort-files-cli)](https://packagephobia.com/result?p=sort-files-cli)
[![GitHub stars](https://img.shields.io/github/stars/nwekeKent/sort-file-cli.svg?style=flat-square)](https://github.com/nwekeKent/sort-file-cli/stargazers)
[![license](https://img.shields.io/npm/l/sort-files-cli.svg?style=flat-square)](LICENSE)

A command-line tool that tidies a messy folder by moving files into category
folders (`images/`, `documents/`, `code/`, ...) based on their extension. It
never overwrites your files, can preview every move first, and can undo what it
did.

**Contents:** [Features](#-features) · [What's new in 2.0](#-whats-new-in-20) · [Installation](#-installation) · [Usage](#-usage) · [Safety and undo](#-how-it-keeps-your-files-safe) · [Recursive](#-recursive-sorting) · [Custom categories](#-custom-categories) · [Scripting](#-scripting) · [Categories](#-built-in-categories) · [API](#-programmatic-use) · [Contributing](#-contributing)

## ✨ Features

- **Safe by default**: collisions are renamed rather than overwritten, hidden
  files are left alone, and a root or home directory is refused.
- **Preview and undo**: `--dry-run` shows the plan, and `--revert` restores
  exactly the files a previous sort moved.
- **Flexible**: pick categories, sort subfolders, or define your own
  categories in a small config file.
- **Script friendly**: `--json` output, `--quiet`, and meaningful exit codes.

## 🔀 Before and after

```text
Downloads/                   Downloads/
├── vacation.jpg             ├── images/vacation.jpg
├── report.pdf        →      ├── documents/report.pdf, notes.txt
├── notes.txt                ├── code/script.py
├── script.py                ├── archives/archive.zip
├── archive.zip              └── Makefile      (no category: left in place)
└── Makefile
```

## 🆕 What's new in 2.0

Version 2.0 is a safety and capability overhaul:

- **Nothing is overwritten any more.** Collisions are renamed, hidden files are
  skipped, and a root or home directory is refused.
- **A real undo.** Each sort records a manifest, so `--revert` restores exactly
  what was moved.
- **More control.** `--include`/`--exclude`, `--recursive`/`--depth`,
  `--include-hidden`, and custom categories via `.sortfilesrc.json`.
- **Better output.** `--verbose`, `--quiet`, `--json`, and a list of files
  left in place for lack of a category.
- **More accurate categories**, with many more extensions.
- **Rebuilt internals.** Tested on Linux, macOS and Windows with Node 20, 22
  and 24, and published with only the files it needs.

### Upgrading from 1.x

| In 1.x                                                   | In 2.0                                                                                  |
| :------------------------------------------------------- | :-------------------------------------------------------------------------------------- |
| An existing file with the same name was overwritten      | The incoming file is renamed (`photo (1).jpg`). Use `--force` for the old behaviour     |
| Hidden files such as `.eslintrc.json` were sorted        | They are skipped. Use `--include-hidden` to sort them                                   |
| `--revert` moved back everything in the category folders | It restores only what the manifest recorded (falls back to the old way, with a warning) |
| `md` files went to `code/`                               | They go to `documents/` (change it with a custom category)                              |
| Any directory could be sorted, including `~` and `/`     | Those are refused unless you pass `--yes`                                               |
| One failed move aborted the run                          | The rest are still sorted, failures are listed, and the exit code is 1                  |
| Any Node version                                         | Node.js 20 or newer                                                                     |

Folders sorted by 1.x have no manifest, so the first `--revert` on them uses
the fallback and prints a warning. Sorts made with 2.0 are fully undoable.

## 🛠 Installation

Requires Node.js 20 or newer.

```bash
npm install -g sort-files-cli
```

Or run it without installing:

```bash
npx sort-files-cli ~/Downloads
```

## 🚀 Usage

```bash
# Sort the current directory
sort-files

# Sort a specific folder
sort-files ~/Downloads

# Preview first (recommended)
sort-files ~/Downloads --dry-run

# Changed your mind? Undo it
sort-files ~/Downloads --revert
```

Running with no folder sorts the current directory, and sorting your home
directory (or `/`) is refused unless you add `--yes`.

### Options

| Flag                     | Description                                                                     |
| :----------------------- | :------------------------------------------------------------------------------ |
| `-d, --dry-run`          | Show what would happen without changing anything                                |
| `-r, --revert`           | Undo the last sort(s), using the recorded manifest when available               |
| `-f, --force`            | Overwrite existing files instead of renaming the incoming one                   |
| `--include <categories>` | Only sort these categories, comma-separated (for example `images,documents`)    |
| `--exclude <categories>` | Never sort these categories (for example `code`)                                |
| `-R, --recursive`        | Also sort files in subfolders, into category folders beside them                |
| `--depth <levels>`       | Limit how many subfolder levels `--recursive` goes into (implies `--recursive`) |
| `--include-hidden`       | Also sort hidden files (dotfiles)                                               |
| `--config <path>`        | Read custom categories from this file instead of `.sortfilesrc.json`            |
| `--no-config`            | Ignore any `.sortfilesrc.json`                                                  |
| `-y, --yes`              | Allow running on a filesystem root or your home directory                       |
| `-v, --verbose`          | List every file moved                                                           |
| `-q, --quiet`            | Print only warnings and errors                                                  |
| `--json`                 | Print the result as JSON for scripts                                            |
| `-h, --help`             | Show help                                                                       |
| `-V, --version`          | Show the version                                                                |

`--include` and `--exclude` cannot be combined with `--revert`; `--recursive`
and `--depth` cannot be either. `--verbose`, `--quiet` and `--json` are
mutually exclusive.

## 🛡 How it keeps your files safe

- **No silent overwrites.** If `images/photo.jpg` already exists, the incoming
  file becomes `images/photo (1).jpg`. Use `--force` if you really want to
  replace it (a forced overwrite cannot be undone).
- **Hidden files stay put** unless you pass `--include-hidden`.
- **Only files move.** Folders are never moved, and files with no matching
  category stay where they are. They are listed at the end of the run so you
  know what was left.
- **Failures don't stop the run.** If one file can't be moved, the rest are
  still sorted, the problems are listed, and the exit code is 1.

### Undoing a sort

Every real sort adds its moves to `.sort-files-manifest.json` in the sorted
folder. `--revert` replays that file in reverse:

- Only files the tool moved are restored, to the exact place they came from.
  Anything else in the category folders (including files that were already
  there) is left alone.
- If a new file has since taken an original name, the restored file is renamed
  (`name (1).ext`) instead of overwriting it.
- Files that were deleted or moved in the meantime are skipped with a warning.
- Category folders that end up empty are removed, and the manifest is deleted
  once everything is undone.

If there is no manifest (for example, the folder was sorted by an older
version), `--revert` falls back to moving back **everything** in the top-level
category folders and prints a warning, since it can't tell which files were
there before.

## 🗂 Recursive sorting

```bash
sort-files ~/Photos --recursive          # every level
sort-files ~/Photos --depth 1            # one level of subfolders
```

Files are sorted into category folders **beside** them, so folders stay
self-contained:

```text
trip/a.jpg          →   trip/images/a.jpg
trip/day1/b.pdf     →   trip/day1/documents/b.pdf
```

`node_modules`, `.git`, existing category folders and (unless
`--include-hidden`) hidden folders are never entered. Recursive sorts are
recorded in the manifest, so `--revert` undoes them too.

## 🔧 Custom categories

Create `.sortfilesrc.json` in the folder you are sorting (or in your home
directory to apply everywhere):

```json
{
	"categories": {
		"invoices": ["inv", "invoice"],
		"notes": ["md", "markdown"]
	}
}
```

- A custom category with the name of a built-in one **replaces** it, and any
  extension a custom category claims is taken away from the built-in ones (so
  `md` above moves out of `documents`). An empty list, such as
  `"fonts": []`, switches a category off.
- Category names must be safe folder names (letters, numbers, spaces, `-`, `_`).
  Extensions are single, without dots (`"tar.gz"` is not allowed; the last
  extension is what is matched).
- The first config found wins, in this order: `--config <path>`, the target
  folder, then your home directory. Files are never merged, and `--no-config`
  ignores them all.
- The file is announced as `Using config: ...` when it applies, and it is
  never sorted itself.
- Mistakes, such as an unknown key or an invalid name, fail the run before any
  file is touched, naming the file.

## 🤖 Scripting

`--json` prints a single JSON object to stdout and nothing else:

```json
{
	"directory": "/home/me/Downloads",
	"mode": "sort",
	"dryRun": true,
	"config": null,
	"moved": 3,
	"skipped": 1,
	"errors": [],
	"actions": [
		{
			"from": "notes.txt",
			"to": "documents/notes.txt"
		},
		{
			"from": "report.pdf",
			"to": "documents/report.pdf"
		},
		{
			"from": "vacation.jpg",
			"to": "images/vacation.jpg"
		}
	],
	"warnings": [],
	"unknown": {
		"": 1
	}
}
```

`unknown` counts the files left in place for lack of a category, keyed by
extension (an empty string means no extension). A fatal error prints
`{ "error": "..." }` instead.

**Exit codes:** `0` on success; `1` if anything failed, including bad
arguments, an invalid config, a refused directory, or any individual file that
could not be moved.

## 📁 Built-in categories

| Category           | Extensions                                                                                                                                                                                                                                      |
| :----------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 📸 **images**      | `jpg`, `jpeg`, `png`, `gif`, `bmp`, `svg`, `webp`, `ico`, `tiff`, `raw`, `heic`, `heif`, `avif`, `jfif`, `psd`, `ai`, `eps`                                                                                                                     |
| 🎥 **videos**      | `mp4`, `mov`, `avi`, `mkv`, `wmv`, `flv`, `webm`, `m4v`, `mpeg`, `3gp`, `ogv`                                                                                                                                                                   |
| 📄 **documents**   | `pdf`, `doc`, `docx`, `txt`, `rtf`, `odt`, `xls`, `xlsx`, `ppt`, `pptx`, `csv`, `tsv`, `odp`, `ods`, `pages`, `numbers`, `key`, `md`, `markdown`, `log`                                                                                         |
| 📦 **archives**    | `zip`, `rar`, `7z`, `tar`, `gz`, `bz2`, `xz`, `iso`, `tgz`, `zst`, `cab`                                                                                                                                                                        |
| 🎵 **music**       | `mp3`, `wav`, `flac`, `m4a`, `aac`, `ogg`, `wma`, `aiff`, `alac`, `mid`, `midi`, `opus`, `amr`                                                                                                                                                  |
| 💻 **code**        | `js`, `mjs`, `cjs`, `py`, `html`, `css`, `ts`, `json`, `go`, `jsx`, `tsx`, `c`, `cpp`, `java`, `h`, `hpp`, `cs`, `rs`, `rb`, `php`, `swift`, `kt`, `lua`, `sql`, `yml`, `yaml`, `toml`, `xml`, `scss`, `sass`, `less`, `vue`, `svelte`, `ipynb` |
| ⚙️ **executables** | `exe`, `dmg`, `pkg`, `sh`, `bin`, `msi`, `apk`, `deb`, `rpm`, `appimage`, `bat`                                                                                                                                                                 |
| 📚 **ebooks**      | `epub`, `mobi`, `azw`, `azw3`, `fb2`, `cbz`, `cbr`                                                                                                                                                                                              |
| 🔡 **fonts**       | `ttf`, `otf`, `woff`, `woff2`, `eot`                                                                                                                                                                                                            |

Extensions are matched case-insensitively, using the last extension in the name
(`backup.tar.gz` is an archive, `types.d.ts` is code).

## 🧩 Programmatic use

```js
import { sortFiles } from "sort-files-cli";

const result = await sortFiles("/path/to/folder", { dryRun: true });
console.log(result.actions); // [{ from: "a.jpg", to: "images/a.jpg" }, ...]
```

`sortFiles(dir, options)` accepts the same options as the CLI in camelCase
(`dryRun`, `revert`, `force`, `include`, `exclude`, `includeHidden`, `depth`,
`yes`, and `categories` for custom ones). It throws for fatal problems and
reports per-file failures in `result.errors`.

## 🤝 Contributing

Bug reports and pull requests are welcome.

```bash
git clone https://github.com/nwekeKent/sort-file-cli
cd sort-file-cli
npm ci
npm run check     # lint, format check, type check and tests
```

Other scripts: `npm test`, `npm run test:coverage`, `npm run format`.
Please add or update tests with your change, and note it in
[CHANGELOG.md](CHANGELOG.md).

## 📄 License

Released under the [MIT License](LICENSE).

**Author:** [Tochukwu Nweke](https://github.com/nwekeKent)
