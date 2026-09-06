#!/usr/bin/env node
/** 跨平台安装错误经验错题本 Skill，并初始化仓库外的私有数据文件。 */

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";


const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultSourceSkill = path.resolve(scriptDirectory, "..");
const defaultCodexHome = path.join(os.homedir(), ".codex");

/** 输出命令行使用说明。 */
function printHelp() {
  console.log(`用法：node scripts/install-skill.mjs [选项]

选项：
  --source-skill <路径>      Skill 源目录，默认使用当前脚本的上级目录
  --install-path <路径>      安装位置，默认 ~/.codex/skills/error-notebook
  --backup-root <路径>       旧目录备份位置，默认 ~/.codex/skill-backups
  --private-notebook <路径>  私有错题本位置，默认 ~/.codex/error-notebook-data/error-notebook.md
  --help                     显示帮助`);
}

/** 解析安装器参数，并保留稳定的跨平台默认路径。 */
function parseArguments(argv) {
  const options = {
    sourceSkill: defaultSourceSkill,
    installPath: path.join(defaultCodexHome, "skills", "error-notebook"),
    backupRoot: path.join(defaultCodexHome, "skill-backups"),
    privateNotebook: path.join(
      defaultCodexHome,
      "error-notebook-data",
      "error-notebook.md",
    ),
  };
  const optionNames = new Map([
    ["--source-skill", "sourceSkill"],
    ["--install-path", "installPath"],
    ["--backup-root", "backupRoot"],
    ["--private-notebook", "privateNotebook"],
  ]);

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help") {
      options.help = true;
      continue;
    }
    const optionName = optionNames.get(argument);
    if (!optionName) {
      throw new Error(`未知参数：${argument}`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`${argument} 缺少路径参数。`);
    }
    options[optionName] = value;
    index += 1;
  }
  return options;
}

/** 返回去除多余尾部分隔符的绝对路径。 */
function normalizePath(pathname) {
  const resolved = path.resolve(pathname);
  const root = path.parse(resolved).root;
  return resolved === root
    ? resolved
    : resolved.replace(/[\\/]+$/u, "");
}

/** 按当前文件系统的大小写规则比较路径。 */
function pathsEqual(left, right) {
  const normalizedLeft = normalizePath(left);
  const normalizedRight = normalizePath(right);
  return process.platform === "win32"
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight;
}

/** 判断子路径是否位于父路径内部，不把父路径自身视作内部。 */
function isInside(childPath, parentPath) {
  const relative = path.relative(
    normalizePath(parentPath),
    normalizePath(childPath),
  );
  return relative !== ""
    && relative !== ".."
    && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative);
}

