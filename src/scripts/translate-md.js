import fs from "fs";
import path from "path";
import fg from "fast-glob";
import dotenv from "dotenv";
import { OpenAI } from "openai";

dotenv.config();

const openai = new OpenAI({ apiKey: process.env.VITE_OPENAI_KEY });

const TRANSLATE_INDEX_FILE = "src/translate/index.js";
const CACHE_FILE = "src/scripts/openai-cache.json";
const BLOG_FILES_GLOB = ["src/blog/**/index.md"];
const TARGET_LANGUAGES_FALLBACK = ["ru"];

const FRONTMATTER_KEYS_TO_TRANSLATE = ["title", "description", "abstract"];
const FRONTMATTER_KEYS_TO_COPY = ["date", "published", "tags", "cover_image"];

async function loadTargetLanguages() {
  try {
    const filePath = path.resolve(TRANSLATE_INDEX_FILE);
    if (!fs.existsSync(filePath)) return TARGET_LANGUAGES_FALLBACK;
    const mod = await import(`file://${filePath}`);
    const langs = mod?.languages;
    if (!Array.isArray(langs)) return TARGET_LANGUAGES_FALLBACK;
    const codes = langs.map((l) => l?.code).filter(Boolean);
    // for MD translation, skip English (source language)
    const filtered = codes.filter((c) => c !== "en");
    return filtered.length ? filtered : TARGET_LANGUAGES_FALLBACK;
  } catch {
    return TARGET_LANGUAGES_FALLBACK;
  }
}

function loadCache() {
  if (fs.existsSync(CACHE_FILE)) return JSON.parse(fs.readFileSync(CACHE_FILE, "utf-8"));
  return {};
}

function saveCache(cache) {
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
}

function splitFrontmatter(md) {
  if (!md.startsWith("---")) return { frontmatterRaw: "", body: md };
  const end = md.indexOf("\n---", 3);
  if (end === -1) return { frontmatterRaw: "", body: md };
  const frontmatterRaw = md.slice(4, end + 1).trimEnd();
  const body = md.slice(end + "\n---".length + 1).replace(/^\n/, "");
  return { frontmatterRaw, body };
}

function parseFrontmatter(frontmatterRaw) {
  const fm = {};
  const lines = frontmatterRaw.split("\n");
  for (const line of lines) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const raw = line.slice(idx + 1).trim();

    if (raw === "true") fm[key] = true;
    else if (raw === "false") fm[key] = false;
    else if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) fm[key] = raw;
    else if (raw.startsWith("[") && raw.endsWith("]")) {
      try {
        fm[key] = JSON.parse(raw);
      } catch {
        fm[key] = raw;
      }
    } else if (
      (raw.startsWith('"') && raw.endsWith('"')) ||
      (raw.startsWith("'") && raw.endsWith("'"))
    ) {
      fm[key] = raw.slice(1, -1);
    } else {
      fm[key] = raw;
    }
  }
  return fm;
}

function serializeFrontmatter(fm) {
  const lines = [];
  for (const [key, val] of Object.entries(fm)) {
    if (Array.isArray(val)) lines.push(`${key}: ${JSON.stringify(val)}`);
    else if (typeof val === "boolean") lines.push(`${key}: ${val}`);
    else if (typeof val === "number") lines.push(`${key}: ${val}`);
    else if (typeof val === "string") {
      // keep paths unquoted, quote other strings
      const needsQuotes = /[\n:]/.test(val) || /\s/.test(val);
      lines.push(`${key}: ${needsQuotes ? JSON.stringify(val) : val}`);
    } else {
      lines.push(`${key}: ${JSON.stringify(val)}`);
    }
  }
  return `---\n${lines.join("\n")}\n---\n`;
}

