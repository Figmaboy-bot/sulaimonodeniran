// Server-renders /pages/work/project/?id=… so link unfurlers see the project.
//
// Social crawlers (X, iMessage, Slack, WhatsApp, LinkedIn) read the HTML and
// never run JavaScript, so the client-side render this page has always used is
// invisible to them — a shared project link previewed as a bare URL. This
// function fetches the project from Supabase, injects Open Graph / Twitter tags
// and the project JSON into the page shell, and serves it at the same URL.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SUPABASE_URL      = 'https://axpgphfcjzhyoimxxwrz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF4cGdwaGZjanpoeW9pbXh4d3J6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1ODU0MjIsImV4cCI6MjA5MzE2MTQyMn0.sZSJA58Uqr67vNBTNin2SGi5jQlBhouVC1baofaVN-o';

const SITE        = 'https://www.sulaimonodeniran.com';
const STORAGE_CDN = 'https://portfolio-storage-cdn.sulaimonodeniran.workers.dev';
const OG_FALLBACK = SUPABASE_URL + '/storage/v1/object/public/carousel/Portfolio%20Cover.jpg';
const TEMPLATE    = 'pages/work/project/template.html';

let _template = null;

function loadTemplate(req) {
  if (_template) return Promise.resolve(_template);
  // Prefer the built copy (scripts/build.js stamps its stylesheet/script
  // references with cache-busting hashes); fall back to the source file.
  const candidates = [join(process.cwd(), 'dist', TEMPLATE), join(process.cwd(), TEMPLATE)];
  for (const file of candidates) {
    try {
      _template = readFileSync(file, 'utf8');
      return Promise.resolve(_template);
    } catch (e) { /* try the next one */ }
  }
  // includeFiles missed it — the shell is still a public static file
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return fetch('https://' + host + '/' + TEMPLATE)
    .then(function (r) { return r.text(); })
    .then(function (html) { _template = html; return html; });
}

// Same rewrite as scripts/cdn.js: put the Cloudflare cache in front of the
// bucket so crawler traffic doesn't bill against the Supabase egress quota.
function cdnUrl(url) {
  if (!STORAGE_CDN || !url) return url;
  const marker = '/storage/v1/object/public/';
  const i = url.indexOf(marker);
  return i === -1 ? url : STORAGE_CDN + url.slice(i);
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Keeps </script> and U+2028/9 inside the JSON from breaking out of the tag.
function jsonForScript(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003C')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function truncate(text, max) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  return s.slice(0, max - 1).replace(/\s+\S*$/, '') + '…';
}

function fetchProject(id) {
  const url = SUPABASE_URL + '/rest/v1/projects?select=*&id=eq.' +
    encodeURIComponent(id) + '&limit=1';
  return fetch(url, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: 'Bearer ' + SUPABASE_ANON_KEY
    }
  })
    .then(function (r) { return r.ok ? r.json() : []; })
    .then(function (rows) { return (rows && rows[0]) || null; })
    .catch(function () { return null; });
}

function coverOf(project) {
  if (project.cover_url) return project.cover_url;
  if (project.coverSrc)  return project.coverSrc;
  if (project.cardImg)   return project.cardImg;
  const first = (project.gallery || [])[0];
  if (!first) return '';
  if (first.type === 'full') return first.src || '';
  return (first.images && first.images[0] && first.images[0].src) || '';
}

function absolute(url) {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  return SITE + (url.charAt(0) === '/' ? '' : '/') + url;
}

function metaTags(project, id) {
  const title = project
    ? project.title + ' — Ola'
    : 'Work — Ola';
  const description = project
    ? truncate(project.tagline || project.about, 200)
    : 'Selected work by Ola, design engineer.';
  const image = absolute(cdnUrl(project ? coverOf(project) : '')) || OG_FALLBACK;
  const url   = SITE + '/pages/work/project/?id=' + encodeURIComponent(id || '');

  return [
    '<meta property="og:type" content="article" />',
    '<meta property="og:site_name" content="Ola — Design Engineer" />',
    '<meta property="og:url" content="' + esc(url) + '" />',
    '<meta property="og:title" content="' + esc(title) + '" />',
    '<meta property="og:description" content="' + esc(description) + '" />',
    '<meta property="og:image" content="' + esc(image) + '" />',
    '<meta property="og:image:alt" content="' + esc(project ? project.title : 'Ola') + '" />',
    '<meta name="twitter:card" content="summary_large_image" />',
    '<meta name="twitter:title" content="' + esc(title) + '" />',
    '<meta name="twitter:description" content="' + esc(description) + '" />',
    '<meta name="twitter:image" content="' + esc(image) + '" />',
    '<meta name="description" content="' + esc(description) + '" />',
    '<link rel="canonical" href="' + esc(url) + '" />'
  ].join('\n  ');
}

export default async function handler(req, res) {
  const id = (req.query && req.query.id) || '';

  let html;
  try {
    html = await loadTemplate(req);
  } catch (e) {
    return res.status(500).send('Unable to load project page.');
  }

  const project = id ? await fetchProject(id) : null;

  html = html.replace('<!--OG_META-->', metaTags(project, id));
  if (project) {
    html = html.replace(
      '<!--PROJECT_DATA-->',
      '<script>window.__PROJECT__=' + jsonForScript(project) + ';</script>'
    );
  }

  // Short shared cache so an admin edit shows up quickly; the client still
  // refreshes from Supabase on load, so visitors never see stale copy for long.
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=86400');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(project || !id ? 200 : 404).send(html);
}
