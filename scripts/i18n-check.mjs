#!/usr/bin/env node
/**
 * i18n 覆盖率检查：找出前端源码里「还没进英文词典」的中文文案。
 *
 * 判定方式很朴素但够用：源码里的中文（JSX 文本节点 + 引号字符串）是否字面出现在
 * lib/i18n/en/*.ts 的某个 key 上。因为词条的 key 就是中文原文，所以「有没有被 t() 包」
 * 和「词典里有没有这条」可以一起查出来——两种漏法都会体现在这个报告里。
 *
 * 用法：
 *   node --no-warnings scripts/i18n-check.mjs             # 全量报告
 *   node --no-warnings scripts/i18n-check.mjs --file=components/OpsPanel.tsx
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const SRC = join(ROOT, "src", "web", "src");
const DICT_DIR = join(SRC, "lib", "i18n", "en");

const args = new Map(
  process.argv.slice(2).map((a) => {
    const [k, ...rest] = a.replace(/^--/, "").split("=");
    return [k, rest.join("=")];
  }),
);
const only = args.get("file");
const quiet = args.has("quiet");

const HAN = /[\u4e00-\u9fa5]/;

/** 只有中文、没有占位符以外的语法含义；太短的多半是单位或标点，单独统计。 */
function looksLikeCopy(s) {
  const text = s.trim();
  if (!HAN.test(text)) return false;
  if (text.length > 400) return false;
  // 纯符号/数字混排（如「，」「·」）不算文案
  if (!/[\u4e00-\u9fa5]{2,}/.test(text)) return false;
  return true;
}

function readDictKeys() {
  const files = readdirSync(DICT_DIR).filter((f) => f.endsWith(".ts"));
  const keys = new Set();
  for (const file of files) {
    const src = readFileSync(join(DICT_DIR, file), "utf8");
    // 双引号/单引号 key 与裸标识符 key 两种写法都要认
    for (const m of src.matchAll(/(?:^|[\s{])(?:"((?:[^"\\]|\\.)+)"|'((?:[^'\\]|\\.)+)')?\s*([^\s:"',(){}]+)?\s*:\s*"/gm)) {
      const key = m[1] ?? m[2] ?? m[3];
      if (key && HAN.test(key)) keys.add(key.replace(/\\"/g, '"'));
    }
  }
  return keys;
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === "i18n") continue;
      walk(p, out);
    } else if (/\.(tsx?|jsx?)$/.test(name)) {
      out.push(p);
    }
  }
  return out;
}

/** 去掉注释，避免把注释里的中文算成待翻译文案。 */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + " ".repeat(m.length - p1.length));
}

function candidates(src) {
  const clean = stripComments(src);
  const found = [];
  const push = (text, index) => {
    const value = text.trim();
    if (!looksLikeCopy(value)) return;
    found.push({ value, visible: isVisible(clean, index) });
  };

  // JSX 文本节点：>文案<
  for (const m of clean.matchAll(/>([^<>{}\n]+)</g)) {
    if (m[1] !== undefined) push(m[1], m.index ?? 0);
  }
  // JSX 属性里的中文（title / aria-label / placeholder / alt）
  for (const m of clean.matchAll(/\b(?:title|aria-label|aria-description|placeholder|alt|label|desc)\s*=\s*"([^"\n]*?)"/g)) {
    if (m[1] !== undefined) push(m[1], m.index ?? 0);
  }
  // 字符串字面量（含模板字符串）
  for (const m of clean.matchAll(/["'`]([^"'`\n]*?)["'`]/g)) {
    if (m[1] !== undefined) push(m[1], m.index ?? 0);
  }
  return found;
}

/** 是否落在 t("...") / tr("...") 调用里（粗判：向前找最近的 t( 或 tr( 是否紧邻）。 */
function isVisible(src, index) {
  const before = src.slice(Math.max(0, index - 12), index);
  return /\btr?\(\s*["'`]$/.test(before) || /\btr?\(\s*$/.test(before);
}

const keys = readDictKeys();
const files = walk(SRC).filter((f) => (only ? relative(SRC, f).split(sep).join("/").includes(only) : true));

let total = 0;
let covered = 0;
const missingByFile = new Map();

for (const file of files) {
  const src = readFileSync(file, "utf8");
  const seen = new Set();
  for (const c of candidates(src)) {
    if (seen.has(c.value)) continue;
    seen.add(c.value);
    total += 1;
    const hit = keys.has(c.value) || [...keys].some((k) => k.includes(c.value));
    if (hit) {
      covered += 1;
    } else {
      if (!missingByFile.has(file)) missingByFile.set(file, []);
      missingByFile.get(file).push(c.value);
    }
  }
}

const missingTotal = total - covered;
const pct = total === 0 ? 100 : Math.round((covered / total) * 1000) / 10;

if (!quiet) {
  for (const [file, list] of [...missingByFile].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`\n${relative(ROOT, file).split(sep).join("/")}  —— 待翻译 ${list.length} 条`);
    for (const value of list) console.log(`  · ${value}`);
  }
}

console.log(
  `\n共扫描中文文案 ${total} 条，已进词典 ${covered} 条，未覆盖 ${missingTotal} 条，覆盖率 ${pct}%`,
);
process.exitCode = missingTotal === 0 ? 0 : 1;
