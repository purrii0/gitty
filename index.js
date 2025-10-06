import args from "args";
import chalk from "chalk";
import { join, resolve } from "path";
import os from "os";
import { readdir, readFile, writeFile } from "fs/promises";
import { existsSync } from "fs";
import simpleGit from "simple-git";
import { differenceInDays } from "date-fns";

args
  .option("add", "add a new folder to scan for Git repositories")
  .option("email", "the email to scan");

const outOfRange = 99999;
const daysInLastSixMonths = 183;
const weeksInLastSixMonths = 26;

(async () => {
  try {
    const flags = args.parse(process.argv);
    if (flags.add) {
      await scan(flags.add);
    } else if (flags.email) {
      await stats(flags.email);
    } else {
      usage();
    }
  } catch (error) {
    console.log(chalk.redBright(`${error.message}\n`));
    process.exit(1);
  }
})();

function usage() {
  console.log(`${chalk.whiteBright("node index.js <cmd>")}
  ${chalk.greenBright("--add")}\t add a new folder to scan for Git repositories
  ${chalk.greenBright("--email")}\t the email to scan
  `);
}

async function getDotFilePath() {
  const dotFilePath = join(os.homedir(), ".gitlocalstats");
  if (!existsSync(dotFilePath)) {
    await writeFile(dotFilePath, "", { encoding: "utf-8", mode: 0o755 });
    console.log(chalk.green(`File created at: ${dotFilePath}`));
  }
  return dotFilePath;
}

