// Serves the writing from Substack as JSON so it can be read on this site.
//
// The articles page used to link straight out to Substack, which meant every
// reader who got interested left. Substack publishes the full text of each
// post in its RSS feed, so this fetches that feed, strips the Substack chrome
// out of the markup, and hands back something the site can render in its own
// typography. Readers stay here; the canonical post is still linked at the end.
//
//   GET /api/articles           -> [{ slug, title, date, excerpt, cover, url }]
//   GET /api/articles?slug=...  -> the same, plus `content` (cleaned HTML)
//
// The feed can't be fetched from the browser (Substack sends no CORS headers),
// which is the other reason this lives in a function.

const FEED = 'https://sulaimonodeniran.substack.com/feed';
const SUBSCRIBE = 'https://sulaimonodeniran.substack.com/subscribe';

// Substack changes rarely, and a stale post for a few minutes costs nothing.
const CACHE = 'public, s-maxage=900, stale-while-revalidate=86400';

function decodeEntities(s) {
  return String(s || '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');   // last, so "&amp;lt;" doesn't become "<"
}

// <tag><![CDATA[ … ]]></tag>, or a plain <tag> … </tag>
function field(xml, tag) {
  const re = new RegExp('<' + tag + '(?:\\s[^>]*)?>([\\s\\S]*?)</' + tag + '>');
  const m = re.exec(xml);
  if (!m) return '';
  const raw = m[1].trim();
  const cdata = /^<!\[CDATA\[([\s\S]*)\]\]>$/.exec(raw);
  return cdata ? cdata[1] : decodeEntities(raw);
}

function attr(xml, tag, name) {
  const re = new RegExp('<' + tag + '\\b[^>]*\\b' + name + '="([^"]*)"');
  const m = re.exec(xml);
  return m ? decodeEntities(m[1]) : '';
}

// What a reader actually needs. Everything else in Substack's markup is UI:
// image-expand buttons, subscribe widgets, tracking wrappers.
const ALLOWED = {
  p: [], h2: [], h3: [], h4: [], ul: [], ol: [], li: [], blockquote: [],
  strong: [], b: [], em: [], i: [], br: [], hr: [], code: [], pre: [],
  figure: [], figcaption: [],
  a: ['href'],
  img: ['src', 'alt']
};