async function translateWithOpenAI(text, targetLang, cache, kind = "md") {
  const cacheKey = `${text}|${kind}|${targetLang}`;
  if (cache[cacheKey]) return cache[cacheKey];

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 8192,
    messages: [
      {
        role: "system",
        content:
          `You are a professional translator. Translate to ${targetLang}. ` +
          `Preserve meaning and tone. If input is Markdown, preserve Markdown syntax, links, and code blocks. ` +
          `Do not translate URLs, image paths, HTML/Vue component tags, or attribute names. ` +
          `Keep component tags like <InstagramEmbed ... /> intact. ` +
          `Return only the translation.`,
      },
      { role: "user", content: text },
    ],
  });

  const translated = response.choices[0].message.content.trim();
  cache[cacheKey] = translated;
  saveCache(cache);
  return translated;
}

/** Split markdown into chunks so long posts don't hit model output limits. */
function splitMarkdownBody(body, maxChars = 3500) {
  const normalized = body.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];
  if (normalized.length <= maxChars) return [normalized];

  // Prefer splitting on H2 sections, then H3, then blank-line paragraphs.
  const headingSplit = normalized.split(/(?=^##\s)/m).filter((p) => p.trim());
  const pieces =
    headingSplit.length > 1
      ? headingSplit
      : normalized.split(/(?=^###\s)/m).filter((p) => p.trim());

  const chunks = [];
  let current = "";

  const flush = () => {
    if (current.trim()) chunks.push(current.trim());
    current = "";
  };

  for (const piece of pieces) {
    const part = piece.trim();
    if (!part) continue;

    if (part.length > maxChars) {
      flush();
      const paras = part.split(/\n{2,}/);
      let buf = "";
      for (const para of paras) {
        const next = buf ? `${buf}\n\n${para}` : para;
        if (next.length > maxChars && buf) {
          chunks.push(buf.trim());
          buf = para;
        } else {
          buf = next;
        }
      }
      if (buf.trim()) chunks.push(buf.trim());
      continue;
    }

    const next = current ? `${current}\n\n${part}` : part;
    if (next.length > maxChars && current) {
      flush();
      current = part;
    } else {
      current = next;
    }
  }

  flush();
  return chunks;
}

async function translateMarkdownBody(body, targetLang, cache) {
  const chunks = splitMarkdownBody(body);
  if (!chunks.length) return "";

  const translated = [];
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    console.log(`  ↪ body chunk ${i + 1}/${chunks.length} (${chunk.length} chars)`);
    translated.push(await translateWithOpenAI(chunk, targetLang, cache, `md:body:${i}`));
  }

  return translated.join("\n\n");
}

async function run() {
  const cache = loadCache();
  const files = await fg(BLOG_FILES_GLOB);
  const TARGET_LANGUAGES = await loadTargetLanguages();

  for (const file of files) {
    const md = fs.readFileSync(file, "utf-8");
    const { frontmatterRaw, body } = splitFrontmatter(md);
    const fm = parseFrontmatter(frontmatterRaw);

    const baseLocale = fm.locale || "en";
    if (baseLocale !== "en") continue; // translate only from English sources

    for (const lang of TARGET_LANGUAGES) {
      const outPath = path.join(path.dirname(file), `index.${lang}.md`);
      if (fs.existsSync(outPath)) {
        console.log(`⏭️ Exists, skipping: ${outPath}`);
        continue;
      }

      const outFm = {};
      // copy stable keys
      for (const k of FRONTMATTER_KEYS_TO_COPY) {
        if (fm[k] !== undefined) outFm[k] = fm[k];
      }
      outFm.locale = lang;

      // translate selected fields
      for (const k of FRONTMATTER_KEYS_TO_TRANSLATE) {
        if (!fm[k]) continue;
        outFm[k] = await translateWithOpenAI(String(fm[k]), lang, cache, `fm:${k}`);
        console.log(`✅ [${lang}] ${path.relative(process.cwd(), file)} ${k}`);
      }

      // translate body markdown (chunked for long posts)
      const bodyTranslated = body.trim()
        ? await translateMarkdownBody(body, lang, cache)
        : "";

      const out = serializeFrontmatter(outFm) + "\n" + bodyTranslated.trim() + "\n";
      fs.writeFileSync(outPath, out);
      console.log(`🎉 Wrote: ${outPath}`);
    }
  }
}

run().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
