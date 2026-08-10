/**
 * Static site generator for jasoncheng.io
 *
 *   node build.js
 *
 * Content lives in plain Markdown; this script turns it into a static site,
 * the same shape as resume/build-docx.js.
 *
 * THREE-LEVEL STRUCTURE
 *   /                        home — portrait, statement, one tile per collection
 *   /<collection>/           index — every item in that collection, listed
 *   /<collection>/<slug>/    the full case study
 *
 * Collections are just folders under content/. Each carries an `_index.md`
 * holding its title, blurb, and the photo used for its tile on the homepage.
 *
 * Markdown extras beyond standard syntax:
 *   ![alt](path "caption")                    -> <figure> with a caption
 *   @gallery a.jpg, b.jpg | shared caption    -> side-by-side figure
 *   @model <url> | caption                    -> responsive embedded iframe
 *
 * Every local image is resized into a 480/960/1440/1920 ladder in AVIF and
 * WebP with a JPEG fallback, emitted as <picture> with srcset. That is the one
 * job Squarespace's CDN was doing for us.
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
 * Only `src/` is committed, and only small stuff belongs there. Large originals
 * — 100MB, 12000x8000 — live OUTSIDE the repo and never enter git. Point
 * PHOTO_ORIGINALS at wherever your library actually is:
 *
 *   PHOTO_ORIGINALS="D:/Photos/portfolio" node build.js
 *
 * A 100MB source and a 3MP source produce the same ~220KB AVIF at 1920w, so
 * source size has no bearing on repo size.
 */
const IMAGE_SOURCES = [
  SRC,
  ...(process.env.PHOTO_ORIGINALS ? [path.resolve(process.env.PHOTO_ORIGINALS)] : []),
];

/** Collection order on the homepage and in the nav. */
const COLLECTION_ORDER = ['work', 'projects', 'photography'];

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

/**
 * While true, every page carries <meta name="robots" content="noindex, nofollow">, so
 * search engines skip the site. The repo is public and the domain resolves, so without
 * this a draft full of placeholders gets indexed under Jason's name.
 *
 * FLIP THIS TO false when the site is ready to be found. That is the whole switch.
 *
 * Deliberately not using robots.txt Disallow: that blocks crawling, which stops Google
 * from ever reading a noindex tag. Meta noindex alone is the reliable way to stay out.
 */
const NOINDEX = true;

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
    console.warn(`  ! missing image: ${relPath}  (placeholder rendered)`);
    manifest.set(relPath, null);
    return null;
  }

  const meta = await sharp(abs).metadata();
  const dir = path.dirname(relPath);
  const base = path.basename(relPath, path.extname(relPath));

  await mkdir(path.join(DIST, dir), { recursive: true });

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

  const fallback = `${dir}/${base}-${targets.at(-1)}.jpg`.replace(/\\/g, '/');
  await sharp(abs).resize({ width: targets.at(-1), withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true }).toFile(path.join(DIST, fallback));

  const w = Math.min(meta.width, targets.at(-1));
  const entry = {
    sources,
    fallback: `/${fallback}`,
    width: w,
    height: Math.round(w * (meta.height / meta.width)),
  };
  manifest.set(relPath, entry);
  return entry;
}

/** Render a manifest entry as a <picture>, or a labelled placeholder if absent. */
function picture(entry, alt, { sizes = '(min-width: 56rem) 52rem, 92vw', loading = 'lazy', ratio = '', src = '' } = {}) {
  if (!entry) {
    // Placeholders double as a shot list, so label them with whatever we know: the alt
    // text if there is any, otherwise a readable form of the intended filename.
    const named = src ? path.basename(src, path.extname(src)).replace(/[-_]/g, ' ') : '';
    return `<div class="ph${ratio ? ` ph--${ratio}` : ''}"><span>${esc(alt || named || 'image')}</span></div>`;
  }
  const srcs = FORMATS.map(
    (f) => `<source type="${entry.sources[f.ext].mime}" srcset="${entry.sources[f.ext].srcset}" sizes="${sizes}">`
  ).join('');
  return `<picture>${srcs}<img src="${entry.fallback}" alt="${esc(alt)}" width="${entry.width}" height="${entry.height}" loading="${loading}" decoding="async"></picture>`;
}

