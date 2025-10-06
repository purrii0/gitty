# Git Local Stats CLI

A Node.js CLI tool to visualize your Git commit activity over the last 6 months, similar to GitHub’s contribution graph.

## Features

- Scan local folders recursively for Git repositories.
- Track commits for a specific email address.
- Compatible with Linux/macOS terminals.

## Installation

```bash
git clone https://github.com/purrii0/gitty.git
cd gitty
npm install
```

> Make sure you have Node.js (v18+) installed.

## Usage

### 1. Add a folder to scan for Git repositories

```bash
node index.js --add "/path/to/folder"
```

- Scans recursively for Git repositories.
- Stores the list in `~/.gitlocalstats`.

### 2. Show commit stats for an email

```bash
node index.js --email "your.email@example.com"
```

- Reads all repositories from `~/.gitlocalstats`.
- Generates a 6-month commit heatmap in the terminal.

## Example

```
         Jan     Feb     Mar
 Mon  -   -   3   1   -   0
 Wed  -   2   4   0   5   0
 Fri  -   -   0   0   10  2
```

## Configuration

- `~/.gitlocalstats` → stores the paths of scanned Git repositories.

## Dependencies

- [chalk](https://www.npmjs.com/package/chalk) → colored terminal output
- [simple-git](https://www.npmjs.com/package/simple-git) → Git repository access
- [date-fns](https://www.npmjs.com/package/date-fns) → date calculations

## Notes

- Only counts commits authored by the specified email.
- Ignores directories like `node_modules` and `vendor`.
