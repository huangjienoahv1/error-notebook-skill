#!/usr/bin/env node
/** 解析错误经验错题本的章节、分类和条目。 */

export const specialSections = ["使用方式", "记录规范"];

/** 识别 Markdown 围栏代码块的分隔符。 */
function parseFence(line) {
  const match = /^ {0,3}(`{3,}|~{3,})(.*)$/u.exec(line);
  if (!match) {
    return null;
  }
  return {
    character: match[1][0],
    length: match[1].length,
    trailing: match[2],
  };
}

/** 逐行识别围栏区域，供章节解析与字段校验共用；原文保持不变。 */
export function* scanMarkdownLines(lines) {
  let activeFence = null;
  for (const line of lines) {
    const fence = parseFence(line);
    const isCode = activeFence !== null || fence !== null;
    if (activeFence) {
      if (
        fence
        && fence.character === activeFence.character
        && fence.length >= activeFence.length
        && fence.trailing.trim() === ""
      ) {
        activeFence = null;
      }
    } else if (fence) {
      activeFence = fence;
    }
    yield { line, isCode, hasUnclosedFence: activeFence !== null };
  }
}

/** 解析二级分类和三级经验条目。 */
export function parseNotebook(text) {
  const sections = new Map();
  const categories = [];
  const entries = [];
  let currentSection = null;
  let currentEntryTitle = null;
  let currentEntryLines = [];
  let hasUnclosedFence = false;

  const flushEntry = () => {
    if (currentSection && currentEntryTitle) {
      entries.push({
        category: currentSection,
        title: currentEntryTitle,
        lines: [...currentEntryLines],
        text: currentEntryLines.join("\n"),
      });
    }
    currentEntryTitle = null;
    currentEntryLines = [];
  };

  const appendCurrentLine = (line) => {
    if (currentEntryTitle) {
      currentEntryLines.push(line);
    } else if (currentSection) {
      sections.get(currentSection).push(line);
    }
  };

  for (const scanned of scanMarkdownLines(text.split(/\r?\n/u))) {
    const { line, isCode } = scanned;
    hasUnclosedFence = scanned.hasUnclosedFence;
    if (isCode) {
      appendCurrentLine(line);
      continue;
    }

    if (line.startsWith("## ")) {
      flushEntry();
      currentSection = line.slice(3).trim();
      if (!sections.has(currentSection)) {
        sections.set(currentSection, [line]);
      }
      if (!specialSections.includes(currentSection)) {
        categories.push(currentSection);
      }
      continue;
    }

    if (
      line.startsWith("### ")
      && !specialSections.includes(currentSection)
    ) {
      flushEntry();
      currentEntryTitle = line.slice(4).trim();
      currentEntryLines = [line];
      continue;
    }

    appendCurrentLine(line);
  }

  flushEntry();
  return {
    sections,
    categories,
    entries,
    hasUnclosedFence,
  };
}