function clean(html) {
  let s = String(html || '');

  // 1. Whole blocks that are pure Substack UI. The subscribe widget is
  //    *substituted* rather than dropped: the prose around it says "click the
  //    button below", so deleting it outright would leave that pointing at
  //    nothing. A plain link keeps the author's intent intact.
  s = s.replace(/<(script|style|svg|button|form)\b[\s\S]*?<\/\1>/gi, '');
  const SUB_LINK = '<p><a href="' + SUBSCRIBE + '">Subscribe to the newsletter</a></p>';
  s = s.replace(/<div[^>]*class="[^"]*subscription-widget[^"]*"[\s\S]*?<\/div>/gi, SUB_LINK);
  s = s.replace(/<(?:p|div)[^>]*class="[^"]*button-wrapper[^"]*"[\s\S]*?<\/(?:p|div)>/gi, SUB_LINK);
  s = s.replace(/<a[^>]*class="[^"]*\bbutton\b[^"]*"[\s\S]*?<\/a>/gi, SUB_LINK);
  s = s.replace(/<div[^>]*class="[^"]*(?:paywall|poll)[^"]*"[\s\S]*?<\/div>/gi, '');

  // 2. <picture><source…><img…></picture> -> just the <img>.
  s = s.replace(/<picture\b[\s\S]*?(<img\b[^>]*>)[\s\S]*?<\/picture>/gi, '$1');
  s = s.replace(/<source\b[^>]*>/gi, '');

  // 2b. Substack wraps every image in a link to the raw CDN file, alongside an
  //     expand control. On this site that link just throws the reader out to a
  //     bare JPEG, so keep the image and discard the anchor around it. Matching
  //     on the container class rather than "anchor holding only an img",
  //     because the expand <div> sits in there too.
  s = s.replace(/<a\b[^>]*class="[^"]*image-link[^"]*"[^>]*>([\s\S]*?)<\/a>/gi,
    function (m, inner) {
      const img = /<img\b[^>]*>/i.exec(inner);
      return img ? img[0] : inner;
    });
  s = s.replace(/<a\b[^>]*>\s*(<img\b[^>]*>)\s*<\/a>/gi, '$1');

  // 3. Strip every attribute that isn't on the allowlist, and drop tags that
  //    aren't either — keeping their contents, so no prose is lost.
  s = s.replace(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g, function (m, slash, tag, rest) {
    const name = tag.toLowerCase();
    if (!Object.prototype.hasOwnProperty.call(ALLOWED, name)) return '';
    if (slash) return '</' + name + '>';

    const keep = ALLOWED[name];
    let out = '';
    for (const a of keep) {
      const v = new RegExp('\\b' + a + '="([^"]*)"').exec(rest);
      if (!v) continue;
      const val = v[1];
      // No javascript:/data: URLs, whatever the source.
      if ((a === 'href' || a === 'src') && /^\s*(javascript|data|vbscript):/i.test(decodeEntities(val))) continue;
      out += ' ' + a + '="' + val + '"';
    }
    if (name === 'img') out += ' loading="lazy" decoding="async"';
    if (name === 'a') out += ' target="_blank" rel="noopener noreferrer"';
    return '<' + name + out + (name === 'br' || name === 'hr' || name === 'img' ? ' />' : '>');
  });

  // 4. Tidy: empty paragraphs and runs of separators left behind by the above.
  s = s.replace(/<p>\s*(?:&nbsp;|\s)*<\/p>/gi, '');
  s = s.replace(/(?:\s*<hr \/>\s*){2,}/gi, '<hr />');
  s = s.replace(/\n{3,}/g, '\n\n');
  return s.trim();
}

function slugOf(link) {
  const m = /\/p\/([^/?#]+)/.exec(link || '');
  return m ? m[1] : '';
}

function parse(xml) {
  const items = xml.split('<item>').slice(1).map(chunk => chunk.split('</item>')[0]);
  return items.map(function (it) {
    const link = field(it, 'link');
    const pub = field(it, 'pubDate');
    const d = pub ? new Date(pub) : null;
    return {
      slug: slugOf(link),
      title: field(it, 'title'),
      url: link,
      date: d && !isNaN(d) ? d.toISOString() : '',
      dateLabel: d && !isNaN(d)
        ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
        : '',
      excerpt: field(it, 'description').replace(/<[^>]+>/g, '').trim(),
      cover: attr(it, 'enclosure', 'url'),
      content: clean(field(it, 'content:encoded'))
    };
  }).filter(p => p.slug && p.title);
}

export default async function handler(req, res) {
  let posts;
  try {
    const r = await fetch(FEED, {
      headers: { 'User-Agent': 'sulaimonodeniran.com/1.0 (+https://www.sulaimonodeniran.com)' },
      signal: AbortSignal.timeout(8000)
    });
    if (!r.ok) throw new Error('feed responded ' + r.status);
    posts = parse(await r.text());
  } catch (e) {
    res.setHeader('Cache-Control', 'public, s-maxage=60');
    return res.status(502).json({ error: 'Could not reach the feed', detail: String(e.message || e) });
  }

  const slug = (req.query && req.query.slug) || '';
  res.setHeader('Cache-Control', CACHE);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (slug) {
    const post = posts.find(p => p.slug === slug);
    if (!post) return res.status(404).json({ error: 'No such post' });
    return res.status(200).json(post);
  }

  // The list view doesn't need every post's full body.
  return res.status(200).json(posts.map(function (p) {
    const { content, ...rest } = p;
    return rest;
  }));
}