/* ------------------------------------------------------- markdown -> html */

function collectImages(md, front) {
  const found = new Set();
  for (const key of ['hero', 'tile', 'portrait', 'thumb']) {
    if (front[key]) found.add(front[key]);
  }
  for (const m of md.matchAll(/!\[[^\]]*\]\(([^)\s"]+)/g)) {
    if (!/^https?:/.test(m[1])) found.add(m[1]);
  }
  for (const m of md.matchAll(/^@gallery\s+([^|\n]+)/gm)) {
    m[1].split(',').map((s) => s.trim()).filter(Boolean).forEach((p) => found.add(p));
  }
  return [...found];
}

function expandDirectives(md, manifest) {
  md = md.replace(/^@model\s+(\S+)\s*(?:\|\s*(.*))?$/gm, (_, url, caption) => `<figure class="figure figure--wide">
  <div class="embed">
    <iframe src="${esc(url)}" allowfullscreen loading="lazy" title="${esc(caption || 'Embedded 3D model')}"></iframe>
  </div>
  ${caption ? `<figcaption>${esc(caption.trim())}</figcaption>` : ''}
</figure>`);

  md = md.replace(/^@gallery\s+([^|\n]+?)\s*(?:\|\s*(.*))?$/gm, (_, list, caption) => {
    const imgs = list.split(',').map((s) => s.trim()).filter(Boolean);
    const cells = imgs
      .map((p) => picture(manifest.get(p), '', { sizes: '(min-width: 56rem) 26rem, 92vw', src: p }))
      .join('');
    return `<figure class="figure figure--wide">
  <div class="gallery gallery--${imgs.length}">${cells}</div>
  ${caption ? `<figcaption>${esc(caption.trim())}</figcaption>` : ''}
</figure>`;
  });

  return md;
}

function buildRenderer(manifest) {
  const renderer = new marked.Renderer();

  renderer.image = ({ href, title, text }) => {
    if (/^https?:/.test(href)) {
      return `<figure class="figure"><img src="${esc(href)}" alt="${esc(text)}" loading="lazy">${
        title ? `<figcaption>${esc(title)}</figcaption>` : ''
      }</figure>`;
    }
    return `<figure class="figure figure--wide">${picture(manifest.get(href), text)}${
      title ? `<figcaption>${esc(title)}</figcaption>` : ''
    }</figure>`;
  };

  renderer.heading = ({ tokens, depth }) => {
    const text = renderer.parser.parseInline(tokens);
    // Strip tags AND entities — marked has already turned ' into &#39;, which would
    // otherwise leave anchors like "what-i-39-d-tell-you".
    const id = slug(text.replace(/<[^>]+>/g, '').replace(/&#?\w+;/g, ''));
    return `<h${depth} id="${id}"><a class="anchor" href="#${id}">${text}</a></h${depth}>`;
  };

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

function page({ title, description, body, nav, current = '' }) {
  const links = nav
    .map(
      (c) =>
        `<a href="/${c.slug}/"${current === c.slug ? ' aria-current="page"' : ''}>${esc(c.front.title)}</a>`
    )
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description || SITE.tagline)}">
${NOINDEX ? '<meta name="robots" content="noindex, nofollow">\n' : ''}<link rel="stylesheet" href="/styles.css">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🛠️</text></svg>">
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="site-header">
  <a class="site-name" href="/">${esc(SITE.name)}</a>
  <nav>${links}<a href="mailto:${esc(SITE.email)}">Contact</a></nav>
</header>
<main id="main">
${body}
</main>
<footer class="site-footer">
  <p><a href="mailto:${esc(SITE.email)}">${esc(SITE.email)}</a></p>
  <p>${esc(SITE.name)} · Irvine, California</p>
</footer>
</body>
</html>`;
}

/** Home: portrait beside a large statement, then one tile per collection. */
function homePage(home, collections, manifest) {
  const tiles = collections
    .map((c) => {
      const img = c.front.tile ? manifest.get(c.front.tile) : null;
      return `<a class="tile" href="/${c.slug}/">
  <div class="tile-img">${picture(img, c.front.title, {
    sizes: '(min-width: 62rem) 23rem, (min-width: 42rem) 45vw, 92vw',
    ratio: '4x3',
  })}</div>
  <h3>${esc(c.front.title)}</h3>
  <p>${esc(c.front.blurb || '')}</p>
</a>`;
    })
    .join('');

  const portrait = home.portrait ? manifest.get(home.portrait) : null;

  return `<section class="intro">
  <div class="intro-portrait">${picture(portrait, home.portraitAlt || SITE.name, {
    sizes: '(min-width: 56rem) 26rem, 70vw',
    loading: 'eager',
    ratio: '2x3',
  })}</div>
  <div class="intro-text">
    ${home.greeting ? `<p class="greeting">${esc(home.greeting)}</p>` : ''}
    <h1 class="statement">${esc(home.statement || SITE.tagline)}</h1>
    ${home.note ? `<p class="intro-note">${esc(home.note)}</p>` : ''}
  </div>
</section>

<section class="tiles-section">
  <h2 class="section-label">${esc(home.tilesLabel || 'Recent work')}</h2>
  <div class="tiles">${tiles}</div>
</section>`;
}

/** Collection index: heading, blurb, then every item as a list row. */
function collectionPage(coll, items, manifest) {
  const rows = items
    .map((it) => {
      const img = it.front.hero ? manifest.get(it.front.hero) : null;
      const tags = (it.front.tags || []).slice(0, 3).map((t) => `<li>${esc(t)}</li>`).join('');
      return `<a class="row" href="/${coll.slug}/${it.slug}/">
  <div class="row-thumb">${picture(img, it.front.title, {
    sizes: '(min-width: 48rem) 14rem, 30vw',
    ratio: '4x3',
  })}</div>
  <div class="row-body">
    <h3>${esc(it.front.title)}</h3>
    <p>${esc(it.front.subtitle || '')}</p>
    ${tags ? `<ul class="tags">${tags}</ul>` : ''}
  </div>
  <div class="row-meta">
    <span>${esc(it.front.org || '')}</span>
    <span>${esc(it.front.year || '')}</span>
  </div>
</a>`;
    })
    .join('');

  return `<section class="collection">
  <header class="collection-head">
    <h1>${esc(coll.front.title)}</h1>
    ${coll.front.blurb ? `<p class="lede">${esc(coll.front.blurb)}</p>` : ''}
  </header>
  ${items.length ? `<div class="rows">${rows}</div>` : '<p class="prose empty">Nothing here yet.</p>'}
</section>`;
}

/** Detail page for one item. */
function itemPage(coll, front, html, manifest) {
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

  const outline = front.status === 'outline'
    ? `<p class="notice">This case study is still an outline — the facts below are verified, the writing isn't finished.</p>`
    : '';

  const meta = [front.org, front.year].filter(Boolean).map(esc).join(' · ');

  return `<article class="item">
  <div class="prose">
    <a class="back" href="/${coll.slug}/">${esc(coll.front.title)}</a>
    <h1>${esc(front.title)}</h1>
    ${front.subtitle ? `<p class="lede">${esc(front.subtitle)}</p>` : ''}
    ${meta ? `<p class="eyebrow">${meta}</p>` : ''}
    ${tags ? `<ul class="tags">${tags}</ul>` : ''}
  </div>

  ${front.hero ? `<figure class="figure figure--hero">${picture(hero, front.title, {
      sizes: '(min-width: 72rem) 68rem, 96vw',
      loading: 'eager',
      src: front.hero,
    })}${front.heroCaption ? `<figcaption>${esc(front.heroCaption)}</figcaption>` : ''}</figure>` : ''}

  <div class="prose">
    ${outline}
    ${model}
    ${html}
    ${files ? `<div class="files"><h2 id="files">Files</h2>${files}</div>` : ''}
  </div>
</article>`;
}

/* ------------------------------------------------------------------ build */

async function readDoc(file) {
  const { data, content } = matter(await readFile(file, 'utf8'));
  return { front: data, body: content };
}

async function build() {
  const t0 = Date.now();
  await rm(DIST, { recursive: true, force: true });
  await mkdir(DIST, { recursive: true });

  const manifest = new Map();

  // ---- discover collections -------------------------------------------
  const dirs = (await readdir(CONTENT, { withFileTypes: true }))
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort((a, b) => {
      const ia = COLLECTION_ORDER.indexOf(a);
      const ib = COLLECTION_ORDER.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });

  const collections = [];
  for (const name of dirs) {
    const idxPath = path.join(CONTENT, name, '_index.md');
    const doc = existsSync(idxPath)
      ? await readDoc(idxPath)
      : { front: { title: name[0].toUpperCase() + name.slice(1) }, body: '' };
    collections.push({ slug: name, front: doc.front, items: [] });
  }

  const nav = collections;

  // ---- load items ------------------------------------------------------
  for (const coll of collections) {
    const files = (await readdir(path.join(CONTENT, coll.slug)))
      .filter((f) => f.endsWith('.md') && f !== '_index.md')
      .sort();

    for (const file of files) {
      const doc = await readDoc(path.join(CONTENT, coll.slug, file));
      coll.items.push({ slug: doc.front.slug || slug(doc.front.title), ...doc });
    }

    // Explicit `order` first, then by year descending.
    coll.items.sort((a, b) => {
      const oa = a.front.order ?? 999;
      const ob = b.front.order ?? 999;
      if (oa !== ob) return oa - ob;
      return String(b.front.year || '').localeCompare(String(a.front.year || ''));
    });
  }

  // ---- home ------------------------------------------------------------
  const homeDoc = existsSync(path.join(CONTENT, 'home.md'))
    ? await readDoc(path.join(CONTENT, 'home.md'))
    : { front: {}, body: '' };

  // ---- process every image up front -----------------------------------
  for (const key of ['portrait']) {
    if (homeDoc.front[key]) await processImage(homeDoc.front[key], manifest);
  }
  for (const coll of collections) {
    if (coll.front.tile) await processImage(coll.front.tile, manifest);
    for (const it of coll.items) {
      for (const img of collectImages(it.body, it.front)) await processImage(img, manifest);
    }
  }

  // ---- render ----------------------------------------------------------
  let itemCount = 0;
  for (const coll of collections) {
    for (const it of coll.items) {
      const html = marked.parse(expandDirectives(it.body, manifest), {
        renderer: buildRenderer(manifest),
        async: false,
      });
      await mkdir(path.join(DIST, coll.slug, it.slug), { recursive: true });
      await writeFile(
        path.join(DIST, coll.slug, it.slug, 'index.html'),
        page({
          title: `${it.front.title} — ${SITE.name}`,
          description: it.front.subtitle,
          body: itemPage(coll, it.front, html, manifest),
          nav,
          current: coll.slug,
        })
      );
      itemCount++;
    }

    await mkdir(path.join(DIST, coll.slug), { recursive: true });
    await writeFile(
      path.join(DIST, coll.slug, 'index.html'),
      page({
        title: `${coll.front.title} — ${SITE.name}`,
        description: coll.front.blurb,
        body: collectionPage(coll, coll.items, manifest),
        nav,
        current: coll.slug,
      })
    );
    console.log(`· ${coll.front.title.padEnd(14)} ${coll.items.length} item(s)`);
  }

  await writeFile(
    path.join(DIST, 'index.html'),
    page({
      title: `${SITE.name} — ${SITE.tagline}`,
      body: homePage(homeDoc.front, collections, manifest),
      nav,
    })
  );

  await copyFile(path.join(SRC, 'styles.css'), path.join(DIST, 'styles.css'));
  await writeFile(path.join(DIST, 'CNAME'), 'jasoncheng.io\n');
  await writeFile(path.join(DIST, '.nojekyll'), '');

  const missing = [...manifest.values()].filter((v) => v === null).length;
  console.log(
    `\n✓ ${collections.length} collection(s), ${itemCount} item(s), ` +
    `${manifest.size - missing} image(s)${missing ? `, ${missing} placeholder(s)` : ''} ` +
    `→ ${path.basename(DIST)}/  [${Date.now() - t0}ms]`
  );
}

build().catch((e) => {
  console.error(e);
  process.exit(1);
});
