// Contribution calendar for the about page.
//
// Two sources, in order of preference:
//
// 1. The GraphQL API, when a GITHUB_TOKEN is set. Authenticated as the account
//    itself this includes PRIVATE contributions — the number the owner sees on
//    their own profile. Without it the graph badly understates the real work.
// 2. GitHub's public /users/<login>/contributions fragment, which needs no
//    token but only ever counts public activity.
//
// Either way the browser can't call GitHub directly (no CORS header), so we
// fetch here and hand the page plain JSON. Cached at the edge for an hour.

const LOGIN  = 'Figmaboy-bot';
const SOURCE = 'https://github.com/users/' + LOGIN + '/contributions';
const UA     = 'sulaimonodeniran.com';

const LEVELS = {
  NONE: 0, FIRST_QUARTILE: 1, SECOND_QUARTILE: 2,
  THIRD_QUARTILE: 3, FOURTH_QUARTILE: 4
};

const QUERY = `query($login: String!) {
  user(login: $login) {
    contributionsCollection {
      contributionCalendar {
        totalContributions
        weeks { contributionDays { date contributionCount contributionLevel } }
      }
    }
  }
}`;

async function fromGraphQL(token) {
  const r = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json',
      'User-Agent': UA
    },
    body: JSON.stringify({ query: QUERY, variables: { login: LOGIN } })
  });
  if (!r.ok) throw new Error('GraphQL responded ' + r.status);

  const body = await r.json();
  if (body.errors && body.errors.length) throw new Error(body.errors[0].message);

  const cal = body.data
    && body.data.user
    && body.data.user.contributionsCollection
    && body.data.user.contributionsCollection.contributionCalendar;
  if (!cal) throw new Error('no calendar in GraphQL response');

  const days = [];
  cal.weeks.forEach(function (w) {
    w.contributionDays.forEach(function (d) {
      days.push({
        date:  d.date,
        count: d.contributionCount,
        level: LEVELS[d.contributionLevel] || 0
      });
    });
  });

  return { login: LOGIN, total: cal.totalContributions, days: days, source: 'graphql' };
}

// ── Public fragment fallback ────────────────────
const CELL_RE    = /<td[^>]*\bdata-date="(\d{4}-\d{2}-\d{2})"[^>]*>/g;
const ID_RE      = /\bid="([^"]+)"/;
const LEVEL_RE   = /\bdata-level="(\d+)"/;
const TOOLTIP_RE = /<tool-tip[^>]*\bfor="([^"]+)"[^>]*>([^<]*)<\/tool-tip>/g;

// "No contributions on August 24th." / "3 contributions on September 1st."
function countFromTooltip(text) {
  const m = /^(\d+)\s+contribution/.exec(text.trim());
  return m ? parseInt(m[1], 10) : 0;
}

function parse(html) {
  const counts = {};
  let m;
  TOOLTIP_RE.lastIndex = 0;
  while ((m = TOOLTIP_RE.exec(html)) !== null) counts[m[1]] = countFromTooltip(m[2]);

  const days = [];
  CELL_RE.lastIndex = 0;
  while ((m = CELL_RE.exec(html)) !== null) {
    const tag   = m[0];
    const id    = ID_RE.exec(tag);
    const level = LEVEL_RE.exec(tag);
    days.push({
      date:  m[1],
      level: level ? parseInt(level[1], 10) : 0,
      count: id && counts[id[1]] != null ? counts[id[1]] : 0
    });
  }

  // The fragment lays cells out row-major (all Sundays, then all Mondays, …);
  // sorting by date gives the chronological order the grid is built from.
  days.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });

  const total = days.reduce(function (sum, d) { return sum + d.count; }, 0);
  return { login: LOGIN, total: total, days: days, source: 'public' };
}

async function fromPublic() {
  const r = await fetch(SOURCE, { headers: { 'User-Agent': UA, 'Accept': 'text/html' } });
  if (!r.ok) throw new Error('GitHub responded ' + r.status);
  const data = parse(await r.text());
  if (!data.days.length) throw new Error('no contribution cells found');
  return data;
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  const token = process.env.GITHUB_TOKEN;
  let data = null;

  if (token) {
    try {
      data = await fromGraphQL(token);
    } catch (e) {
      // A bad or expired token shouldn't blank the graph — fall through to the
      // public numbers, which are at least correct as far as they go.
      console.error('github-contributions: GraphQL failed, falling back —', e.message);
    }
  }

  try {
    if (!data) data = await fromPublic();
  } catch (e) {
    // The about page hides the block on a failure rather than showing an
    // empty grid, so a short cache here keeps a blip from sticking around.
    res.setHeader('Cache-Control', 'public, s-maxage=60');
    return res.status(502).json({ error: String(e.message || e) });
  }

  // max-age=0 keeps the browser from serving its own stale copy — without it
  // the count visibly freezes for a day. s-maxage lets Vercel's edge absorb
  // the traffic instead, so GitHub sees at most a handful of calls an hour.
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=600');
  return res.status(200).json(data);
}
