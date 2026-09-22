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

/** 解析二级分类和三级经验条目。 */
export function parseNotebook(text) {
  const sections = new Map();
  const categories = [];
  const entries = [];
  let currentSection = null;
  let currentEntryTitle = null;
  let currentEntryLines = [];
  let activeFence = null;

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

  for (const line of text.split(/\r?\n/u)) {
    const fence = parseFence(line);
    if (activeFence) {
      appendCurrentLine(line);
      if (
        fence
        && fence.character === activeFence.character
        && fence.length >= activeFence.length
        && fence.trailing.trim() === ""
      ) {
        activeFence = null;
      }
      continue;
    }
    if (fence) {
      appendCurrentLine(line);
      activeFence = fence;
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
    hasUnclosedFence: activeFence !== null,
  };
}
