const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY =
  process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';

const DEFAULT_TITLE = 'TeeRex - Create & Discover Onchain Events';
const DEFAULT_DESC =
  'Create and discover onchain events with blockchain-verified tickets, gasless transactions, and Web3-powered communities.';

interface EventOg {
  title: string;
  description: string;
  image_url: string | null;
}

const isValidId = (v: string): boolean =>
  /^0x[a-fA-F0-9]{40}$/.test(v) ||
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

const escapeHtml = (value: string): string =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

function renderPreview(o: { title: string; description: string; image: string; url: string }): string {
  const t = escapeHtml(o.title);
  const d = escapeHtml(o.description);
  const img = escapeHtml(o.image);
  const u = escapeHtml(o.url);
  // Social crawlers stop at these <head> tags (they do not run JS). A real browser wrongly
  // matched by the crawler UA rule runs this redirect and recovers into the SPA; the _ssr
  // marker makes vercel.json skip this function on the second hit, so there is no loop.
  const redirect = JSON.stringify(`${o.url}?_ssr=1`).replace(/</g, '\\u003C');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${t}</title>
<meta name="description" content="${d}" />
<meta property="og:title" content="${t}" />
<meta property="og:description" content="${d}" />
<meta property="og:image" content="${img}" />
<meta property="og:url" content="${u}" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="TeeRex" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${t}" />
<meta name="twitter:description" content="${d}" />
<meta name="twitter:image" content="${img}" />
<link rel="canonical" href="${u}" />
<link rel="icon" href="/favicon.ico" sizes="any" />
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<link rel="apple-touch-icon" href="/favicon.ico" />
<script>location.replace(${redirect})</script>
</head>
<body>
<h1>${t}</h1>
<p>${d}</p>
<a href="${u}">Open event</a>
</body>
</html>`;
}

async function handler(req: Request): Promise<Response> {
  const reqUrl = new URL(req.url);
  const rawId = (reqUrl.searchParams.get('id') || '').trim();
  const id = isValidId(rawId) ? rawId : '';

  const proto = req.headers.get('x-forwarded-proto') || 'https';
  const host = req.headers.get('host') || reqUrl.host;
  const origin = `${proto}://${host}`;

  // This body is chosen by User-Agent (only crawlers are routed here), so any shared cache
  // must key on it and never hand a cached crawler response to a browser on the same URL.
  const respond = (html: string, cache: string): Response =>
    new Response(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': cache,
        Vary: 'User-Agent',
      },
    });

  // Only crawler user-agents are routed here (see vercel.json); real browsers get the
  // static SPA. So any failure below degrades to a generic preview and can never break a
  // human page load.
  const fallback = (): Response =>
    respond(
      renderPreview({
        title: DEFAULT_TITLE,
        description: DEFAULT_DESC,
        image: `${origin}/og-default.png`,
        url: id ? `${origin}/event/${id}` : origin,
      }),
      'public, max-age=0, s-maxage=60',
    );

  if (!id || !SUPABASE_URL) return fallback();

  try {
    const res = await fetch(
      `${SUPABASE_URL}/functions/v1/get-public-event-og?id=${encodeURIComponent(id)}`,
      SUPABASE_ANON_KEY
        ? { headers: { Authorization: `Bearer ${SUPABASE_ANON_KEY}`, apikey: SUPABASE_ANON_KEY } }
        : undefined,
    );
    if (!res.ok) return fallback();
    const body = await res.json();
    if (!body?.ok || !body.event) return fallback();

    const event = body.event as EventOg;
    const image =
      event.image_url && /^https?:\/\//i.test(event.image_url)
        ? event.image_url
        : `${origin}/og-default.png`;
    return respond(
      renderPreview({
        title: `${event.title} · TeeRex`,
        description: event.description,
        image,
        url: `${origin}/event/${id}`,
      }),
      'public, max-age=0, s-maxage=300, stale-while-revalidate=600',
    );
  } catch {
    return fallback();
  }
}

export default { fetch: handler };
