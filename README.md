# 📂 Sort Files CLI

[![npm version](https://img.shields.io/npm/v/sort-files-cli.svg?style=flat-square)](https://www.npmjs.com/package/sort-files-cli)
[![license](https://img.shields.io/npm/l/sort-files-cli.svg?style=flat-square)](https://github.com/nwekeKent/sort-file-cli/blob/main/LICENSE)
[![install size](https://img.shields.io/bundlephobia/min/sort-files-cli?style=flat-square)](https://bundlephobia.com/package/sort-files-cli)

A sleek, powerful command-line tool that automatically organizes your messy directories into beautiful, categorized folders based on file types.

---

## ✨ Features

- **🚀 Instant Organization**: Sort hundreds of files in milliseconds.
- **📂 Smart Categorization**: Automatically groups files into Images, Videos, Code, Documents, and more.
- **� Safety First**: Includes a `--dry-run` mode to preview changes and a `--revert` flag to undo everything.
- **⚡ Modern UI**: Beautiful terminal output with progress spinners and color-coded feedback.
- **� Developer Ready**: Supports common programming extensions like JS, PY, GO, TS, and more.

---

## � Before & After

**Before:**

```text
Downloads/
├── vacation.jpg
├── report.pdf
├── script.py
├── archive.zip
└── notes.txt
```

**After:**

```text
Downloads/
├── 📸 images/vacation.jpg
├── 📄 documents/report.pdf, notes.txt
├── 💻 code/script.py
└── 📦 archives/archive.zip
```

---

## 🛠 Installation

Install the tool globally using npm:

```bash
npm install -g sort-files-cli
```

---

## 🚀 Usage

### Basic Commands

```bash
# Sort the current directory
sort-files

# Sort a specific folder
sort-files ~/Downloads

# Preview changes without moving any files (Highly Recommended!)
sort-files --dry-run

# Oops! Revert everything back to how it was
sort-files --revert
```

### 🎛 Options

| Flag            | Description                                  |
| :-------------- | :------------------------------------------- |
| `-d, --dry-run` | Preview changes without moving files         |
| `-r, --revert`  | Revert files back to their original location |
| `-h, --help`    | Display help information                     |
| `-V, --version` | Display version number                       |

---

## 📁 Supported Categories

| Category        | Icon | Extensions                              |
| :-------------- | :--- | :-------------------------------------- |
| **Images**      | 📸   | jpg, png, gif, svg, webp, ico, raw ...  |
| **Videos**      | 🎥   | mp4, mov, avi, mkv, webm ...            |
| **Documents**   | 📄   | pdf, docx, txt, xlsx, pptx, csv ...     |
| **Code**        | 💻   | js, py, html, css, ts, go, json, md ... |
| **Archives**    | 📦   | zip, rar, 7z, tar, gz, iso ...          |
| **Music**       | 🎵   | mp3, wav, flac, m4a, aac ...            |
| **E-books**     | 📚   | epub, mobi, azw3, fb2                   |
| **Executables** | ⚙️   | exe, dmg, pkg, app, sh, bin             |
| **Fonts**       | 🔡   | ttf, otf, woff, woff2                   |

---

## 🛡 How It Works

1. **Scanning**: The tool identifies all files in your target directory.
2. **Analysis**: It checks the file extension against a database of categories.
3. **Execution**: It safely moves files into categorized subfolders (creating them if they don't exist).
4. **Cleanup**: Empty category folders are removed when you use the `--revert` command.

---

## 🤝 Contributing

Found a bug or have a feature request?

1. Fork the [GitHub Repository](https://github.com/nwekeKent/sort-file-cli).
2. Create your feature branch (`git checkout -b feature/AmazingFeature`).
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`).
4. Push to the branch (`git push origin feature/AmazingFeature`).
5. Open a Pull Request.

---

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.

---

**Author:** [Tochukwu Nweke](https://github.com/nwekeKent)  
**Project Link:** [https://github.com/nwekeKent/sort-file-cli](https://github.com/nwekeKent/sort-file-cli)