async function parseFileLinesToSlice(filePath) {
  try {
    const content = await readFile(filePath, "utf-8");
    return content.split("\n").filter((line) => line.trim() !== "");
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

function joinSlices(newArray, existingArray) {
  for (const item of newArray) {
    if (!existingArray.includes(item)) existingArray.push(item);
  }
  return existingArray;
}

async function dumpStringsSliceToFile(repos, filePath) {
  const content = repos.join("\n");
  await writeFile(filePath, content + "\n", { encoding: "utf-8", mode: 0o755 });
}

async function addNewSliceElementsToFile(filePath, newRepos) {
  const existingRepos = await parseFileLinesToSlice(filePath);
  const repos = joinSlices(newRepos, existingRepos);
  await dumpStringsSliceToFile(repos, filePath);
}

async function recursiveScanFolder(folder) {
  return await scanGitFolders([], folder);
}

async function scan(folder) {
  console.log(chalk.greenBright("Found folders:\n"));
  const repositories = await recursiveScanFolder(folder);
  const filePath = await getDotFilePath();
  await addNewSliceElementsToFile(filePath, repositories);
  console.log(chalk.greenBright("\nSuccessfully added!\n"));
}

async function scanGitFolders(folders, folder) {
  folder = folder.endsWith("/") ? folder.slice(0, -1) : folder;

  let files;
  try {
    files = await readdir(folder, { withFileTypes: true });
  } catch (error) {
    throw new Error(`Failed to read folder "${folder}": ${error.message}`);
  }

  for (const file of files) {
    if (!file.isDirectory()) continue;

    const fullPath = join(folder, file.name);

    if (file.name === ".git") {
      const fullRepoPath = resolve(folder);
      console.log(chalk.greenBright(fullRepoPath));
      folders.push(fullRepoPath);
      continue;
    }

    if (["vendor", "node_modules"].includes(file.name)) continue;

    folders = await scanGitFolders(folders, fullPath);
  }

  return folders;
}

async function stats(email) {
  const commits = await processRepositories(email);
  printCommitsStats(commits);
}

async function processRepositories(email) {
  const filePath = await getDotFilePath();
  const repos = await parseFileLinesToSlice(filePath);
  const daysInMap = daysInLastSixMonths;

  const commits = {};
  for (let i = daysInMap; i > 0; i--) {
    commits[i] = 0;
  }

  for (const path of repos) {
    await fillCommits(email, path, commits);
  }

  return commits;
}

async function fillCommits(email, path, commits) {
  try {
    const git = simpleGit(path);
    const log = await git.log();
    const offset = calcOffset();

    for (const commit of log.all) {
      const authorEmail = commit.author_email;
      const authorDate = new Date(commit.date);

      if (authorEmail !== email) continue;

      const daysAgo = countDaysSinceDate(authorDate) + offset;

      if (daysAgo !== outOfRange && commits[daysAgo] !== undefined) {
        commits[daysAgo]++;
      }
    }

    return commits;
  } catch (error) {
    console.error(
      chalk.redBright(`Error processing repo at ${path}:`, error.message)
    );
    throw err;
  }
}

function getBeginningOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function countDaysSinceDate(date) {
  let days = 0;
  let now = getBeginningOfDay(new Date());
  let current = getBeginningOfDay(new Date(date));

  while (current < now) {
    current.setDate(current.getDate() + 1);
    days++;
    if (days > daysInLastSixMonths) {
      return outOfRange;
    }
  }

  return days;
}

function calcOffset() {
  const weekday = new Date().getDay();
  return weekday === 0 ? 7 : 7 - weekday;
}

function printCommitsStats(commits) {
  const keys = sortMapIntoSlice(commits);
  const cols = buildCols(keys, commits);
  printCells(cols);
}

function sortMapIntoSlice(mapObj) {
  return Object.keys(mapObj)
    .map(Number)
    .sort((a, b) => a - b);
}

function buildCols(keys, commits) {
  const cols = {};
  let col = [];

  for (const k of keys) {
    const week = Math.floor(k / 7);
    const daysInWeek = k % 7;

    if (daysInWeek === 0) {
      col = [];
    }

    col.push(commits[k]);

    if (daysInWeek === 6) {
      cols[week] = col;
    }
  }
  return cols;
}

function printCells(cols) {
  printMonths();

  for (let j = 6; j >= 0; j--) {
    let line = "";
    for (let i = weeksInLastSixMonths + 1; i >= 0; i--) {
      if (i === weeksInLastSixMonths + 1) {
        line += printDayCol(j);
      }

      const col = cols[i];
      const offset = calcOffset();

      if (col) {
        if (i === 0 && j === offset - 1) {
          line += printCell(col[j], true);
          continue;
        } else if (col.length > j) {
          line += printCell(col[j], false);
          continue;
        }
      }

      line += printCell(0, false);
    }
    console.log(line);
  }
}

function printMonths() {
  let week = getBeginningOfDay(
    new Date(Date.now() - daysInLastSixMonths * 24 * 60 * 60 * 1000)
  );
  let month = week.getMonth();
  let output = "         ";

  while (true) {
    if (week.getMonth() !== month) {
      const monthName = week.toLocaleString("en", { month: "short" });
      output += chalk.white(`${monthName} `);
      month = week.getMonth();
    } else {
      output += "    ";
    }

    week = new Date(week.getTime() + 7 * 24 * 60 * 60 * 1000);
    if (week > new Date()) break;
  }

  console.log(output);
}

function printDayCol(day) {
  switch (day) {
    case 1:
      return chalk.gray(" Mon ");
    case 3:
      return chalk.gray(" Wed ");
    case 5:
      return chalk.gray(" Fri ");
    default:
      return "     ";
  }
}

function printCell(val, today = false) {
  let style;

  if (today) {
    style = chalk.bgMagenta.white.bold;
  } else if (val === 0) {
    style = chalk.bgBlack.green;
  } else if (val > 0 && val < 5) {
    style = chalk.bgGrey.black;
  } else if (val >= 5 && val < 10) {
    style = chalk.bgYellow.black;
  } else if (val >= 10) {
    style = chalk.bgGreen.black;
  } else {
    style = chalk.reset;
  }

  let str;
  if (val === 0) str = "  - ";
  else if (val >= 100) str = `${val} `;
  else if (val >= 10) str = ` ${val} `;
  else str = `  ${val} `;

  return style(str);
}
