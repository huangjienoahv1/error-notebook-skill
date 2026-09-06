#!/usr/bin/env node
/** 解析错误经验错题本的章节、分类和条目。 */

export const specialSections = ["使用方式", "记录规范"];

/** 解析二级分类和三级经验条目。 */
export function parseNotebook(text) {
  const sections = new Map();
  const categories = [];
  const entries = [];
  let currentSection = null;
  let currentEntryTitle = null;
  let currentEntryLines = [];

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

  for (const line of text.split(/\r?\n/u)) {
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

    if (currentEntryTitle) {
      currentEntryLines.push(line);
    } else if (currentSection) {
      sections.get(currentSection).push(line);
    }
  }

  flushEntry();
  return { sections, categories, entries };
}
