import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { IdlixScraperEngine, ResolvedPlaybackResult } from '../engine/IdlixScraperEngine.js';
import { globalCache } from '../services/CacheService.js';
import { extractSubtitleFromZip } from '../utils/zipExtract.js';

export const apiRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const engine = IdlixScraperEngine.getInstance();

  // Health and Status
  fastify.get('/health', async () => {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      session: engine.getSessionStatus(),
    };
  });

  // Movies list
  fastify.get<{
    Querystring: { page?: string; limit?: string; sort?: string; genre?: string; country?: string };
  }>('/api/movies', async (req, reply) => {
    const { page = '1', limit = '20', sort, genre, country } = req.query;
    const cacheKey = `movies:${page}:${limit}:${sort || ''}:${genre || ''}:${country || ''}`;

    const cached = globalCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const queryParams = new URLSearchParams({ page, limit });
    if (sort) queryParams.set('sort', sort);
    if (genre) queryParams.set('genre', genre);
    if (country) queryParams.set('country', country);

    const path = `/api/movies?${queryParams.toString()}`;
    const result = await engine.executeFetch(path);

    if (result.status === 200 && result.data) {
      globalCache.set(cacheKey, result.data, 15 * 60 * 1000); // 15 min cache
      return result.data;
    }

    return reply.status(result.status).send(result.data);
  });

  // Series list
  fastify.get<{
    Querystring: { page?: string; limit?: string; sort?: string; genre?: string; country?: string };
  }>('/api/series', async (req, reply) => {
    const { page = '1', limit = '20', sort, genre, country } = req.query;
    const cacheKey = `series:${page}:${limit}:${sort || ''}:${genre || ''}:${country || ''}`;

    const cached = globalCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const queryParams = new URLSearchParams({ page, limit });
    if (sort) queryParams.set('sort', sort);
    if (genre) queryParams.set('genre', genre);
    if (country) queryParams.set('country', country);

    const path = `/api/series?${queryParams.toString()}`;
    const result = await engine.executeFetch(path);

    if (result.status === 200 && result.data) {
      globalCache.set(cacheKey, result.data, 15 * 60 * 1000);
      return result.data;
    }

    return reply.status(result.status).send(result.data);
  });

  // Movie detail
  fastify.get<{ Params: { slug: string } }>('/api/movies/:slug', async (req, reply) => {
    const { slug } = req.params;
    const cacheKey = `movie_detail:${slug}`;

    const cached = globalCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const result = await engine.executeFetch(`/api/movies/${slug}`);
    if (result.status === 200 && result.data) {
      globalCache.set(cacheKey, result.data, 30 * 60 * 1000); // 30 min cache
      return result.data;
    }

    return reply.status(result.status).send(result.data);
  });

  // Series detail
  fastify.get<{ Params: { slug: string } }>('/api/series/:slug', async (req, reply) => {
    const { slug } = req.params;
    const cacheKey = `series_detail:${slug}`;

    const cached = globalCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const result = await engine.executeFetch(`/api/series/${slug}`);
    if (result.status === 200 && result.data) {
      globalCache.set(cacheKey, result.data, 30 * 60 * 1000);
      return result.data;
    }

    return reply.status(result.status).send(result.data);
  });

  // Series season detail (all episodes for a season)
  fastify.get<{
    Params: { slug: string; season: string };
  }>('/api/series/:slug/season/:season', async (req, reply) => {
    const { slug, season } = req.params;
    const cacheKey = `season:${slug}:${season}`;

    const cached = globalCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const result = await engine.executeFetch(`/api/series/${slug}/season/${season}`);
    if (result.status === 200 && result.data) {
      globalCache.set(cacheKey, result.data, 30 * 60 * 1000);
      return result.data;
    }

    return reply.status(result.status).send(result.data);
  });

  // Episode detail
  fastify.get<{
    Params: { slug: string; season: string; episode: string };
  }>('/api/series/:slug/season/:season/episode/:episode', async (req, reply) => {
    const { slug, season, episode } = req.params;
    const cacheKey = `episode:${slug}:${season}:${episode}`;

    const cached = globalCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const result = await engine.executeFetch(`/api/series/${slug}/season/${season}/episode/${episode}`);
    if (result.status === 200 && result.data) {
      globalCache.set(cacheKey, result.data, 30 * 60 * 1000);
      return result.data;
    }

    return reply.status(result.status).send(result.data);
  });

  // Genres
  fastify.get('/api/genres', async (_req, reply) => {
    const cacheKey = 'genres:all';
    const cached = globalCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const result = await engine.executeFetch('/api/genres');
    if (result.status === 200 && result.data) {
      globalCache.set(cacheKey, result.data, 2 * 60 * 60 * 1000); // 2 hours
      return result.data;
    }

    return reply.status(result.status).send(result.data);
  });

  // Search
  fastify.get<{ Querystring: { q?: string } }>('/api/search', async (req, reply) => {
    const query = req.query.q?.trim();
    if (!query) {
      return { results: [], total: 0 };
    }

    const cacheKey = `search:${query.toLowerCase()}`;
    const cached = globalCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const result = await engine.executeFetch(`/api/search?q=${encodeURIComponent(query)}`);
    if (result.status === 200 && result.data) {
      globalCache.set(cacheKey, result.data, 10 * 60 * 1000);
      return result.data;
    }

    return reply.status(result.status).send(result.data);
  });

  // Play info (gateToken & countdown)
  fastify.get<{ Params: { contentType: string; id: string } }>(
    '/api/watch/play-info/:contentType/:id',
    async (req, reply) => {
      const { contentType, id } = req.params;
      const result = await engine.executeFetch(`/api/watch/play-info/${contentType}/${id}`);
      return reply.status(result.status).send(result.data);
    }
  );

  // Claim session
  fastify.post<{ Body: { gateToken: string; verificationToken?: string } }>(
    '/api/watch/session/claim',
    async (req, reply) => {
      const { gateToken, verificationToken } = req.body;
      if (!gateToken) {
        return reply.status(400).send({ error: 'gateToken is required' });
      }

      let didCookie: string | undefined;
      try {
        const rawP0 = gateToken.split('.')[0];
        const decodedP0 = Buffer.from(rawP0, 'base64').toString('utf-8');
        const didMatch = /"owner":"d:([^"]+)"/.exec(decodedP0);
        if (didMatch?.[1]) {
          didCookie = `did=${didMatch[1]}`;
        }
      } catch (_) {}

      const body: Record<string, any> = { gateToken };
      if (verificationToken) {
        body.verificationToken = verificationToken;
      }

      const result = await engine.executeFetch('/api/watch/session/claim', {
        method: 'POST',
        body,
        headers: didCookie ? { Cookie: didCookie } : undefined,
      });

      return reply.status(result.status).send(result.data);
    }
  );

  // Redeem Play (Majorplay CDN / IDLIX Session Redeem)
  fastify.post<{ Body: { url?: string; claim: string; mode?: string } }>(
    '/api/watch/redeem',
    async (req, reply) => {
      const { url = '/api/watch/session/redeem', claim, mode = 'browser' } = req.body;
      if (!claim) {
        return reply.status(400).send({ error: 'claim is required' });
      }

      let targetUrl = url;
      if (targetUrl.startsWith('/') && !targetUrl.startsWith('/api/')) {
        targetUrl = `/api${targetUrl}`;
      }

      const origin = engine.getSessionStatus().targetUrl || 'https://z3.idlixku.com';
      const result = await engine.executeFetch(targetUrl, {
        method: 'POST',
        body: { claim, mode },
        headers: {
          Referer: `${origin}/`,
          Origin: origin,
        },
      });

      return reply.status(result.status).send(result.data);
    }
  );

  // HLS Playlist Rewriter Proxy: propagates ?t=...&pm=browser query tokens across master/variant playlists & segments
  const buildProxyPlaylistUrl = (
    req: any,
    targetUrl: string,
    tokenSearch: string,
    height?: number
  ): string => {
    const host = req.headers.host || '127.0.0.1:5376';
    const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    const params = new URLSearchParams({ u: targetUrl });
    if (tokenSearch) {
      params.set('q', tokenSearch);
    }
    if (height && height > 0) {
      params.set('height', String(height));
    }
    return `${proto}://${host}/api/hls/playlist.m3u8?${params.toString()}`;
  };

  const appendTokenParams = (rawUri: string, baseUrl: string, tokenSearch: string): string => {
    const resolved = new URL(rawUri, baseUrl);
    if (tokenSearch) {
      const extra = new URLSearchParams(tokenSearch.startsWith('?') ? tokenSearch.slice(1) : tokenSearch);
      for (const [k, v] of extra.entries()) {
        if (!resolved.searchParams.has(k)) {
          resolved.searchParams.set(k, v);
        }
      }
    }
    return resolved.toString();
  };

  const parseMasterHeights = (manifestText: string): number[] => {
    const heights = new Set<number>();
    for (const line of manifestText.split(/\r?\n/)) {
      if (!line.startsWith('#EXT-X-STREAM-INF')) continue;
      const m = /RESOLUTION=\d+x(\d+)/i.exec(line);
      if (m?.[1]) {
        const h = parseInt(m[1], 10);
        if (h > 0) heights.add(h);
      }
    }
    return Array.from(heights).sort((a, b) => b - a);
  };

  fastify.get<{
    Querystring: { u?: string; q?: string; height?: string };
  }>('/api/hls/playlist.m3u8', async (req, reply) => {
    const target = req.query.u;
    if (!target) {
      return reply.status(400).send({ error: 'u query parameter is required' });
    }

    try {
      const targetUrl = new URL(target);
      const tokenSearch = req.query.q || targetUrl.search || '';
      const requestedHeight = req.query.height ? parseInt(req.query.height, 10) : 0;
      const origin = engine.getSessionStatus().targetUrl || 'https://z3.idlixku.com';

      const upstream = await fetch(targetUrl.toString(), {
        headers: {
          Referer: `${origin}/`,
          Origin: origin,
        },
      });

      if (!upstream.ok) {
        const errBody = await upstream.text().catch(() => '');
        return reply.status(upstream.status).send(errBody || `Upstream error ${upstream.status}`);
      }

      const text = await upstream.text();
      const lines = text.split(/\r?\n/);
      const isMaster = lines.some((l) => l.startsWith('#EXT-X-STREAM-INF'));

      let filteredLines = lines;
      if (isMaster && requestedHeight > 0) {
        const availableHeights = parseMasterHeights(text);
        if (availableHeights.length > 0) {
          const chosenHeight = availableHeights.includes(requestedHeight)
            ? requestedHeight
            : availableHeights.reduce((prev, curr) =>
                Math.abs(curr - requestedHeight) < Math.abs(prev - requestedHeight) ? curr : prev
              );

          const out: string[] = [];
          let keepNextStreamLine = true;
          for (const line of lines) {
            const t = line.trim();
            if (t.startsWith('#EXT-X-STREAM-INF')) {
              const m = /RESOLUTION=\d+x(\d+)/i.exec(t);
              const h = m?.[1] ? parseInt(m[1], 10) : 0;
              keepNextStreamLine = h === chosenHeight;
              if (keepNextStreamLine) out.push(line);
            } else if (!t.startsWith('#') && t.length > 0) {
              if (keepNextStreamLine) out.push(line);
              keepNextStreamLine = true;
            } else {
              out.push(line);
            }
          }
          filteredLines = out;
        }
      }

      let nextLineIsVariantStream = false;
      const rewritten = filteredLines.map((line) => {
        const trimmed = line.trim();
        if (!trimmed) return line;

        if (trimmed.startsWith('#EXT-X-STREAM-INF')) {
          nextLineIsVariantStream = true;
          return line;
        }

        if (trimmed.startsWith('#EXT-X-MEDIA:') && trimmed.includes('URI="')) {
          return line.replace(/URI="([^"]+)"/, (_m, uri) => {
            const full = appendTokenParams(uri, targetUrl.toString(), tokenSearch);
            return `URI="${buildProxyPlaylistUrl(req, full, tokenSearch)}"`;
          });
        }

        if ((trimmed.startsWith('#EXT-X-MAP:') || trimmed.startsWith('#EXT-X-KEY:')) && trimmed.includes('URI="')) {
          return line.replace(/URI="([^"]+)"/, (_m, uri) => {
            const full = appendTokenParams(uri, targetUrl.toString(), tokenSearch);
            return `URI="${full}"`;
          });
        }

        if (trimmed.startsWith('#')) {
          return line;
        }

        const full = appendTokenParams(trimmed, targetUrl.toString(), tokenSearch);
        if (isMaster || nextLineIsVariantStream) {
          nextLineIsVariantStream = false;
          return buildProxyPlaylistUrl(req, full, tokenSearch);
        }
        return full;
      });

      reply.header('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8');
      reply.header('Cache-Control', 'no-cache');
      return reply.send(rewritten.join('\n'));
    } catch (err: any) {
      req.log.error(err, 'Failed to proxy HLS playlist');
      return reply.status(500).send({ error: err?.message || 'Failed to proxy HLS playlist' });
    }
  });

  const buildProxySubtitleUrl = (req: any, targetUrl: string): string => {
    const host = req.headers.host || '127.0.0.1:5376';
    const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    return `${proto}://${host}/api/subtitle.vtt?u=${encodeURIComponent(targetUrl)}`;
  };

  const formatPlaybackResponse = async (req: any, playback: ResolvedPlaybackResult) => {
    const tokenSearch = new URL(playback.hlsMasterUrl).search;
    const autoUrl = buildProxyPlaylistUrl(req, playback.hlsMasterUrl, tokenSearch);
    const qualities: Array<{ label: string; height: number; url: string }> = [
      { label: 'Auto', height: 0, url: autoUrl },
    ];

    try {
      const origin = engine.getSessionStatus().targetUrl || 'https://z3.idlixku.com';
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3500);
      const res = await fetch(playback.hlsMasterUrl, {
        headers: { Referer: `${origin}/`, Origin: origin },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (res.ok) {
        const text = await res.text();
        for (const h of parseMasterHeights(text)) {
          qualities.push({
            label: `${h}p`,
            height: h,
            url: buildProxyPlaylistUrl(req, playback.hlsMasterUrl, tokenSearch, h),
          });
        }
      }
    } catch (_) {}

    return {
      ...playback,
      hlsMasterUrl: autoUrl,
      qualities,
      subtitles: playback.subtitles.map((s) => ({
        ...s,
        path: s.path ? buildProxySubtitleUrl(req, s.path) : s.path,
      })),
    };
  };

  fastify.get<{
    Querystring: { u?: string };
  }>('/api/subtitle.vtt', async (req, reply) => {
    const target = req.query.u;
    if (!target) {
      return reply.status(400).send({ error: 'u query parameter is required' });
    }

    try {
      const origin = engine.getSessionStatus().targetUrl || 'https://z3.idlixku.com';
      const upstream = await fetch(target, {
        headers: {
          Referer: `${origin}/`,
          Origin: origin,
        },
      });

      if (!upstream.ok) {
        return reply.status(upstream.status).send(`Upstream subtitle error ${upstream.status}`);
      }

      const vttText = await upstream.text();
      reply.header('Content-Type', 'text/vtt; charset=utf-8');
      reply.header('Cache-Control', 'public, max-age=3600');
      return reply.send(vttText);
    } catch (err: any) {
      req.log.error(err, 'Failed to proxy subtitle');
      return reply.status(500).send({ error: err?.message || 'Failed to proxy subtitle' });
    }
  });

  // Step 1: Prepare playback (gateToken + countdown + Turnstile siteKey)
  fastify.get<{
    Querystring: { contentType?: string; contentId?: string; contentTitle?: string };
  }>('/api/playback/prepare', async (req, reply) => {
    const { contentType, contentId, contentTitle } = req.query;
    if (!contentType || !contentId) {
      return reply.status(400).send({ error: 'contentType and contentId are required' });
    }

    try {
      const prepared = await engine.preparePlayback(contentType, contentId, contentTitle);
      return prepared;
    } catch (err: any) {
      req.log.error(err, 'Failed to prepare stream playback');
      return reply.status(500).send({
        error: err?.message || 'Failed to prepare stream playback',
      });
    }
  });

  // Step 2: Claim playback with user-completed verificationToken and redeem HLS URL
  fastify.post<{
    Body: { gateToken?: string; verificationToken?: string; contentTitle?: string };
  }>('/api/playback/claim', async (req, reply) => {
    const { gateToken, verificationToken, contentTitle } = req.body || {};
    if (!gateToken) {
      return reply.status(400).send({ error: 'gateToken is required' });
    }

    try {
      const playback = await engine.claimPlayback({
        gateToken,
        verificationToken,
        contentTitle,
      });
      return await formatPlaybackResponse(req, playback);
    } catch (err: any) {
      req.log.error(err, 'Failed to claim stream playback');
      const status = err?.code === 'VERIFICATION_REQUIRED' ? 403 : 500;
      return reply.status(status).send({
        error: err?.message || 'Failed to claim stream playback',
        code: err?.code,
      });
    }
  });

  // Refresh active claim token before expiration (for long movies/series)
  fastify.post<{
    Body: { renewalToken?: string; progressToken?: string; contentTitle?: string };
  }>('/api/playback/refresh', async (req, reply) => {
    const { renewalToken, progressToken, contentTitle } = req.body || {};
    if (!renewalToken) {
      return reply.status(400).send({ error: 'renewalToken is required' });
    }

    try {
      const playback = await engine.refreshPlayback({
        renewalToken,
        progressToken,
        contentTitle,
      });
      return await formatPlaybackResponse(req, playback);
    } catch (err: any) {
      req.log.error(err, 'Failed to refresh stream playback');
      return reply.status(500).send({
        error: err?.message || 'Failed to refresh stream playback',
      });
    }
  });

  // SubDL alternative subtitle search & ZIP/SRT proxy
  fastify.get<{
    Querystring: {
      film_name?: string;
      type?: string;
      season_number?: string;
      episode_number?: string;
      languages?: string;
      api_key?: string;
    };
  }>('/api/subtitles/subdl', async (req, reply) => {
    const apiKey = (req.query.api_key || process.env.SUBDL_API_KEY || '').trim();
    if (!apiKey) {
      return reply.status(400).send({
        error: 'SubDL API Key belum diatur. Isi di Pengaturan aplikasi atau SUBDL_API_KEY di .env backend.',
        code: 'SUBDL_API_KEY_MISSING',
      });
    }

    const filmName = req.query.film_name?.trim();
    if (!filmName) {
      return reply.status(400).send({ error: 'film_name is required' });
    }

    try {
      const qs = new URLSearchParams({
        api_key: apiKey,
        film_name: filmName,
        type: req.query.type === 'tv' ? 'tv' : 'movie',
        languages: req.query.languages || 'ID,EN',
        subs_per_page: '10',
      });
      if (req.query.season_number) qs.set('season_number', req.query.season_number);
      if (req.query.episode_number) qs.set('episode_number', req.query.episode_number);

      const res = await fetch(`https://api.subdl.com/api/v1/subtitles?${qs.toString()}`);
      const data: any = await res.json();
      if (!res.ok || data?.status === false) {
        return reply.status(res.status === 200 ? 400 : res.status).send({
          error: data?.message || data?.error || 'SubDL request failed',
        });
      }

      const host = req.headers.host || '127.0.0.1:5376';
      const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
      const list = Array.isArray(data?.subtitles) ? data.subtitles : [];
      const normalized = list.slice(0, 12).map((item: any) => {
        const rawUrl = String(item.url || '');
        const fullDl = rawUrl.startsWith('http') ? rawUrl : `https://dl.subdl.com${rawUrl}`;
        const lang = String(item.language || item.lang || 'id').toLowerCase();
        const release = String(item.release_name || item.name || 'SubDL Subtitle');
        return {
          lang: lang.startsWith('indo') ? 'id' : lang.startsWith('eng') ? 'en' : lang.slice(0, 2),
          label: `SubDL: ${release}`,
          path: `${proto}://${host}/api/subtitles/subdl/file?url=${encodeURIComponent(fullDl)}`,
        };
      });

      return { subtitles: normalized };
    } catch (err: any) {
      req.log.error(err, 'Failed to query SubDL');
      return reply.status(500).send({ error: err?.message || 'Failed to query SubDL' });
    }
  });

  fastify.get<{ Querystring: { url?: string } }>('/api/subtitles/subdl/file', async (req, reply) => {
    const target = req.query.url;
    if (!target || (!target.startsWith('https://dl.subdl.com/') && !target.startsWith('https://subdl.com/'))) {
      return reply.status(400).send({ error: 'Valid SubDL download URL is required' });
    }

    try {
      const upstream = await fetch(target);
      if (!upstream.ok) {
        return reply.status(upstream.status).send(`Failed to download SubDL file (${upstream.status})`);
      }

      const buf = Buffer.from(await upstream.arrayBuffer());
      let textContent: string | null = null;
      if (buf.length >= 4 && buf.readUInt32LE(0) === 0x04034b50) {
        textContent = extractSubtitleFromZip(buf);
      } else {
        textContent = buf.toString('utf8');
      }

      if (!textContent) {
        return reply.status(404).send({ error: 'No .srt or .vtt subtitle found inside archive' });
      }

      reply.header('Content-Type', 'text/plain; charset=utf-8');
      return reply.send(textContent);
    } catch (err: any) {
      req.log.error(err, 'Failed to extract SubDL file');
      return reply.status(500).send({ error: err?.message || 'Failed to extract SubDL file' });
    }
  });

  // High-performance All-in-One Playback Resolver
  fastify.get<{
    Querystring: { contentType?: string; contentId?: string; contentTitle?: string };
  }>('/api/playback/resolve', async (req, reply) => {
    const { contentType, contentId, contentTitle } = req.query;
    if (!contentType || !contentId) {
      return reply.status(400).send({ error: 'contentType and contentId are required' });
    }

    try {
      const playback = await engine.resolvePlayback(contentType, contentId, contentTitle);
      return await formatPlaybackResponse(req, playback);
    } catch (err: any) {
      req.log.error(err, 'Failed to resolve stream playback');
      const status = err?.code === 'VERIFICATION_REQUIRED' ? 403 : 500;
      return reply.status(status).send({
        error: err?.message || 'Failed to resolve stream playback',
        code: err?.code,
      });
    }
  });
};