/** 判断路径本身是否存在，包括已经失效的符号链接。 */
function pathEntryExists(pathname) {
  try {
    fs.lstatSync(pathname);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

/** 计算文件 SHA-256，用于验证初始化和链接后的入口文件。 */
function sha256(pathname) {
  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(pathname))
    .digest("hex");
}

/** 初始化私有错题本；目标已存在时绝不覆盖。 */
function initializePrivateNotebook(sourceSkill, notebookPath) {
  const target = normalizePath(notebookPath);
  if (pathEntryExists(target)) {
    if (!fs.statSync(target).isFile()) {
      throw new Error(`私有错题本路径不是文件：${target}`);
    }
    console.log(`私有错题本已存在，未覆盖：${target}`);
    return;
  }

  const template = path.join(
    sourceSkill,
    "references",
    "error-notebook.md",
  );
  if (!fs.existsSync(template) || !fs.statSync(template).isFile()) {
    throw new Error(`Skill 缺少公开错题本模板：${template}`);
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(template, target, fs.constants.COPYFILE_EXCL);
  if (sha256(template) !== sha256(target)) {
    throw new Error("私有错题本初始化后哈希不一致。");
  }
  console.log(`私有错题本初始化成功：${target}`);
}

/** 判断现有目录链接是否已经指向当前 Skill。 */
function linkPointsToSource(installPath, sourceRealPath) {
  if (!pathEntryExists(installPath)) {
    return false;
  }
  const item = fs.lstatSync(installPath);
  if (!item.isSymbolicLink()) {
    return false;
  }
  try {
    return pathsEqual(fs.realpathSync(installPath), sourceRealPath);
  } catch {
    return false;
  }
}

/** 生成不覆盖已有数据的时间戳备份路径。 */
function createBackupPath(backupRoot, installPath) {
  const now = new Date();
  const stamp = [
    now.getFullYear().toString().padStart(4, "0"),
    (now.getMonth() + 1).toString().padStart(2, "0"),
    now.getDate().toString().padStart(2, "0"),
    "-",
    now.getHours().toString().padStart(2, "0"),
    now.getMinutes().toString().padStart(2, "0"),
    now.getSeconds().toString().padStart(2, "0"),
    "-",
    now.getMilliseconds().toString().padStart(3, "0"),
  ].join("");
  return path.join(
    backupRoot,
    `${path.basename(installPath)}-backup-${stamp}`,
  );
}

/** 创建平台对应的目录链接，并验证链接目标和入口文件。 */
function createAndVerifyLink(installPath, sourceSkill, sourceRealPath) {
  const linkType = process.platform === "win32" ? "junction" : "dir";
  fs.symlinkSync(sourceSkill, installPath, linkType);
  if (!fs.lstatSync(installPath).isSymbolicLink()) {
    throw new Error(`Skill 目录链接创建失败：${installPath}`);
  }
  if (!pathsEqual(fs.realpathSync(installPath), sourceRealPath)) {
    throw new Error(`Skill 目录链接目标验证失败：${installPath}`);
  }

  const sourceEntrypoint = path.join(sourceSkill, "SKILL.md");
  const installedEntrypoint = path.join(installPath, "SKILL.md");
  if (sha256(sourceEntrypoint) !== sha256(installedEntrypoint)) {
    throw new Error("Skill 目录链接创建后 SKILL.md 哈希不一致。");
  }
}

/** 执行备份、链接安装和失败回滚。 */
function install(options) {
  const sourceSkill = normalizePath(options.sourceSkill);
  const installPath = normalizePath(options.installPath);
  const backupRoot = normalizePath(options.backupRoot);
  const sourceEntrypoint = path.join(sourceSkill, "SKILL.md");
  if (!fs.existsSync(sourceSkill) || !fs.statSync(sourceSkill).isDirectory()) {
    throw new Error(`Skill 源路径不是目录：${sourceSkill}`);
  }
  if (!fs.existsSync(sourceEntrypoint) || !fs.statSync(sourceEntrypoint).isFile()) {
    throw new Error(`Skill 源目录缺少 SKILL.md：${sourceSkill}`);
  }

  const sourceRealPath = fs.realpathSync(sourceSkill);
  initializePrivateNotebook(sourceSkill, options.privateNotebook);
  if (pathsEqual(installPath, sourceSkill)
      || pathsEqual(installPath, sourceRealPath)) {
    console.log(`全局 Skill 已直接使用仓库目录：${sourceSkill}`);
    return;
  }
  if (isInside(installPath, sourceSkill) || isInside(sourceSkill, installPath)) {
    throw new Error("Skill 源目录与安装目录不能互相包含。");
  }
  if (isInside(backupRoot, installPath)) {
    throw new Error("备份目录不能位于安装目录内部。");
  }
  if (linkPointsToSource(installPath, sourceRealPath)) {
    console.log(`Skill 目录链接已正确指向仓库：${installPath} -> ${sourceSkill}`);
    return;
  }

  fs.mkdirSync(path.dirname(installPath), { recursive: true });
  let backupPath;
  if (pathEntryExists(installPath)) {
    fs.mkdirSync(backupRoot, { recursive: true });
    backupPath = createBackupPath(backupRoot, installPath);
    if (pathEntryExists(backupPath)) {
      throw new Error(`备份路径已存在，停止迁移：${backupPath}`);
    }
    fs.renameSync(installPath, backupPath);
  }

  let linkCreated = false;
  try {
    createAndVerifyLink(installPath, sourceSkill, sourceRealPath);
    linkCreated = true;
  } catch (error) {
    if (pathEntryExists(installPath)) {
      const item = fs.lstatSync(installPath);
      if (item.isSymbolicLink()) {
        fs.unlinkSync(installPath);
      }
    }
    if (backupPath
        && pathEntryExists(backupPath)
        && !pathEntryExists(installPath)) {
      fs.renameSync(backupPath, installPath);
    }
    throw error;
  }

  if (!linkCreated) {
    throw new Error("Skill 目录链接没有成功创建。");
  }
  const linkName = process.platform === "win32" ? "Junction" : "符号链接";
  console.log(`${linkName} 创建成功：${installPath} -> ${sourceSkill}`);
  if (backupPath) {
    console.log(`迁移前目录已保留：${backupPath}`);
  }
}

/** 安装器命令行入口。 */
function main() {
  try {
    const options = parseArguments(process.argv.slice(2));
    if (options.help) {
      printHelp();
      return 0;
    }
    install(options);
    return 0;
  } catch (error) {
    console.error(`错误：${error.message}`);
    return 1;
  }
}


process.exitCode = main();
