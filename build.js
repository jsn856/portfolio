/**
 * Static site generator for jasoncheng.io
 *
 * Reads Markdown from content/, emits a static site into dist/.
 * Same shape as resume/build-docx.js: content lives in plain files,
 * this script turns it into the output format.
 *
 *   node build.js
 *
 * Markdown extras beyond standard syntax:
 *   ![alt](path "caption")                    -> <figure> with a caption
 *   @gallery a.jpg, b.jpg | shared caption    -> side-by-side figure
 *   @model <url> | caption                    -> responsive embedded iframe (Fusion 360, etc.)
 *
 * Every local image is resized into a 480/960/1440/1920 ladder in both AVIF and
 * WebP, and emitted as a <picture> with srcset. That is the one job Squarespace's
 * CDN was doing for us.
 */

import { readFile, writeFile, mkdir, rm, readdir, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import { marked } from 'marked';
import sharp from 'sharp';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(ROOT, 'src');
const CONTENT = path.join(ROOT, 'content');
// Build output. Named `docs/` because GitHub Pages can serve a site straight from
// the /docs folder of the main branch — no second branch, no deploy step, no CI.
const DIST = path.join(ROOT, 'docs');

/**
 * Where to look for image sources, in order. First match wins.
 *
 * Only `src/images` is committed, and only small stuff belongs there. Large
 * originals — 100MB, 12000x8000 — live OUTSIDE the repo and never enter git.
 * Point PHOTO_ORIGINALS at wherever your library actually is:
 *
 *   PHOTO_ORIGINALS="D:/Photos/portfolio" node build.js
 *
 * The build reads them, writes web-sized derivatives into dist/, and the
 * originals stay put. A 100MB source and a 3MP source produce the same
 * ~220KB AVIF at 1920w, so source size has no bearing on repo size.
 */
const IMAGE_SOURCES = [
  SRC,
  ...(process.env.PHOTO_ORIGINALS ? [path.resolve(process.env.PHOTO_ORIGINALS)] : []),
];

const WIDTHS = [480, 960, 1440, 1920];
const FORMATS = [
  { ext: 'avif', mime: 'image/avif', opts: { quality: 55 } },
  { ext: 'webp', mime: 'image/webp', opts: { quality: 78 } },
];

const SITE = {
  name: 'Jason Cheng',
  tagline: 'Program manager. Hardware and software.',
  email: 'jason@jasoncheng.io',
};

/* ------------------------------------------------------------------ utils */

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const slug = (s) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/* ------------------------------------------------------------- image pipe */

/** Resize one source image into the full ladder. Returns a manifest entry. */
async function processImage(relPath, manifest) {
  if (manifest.has(relPath)) return manifest.get(relPath);

  const abs = IMAGE_SOURCES.map((root) => path.join(root, relPath)).find(existsSync);
  if (!abs) {
    console.warn(`  ! missing image: ${relPath}`);
    console.warn(`    looked in: ${IMAGE_SOURCES.join(', ')}`);
    return null;
  }

  const img = sharp(abs);
  const meta = await img.metadata();
  const dir = path.dirname(relPath);
  const base = path.basename(relPath, path.extname(relPath));

  await mkdir(path.join(DIST, dir), { recursive: true });

  // Only generate widths at or below the source width, plus the source itself.
  const targets = WIDTHS.filter((w) => w <= meta.width);
  if (targets.length === 0) targets.push(meta.width);

  const sources = {};
  for (const fmt of FORMATS) {
    const parts = [];
    for (const w of targets) {
      const out = `${dir}/${base}-${w}.${fmt.ext}`.replace(/\\/g, '/');
      await sharp(abs).resize({ width: w, withoutEnlargement: true })[fmt.ext](fmt.opts)
        .toFile(path.join(DIST, out));
      parts.push(`/${out} ${w}w`);
    }
    sources[fmt.ext] = { mime: fmt.mime, srcset: parts.join(', ') };
  }

  // JPEG fallback at the largest target, for anything that supports neither.
  const fallback = `${dir}/${base}-${targets.at(-1)}.jpg`.replace(/\\/g, '/');
  await sharp(abs).resize({ width: targets.at(-1), withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true }).toFile(path.join(DIST, fallback));

  const entry = {
    sources,
    fallback: `/${fallback}`,
    width: Math.min(meta.width, targets.at(-1)),
    height: Math.round(Math.min(meta.width, targets.at(-1)) * (meta.height / meta.width)),
  };
  manifest.set(relPath, entry);
  return entry;
}

/** Render a manifest entry as a <picture>. */
function picture(entry, alt, { sizes = '(min-width: 56rem) 52rem, 92vw', loading = 'lazy' } = {}) {
  if (!entry) return `<p class="missing">[missing image]</p>`;
  const srcs = FORMATS.map(
    (f) => `<source type="${entry.sources[f.ext].mime}" srcset="${entry.sources[f.ext].srcset}" sizes="${sizes}">`
  ).join('');
  return `<picture>${srcs}<img src="${entry.fallback}" alt="${esc(alt)}" width="${entry.width}" height="${entry.height}" loading="${loading}" decoding="async"></picture>`;
}

/* ------------------------------------------------------- markdown -> html */

/** Pull every local image path out of a doc so we can process them up front. */
function collectImages(md, front) {
  const found = new Set();
  if (front.hero) found.add(front.hero);
  for (const m of md.matchAll(/!\[[^\]]*\]\(([^)\s"]+)/g)) {
    if (!/^https?:/.test(m[1])) found.add(m[1]);
  }
  for (const m of md.matchAll(/^@gallery\s+([^|\n]+)/gm)) {
    m[1].split(',').map((s) => s.trim()).filter(Boolean).forEach((p) => found.add(p));
  }
  return [...found];
}

/** Expand the @model and @gallery line directives into HTML before marked runs. */
function expandDirectives(md, manifest) {
  md = md.replace(/^@model\s+(\S+)\s*(?:\|\s*(.*))?$/gm, (_, url, caption) => {
    const cap = caption ? `<figcaption>${esc(caption.trim())}</figcaption>` : '';
    return `<figure class="figure figure--wide">
  <div class="embed">
    <iframe src="${esc(url)}" allowfullscreen loading="lazy" title="${esc(caption || 'Embedded 3D model')}"></iframe>
  </div>
  ${cap}
</figure>`;
  });

  md = md.replace(/^@gallery\s+([^|\n]+?)\s*(?:\|\s*(.*))?$/gm, (_, list, caption) => {
    const imgs = list.split(',').map((s) => s.trim()).filter(Boolean);
    const cells = imgs
      .map((p) => picture(manifest.get(p), '', { sizes: '(min-width: 56rem) 26rem, 92vw' }))
      .join('');
    const cap = caption ? `<figcaption>${esc(caption.trim())}</figcaption>` : '';
    return `<figure class="figure figure--wide">
  <div class="gallery gallery--${imgs.length}">${cells}</div>
  ${cap}
</figure>`;
  });

  return md;
}

function buildRenderer(manifest) {
  const renderer = new marked.Renderer();

  // ![alt](src "caption")  ->  <figure><picture>…</picture><figcaption>caption</figcaption></figure>
  renderer.image = ({ href, title, text }) => {
    if (/^https?:/.test(href)) {
      return `<figure class="figure"><img src="${esc(href)}" alt="${esc(text)}" loading="lazy">${
        title ? `<figcaption>${esc(title)}</figcaption>` : ''
      }</figure>`;
    }
    const entry = manifest.get(href);
    return `<figure class="figure figure--wide">${picture(entry, text)}${
      title ? `<figcaption>${esc(title)}</figcaption>` : ''
    }</figure>`;
  };

  // Headings get anchor ids so sections are linkable.
  renderer.heading = ({ tokens, depth }) => {
    const text = renderer.parser.parseInline(tokens);
    const id = slug(text.replace(/<[^>]+>/g, ''));
    return `<h${depth} id="${id}"><a class="anchor" href="#${id}">${text}</a></h${depth}>`;
  };

  // External links open in a new tab.
  renderer.link = ({ href, title, tokens }) => {
    const text = renderer.parser.parseInline(tokens);
    const ext = /^https?:/.test(href);
    return `<a href="${esc(href)}"${title ? ` title="${esc(title)}"` : ''}${
      ext ? ' target="_blank" rel="noopener"' : ''
    }>${text}</a>`;
  };

  return renderer;
}

/* ---------------------------------------------------------------- layout */

function page({ title, description, body, wide = false }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description || SITE.tagline)}">
<link rel="stylesheet" href="/styles.css">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🛠️</text></svg>">
</head>
<body${wide ? ' class="wide"' : ''}>
<a class="skip" href="#main">Skip to content</a>
<header class="site-header">
  <a class="site-name" href="/">${esc(SITE.name)}</a>
  <nav>
    <a href="/#projects">Projects</a>
    <a href="/#photography">Photography</a>
    <a href="mailto:${esc(SITE.email)}">Contact</a>
  </nav>
</header>
<main id="main">
${body}
</main>
<footer class="site-footer">
  <p>${esc(SITE.name)} · <a href="mailto:${esc(SITE.email)}">${esc(SITE.email)}</a></p>
</footer>
</body>
</html>`;
}

function projectPage(front, html, manifest) {
  const hero = front.hero ? manifest.get(front.hero) : null;
  const tags = (front.tags || []).map((t) => `<li>${esc(t)}</li>`).join('');
  const files = (front.files || [])
    .map((f) => `<a class="filelink" href="${esc(f.url)}">${esc(f.label)}</a>`)
    .join('');

  const model = front.model
    ? `<figure class="figure figure--wide">
  <div class="embed">
    <iframe src="${esc(front.model)}" allowfullscreen loading="lazy" title="Interactive 3D model"></iframe>
  </div>
  ${front.modelCaption ? `<figcaption>${esc(front.modelCaption)}</figcaption>` : ''}
</figure>`
    : '';

  return `<article class="project">
  <div class="prose">
    <p class="eyebrow">${esc(front.number || 'Project')} · ${esc(front.year || '')}</p>
    <h1>${esc(front.title)}</h1>
    ${front.subtitle ? `<p class="lede">${esc(front.subtitle)}</p>` : ''}
    ${tags ? `<ul class="tags">${tags}</ul>` : ''}
  </div>

  ${hero ? `<figure class="figure figure--hero">${picture(hero, front.title, {
      sizes: '(min-width: 72rem) 68rem, 96vw',
      loading: 'eager',
    })}${front.heroCaption ? `<figcaption>${esc(front.heroCaption)}</figcaption>` : ''}</figure>` : ''}

  <div class="prose">
    ${model}
    ${html}
    ${files ? `<div class="files"><h2 id="files">Files</h2>${files}</div>` : ''}
  </div>
</article>`;
}

function indexPage(projects, manifest) {
  const cards = projects
    .map((p) => {
      const thumb = p.front.hero ? manifest.get(p.front.hero) : null;
      return `<a class="card" href="/projects/${p.slug}/">
  ${thumb ? picture(thumb, p.front.title, { sizes: '(min-width: 56rem) 26rem, 92vw' }) : ''}
  <div class="card-body">
    <p class="eyebrow">${esc(p.front.number || '')} · ${esc(p.front.year || '')}</p>
    <h3>${esc(p.front.title)}</h3>
    <p>${esc(p.front.subtitle || '')}</p>
  </div>
</a>`;
    })
    .join('');

  return `<section class="hero prose">
  <h1>${esc(SITE.name)}</h1>
  <p class="lede">${esc(SITE.tagline)}</p>
</section>
<section id="projects" class="section">
  <div class="prose"><h2>Projects</h2></div>
  <div class="cards">${cards}</div>
</section>`;
}

/* ------------------------------------------------------------------ build */

async function build() {
  const t0 = Date.now();
  await rm(DIST, { recursive: true, force: true });
  await mkdir(DIST, { recursive: true });

  const manifest = new Map();
  const files = (await readdir(path.join(CONTENT, 'projects'))).filter((f) => f.endsWith('.md'));
  const projects = [];

  for (const file of files) {
    const raw = await readFile(path.join(CONTENT, 'projects', file), 'utf8');
    const { data: front, content } = matter(raw);

    console.log(`· ${front.title}`);
    for (const img of collectImages(content, front)) await processImage(img, manifest);

    const expanded = expandDirectives(content, manifest);
    const html = marked.parse(expanded, { renderer: buildRenderer(manifest), async: false });

    const s = front.slug || slug(front.title);
    projects.push({ slug: s, front, html });

    await mkdir(path.join(DIST, 'projects', s), { recursive: true });
    await writeFile(
      path.join(DIST, 'projects', s, 'index.html'),
      page({
        title: `${front.title} — ${SITE.name}`,
        description: front.subtitle,
        body: projectPage(front, html, manifest),
      })
    );
  }

  await writeFile(
    path.join(DIST, 'index.html'),
    page({ title: `${SITE.name} — ${SITE.tagline}`, body: indexPage(projects, manifest), wide: true })
  );
  await copyFile(path.join(SRC, 'styles.css'), path.join(DIST, 'styles.css'));
  await writeFile(path.join(DIST, 'CNAME'), 'jasoncheng.io\n');
  await writeFile(path.join(DIST, '.nojekyll'), '');

  console.log(
    `\n✓ ${projects.length} project(s), ${manifest.size} image(s) → ${path.basename(DIST)}/  [${Date.now() - t0}ms]`
  );
}

build().catch((e) => {
  console.error(e);
  process.exit(1);
});
