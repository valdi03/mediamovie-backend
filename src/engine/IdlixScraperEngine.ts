import { connect } from 'puppeteer-real-browser';

export interface ResolvedPlaybackResult {
  title: string;
  hlsMasterUrl: string;
  subtitles: Array<{ lang: string; label: string; path: string }>;
  durationSec: number;
  videoId: string;
  baseUrl?: string;
  renewalToken?: string;
  progressToken?: string;
  expiresAt?: number;
}

export interface PlaybackVerificationInfo {
  siteKey: string;
  action?: string;
}

export interface PreparedPlaybackResult {
  gateToken: string;
  serverNow: number;
  unlockAt: number;
  waitMs: number;
  verification: PlaybackVerificationInfo | null;
  baseUrl: string;
  contentType: string;
  contentId: string;
  title: string;
}

export class IdlixScraperEngine {
  private static instance: IdlixScraperEngine | null = null;
  private browser: any = null;
  private page: any = null;
  private isReady = false;
  private initPromise: Promise<void> | null = null;
  private baseUrl = process.env.IDLIX_BASE_URL || 'https://z3.idlixku.com';
  private gateUnlockMap = new Map<string, number>();

  private constructor() {}

  public static getInstance(): IdlixScraperEngine {
    if (!IdlixScraperEngine.instance) {
      IdlixScraperEngine.instance = new IdlixScraperEngine();
    }
    return IdlixScraperEngine.instance;
  }

  public async init(): Promise<void> {
    if (this.isReady && this.page && !this.page.isClosed()) {
      return;
    }
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = (async () => {
      console.log(`[ScraperEngine] Launching real-browser stealth engine for Cloudflare bypass at ${this.baseUrl}...`);

      try {
        const browserArgs = [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--no-first-run',
          '--no-zygote',
          '--renderer-process-limit=1',
          '--window-size=800,600',
          '--disable-extensions',
          '--disable-background-networking',
          '--disable-sync',
          '--disable-translate',
          '--disable-software-rasterizer',
          '--mute-audio',
          '--no-default-browser-check',
          '--js-flags=--max-old-space-size=128',
          '--lang=id-ID,id,en-US,en',
          '--ignore-certificate-errors',
          '--allow-running-insecure-content',
          '--host-resolver-rules=MAP *.idlixku.com 104.26.4.185, MAP *.majorplay.net 104.21.85.177',
        ];

        // Option A: puppeteer-real-browser with Xvfb virtual display on Linux VPS & SOCKS5 proxy
        const realBrowser = await (connect as any)({
          headless: false,
          turnstile: true,
          disableXvfb: process.platform !== 'linux',
          args: browserArgs,
        });

        this.browser = realBrowser.browser;
        this.page = realBrowser.page;

        // Block heavy external ads only, never block challenge resources
        try {
          await this.page.setRequestInterception(true);
          this.page.on('request', (req: any) => {
            const url = req.url();
            const adBlock = ['xyzchat', 'doubleclick', 'google-analytics', 'analytics.google.com'];

            if (adBlock.some((d) => url.includes(d))) {
              req.abort();
            } else {
              req.continue();
            }
          });
        } catch (_) {}

        console.log(`[ScraperEngine] Navigating to ${this.baseUrl} to solve Cloudflare challenge...`);
        await this.page.goto(this.baseUrl, {
          waitUntil: 'domcontentloaded',
          timeout: 60000,
        });

        console.log('[ScraperEngine] Waiting for Cloudflare Turnstile verification...');
        await this.page.waitForFunction(
          () => {
            const title = document.title.toLowerCase();
            return !title.includes('just a moment') && !title.includes('attention required');
          },
          { timeout: 45000 }
        );

        console.log(`[ScraperEngine] Cloudflare challenge bypassed successfully! Page Title: "${await this.page.title()}"`);
        try {
          const currentOrigin = new URL(this.page.url()).origin;
          if (currentOrigin && currentOrigin.startsWith('http')) {
            this.baseUrl = currentOrigin;
            console.log(`[ScraperEngine] Active base URL updated to: ${this.baseUrl}`);
          }
        } catch (_) {}
        this.isReady = true;
      } catch (err: any) {
        let debugTitle = 'unknown';
        let debugUrl = 'unknown';
        try {
          if (this.page && !this.page.isClosed()) {
            debugTitle = await this.page.title();
            debugUrl = this.page.url();
          }
        } catch (_) {}
        console.error(`[ScraperEngine] Failed to initialize browser session: ${err?.message || err} | Title: "${debugTitle}" | URL: ${debugUrl}`);
        this.isReady = false;
        if (this.browser) {
          try {
            await this.browser.close();
          } catch (_) {}
          this.browser = null;
          this.page = null;
        }
        throw err;
      } finally {
        this.initPromise = null;
      }
    })();

    return this.initPromise;
  }

  public getSessionStatus(): { isReady: boolean; targetUrl: string } {
    return {
      isReady: this.isReady && this.page !== null && !this.page.isClosed(),
      targetUrl: this.baseUrl,
    };
  }

  public async executeFetch<T = any>(
    endpoint: string,
    options: {
      method?: 'GET' | 'POST';
      body?: any;
      headers?: Record<string, string>;
      timeoutMs?: number;
    } = {}
  ): Promise<{ status: number; data: T }> {
    await this.init();

    if (!this.page || this.page.isClosed()) {
      throw new Error('Browser page session is closed');
    }

    const { method = 'GET', body, headers = {} } = options;
    const url = endpoint.startsWith('http') ? endpoint : `${this.baseUrl}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
    console.log(`[ScraperEngine] Current Page: "${this.page.url()}", Target URL: "${url}"`);

    try {
      const result = await this.page.evaluate(
        async (
          fetchUrl: string,
          fetchMethod: string,
          fetchBody: any,
          fetchHeaders: Record<string, string>
        ) => {
          try {
            const headers: Record<string, string> = {
              Accept: 'application/json, text/plain, */*',
              ...fetchHeaders,
            };
            if (fetchMethod !== 'GET' && fetchBody) {
              headers['Content-Type'] = 'application/json';
            }

            const res = await fetch(fetchUrl, {
              method: fetchMethod,
              headers,
              credentials: 'include',
              body: fetchBody && fetchMethod !== 'GET' ? JSON.stringify(fetchBody) : undefined,
            });

            const text = await res.text();
            let parsedData = null;
            try {
              parsedData = JSON.parse(text);
            } catch (_) {
              parsedData = text;
            }

            return {
              status: res.status,
              data: parsedData,
              error: null,
            };
          } catch (e: any) {
            return {
              status: 500,
              data: null,
              error: e?.message || 'In-browser fetch error',
            };
          }
        },
        url,
        method,
        body,
        headers
      );

      if (result.error) {
        throw new Error(result.error);
      }

      // If Cloudflare returns 403 interstitial, mark session invalid so it re-solves next time
      if (
        result.status === 403 &&
        typeof result.data === 'string' &&
        (result.data.includes('Just a moment') ||
          result.data.includes('cf-mitigated') ||
          result.data.includes('challenges.cloudflare.com'))
      ) {
        console.warn(`[ScraperEngine] Received Cloudflare 403 challenge for ${url}. Invalidating scraper session.`);
        this.isReady = false;
        this.page = null;
      }

      return { status: result.status, data: result.data };
    } catch (err: any) {
      console.warn(`[ScraperEngine] Request failed for ${url}: ${err?.message}`);
      // If session might be stale or blocked, trigger re-init in background
      if (err?.message?.includes('Target closed') || err?.message?.includes('Session closed')) {
        this.isReady = false;
        this.page = null;
      }
      throw err;
    }
  }

  private extractDidCookie(gateToken: string): string | undefined {
    try {
      const rawP0 = gateToken.split('.')[0];
      const decodedP0 = Buffer.from(rawP0, 'base64').toString('utf-8');
      const didMatch = /"owner":"d:([^"]+)"/.exec(decodedP0);
      if (didMatch?.[1]) {
        return `did=${didMatch[1]}`;
      }
    } catch (_) {}
    return undefined;
  }

  private pruneGateUnlockMap(): void {
    const now = Date.now();
    for (const [key, unlockMs] of this.gateUnlockMap.entries()) {
      if (now - unlockMs > 10 * 60 * 1000) {
        this.gateUnlockMap.delete(key);
      }
    }
  }

  /**
   * Step 1: Obtains play-info (gateToken, countdown, and optional Turnstile verification config)
   */
  public async preparePlayback(
    contentType: string,
    contentId: string,
    contentTitle?: string
  ): Promise<PreparedPlaybackResult> {
    await this.init();

    let targetType = contentType;
    let targetId = contentId;

    if (contentType === 'tv_series') {
      const seriesRes = await this.executeFetch(`/api/series/${contentId}`);
      const series = seriesRes.data;
      const firstEp =
        series?.defaultSeason?.episodes?.[0] ||
        (series?.seasons?.[0]
          ? (await this.executeFetch(`/api/series/${series.slug}/season/${series.seasons[0].seasonNumber}/episode/1`)).data?.episode
          : null);

      if (firstEp?.id) {
        targetType = 'episode';
        targetId = firstEp.id;
      } else {
        throw new Error('No episodes available for this series');
      }
    }

    const playInfoRes = await this.executeFetch(`/api/watch/play-info/${targetType}/${targetId}`);
    const playInfo = playInfoRes.data;
    if (!playInfo?.gateToken) {
      console.error(`[ScraperEngine] play-info failed (status=${playInfoRes.status}):`, JSON.stringify(playInfo)?.slice(0, 300));
      throw new Error(`Failed to obtain playback gate token from provider (status=${playInfoRes.status}): ${typeof playInfo === 'string' ? playInfo.slice(0, 120) : JSON.stringify(playInfo)?.slice(0, 120)}`);
    }

    const serverNow = playInfo.serverNow || Date.now();
    const unlockAt = playInfo.unlockAt || serverNow + 15000;
    const waitMs = Math.max(0, unlockAt - serverNow);
    const localUnlockAt = Date.now() + waitMs;

    this.pruneGateUnlockMap();
    this.gateUnlockMap.set(playInfo.gateToken, localUnlockAt);

    return {
      gateToken: playInfo.gateToken,
      serverNow,
      unlockAt,
      waitMs,
      verification: playInfo.verification?.siteKey
        ? {
            siteKey: String(playInfo.verification.siteKey),
            action: playInfo.verification.action ? String(playInfo.verification.action) : 'play',
          }
        : null,
      baseUrl: this.baseUrl,
      contentType: targetType,
      contentId: targetId,
      title: contentTitle || 'Video',
    };
  }

  /**
   * Step 2: Waits remaining countdown, claims playback session (with optional Turnstile token), and redeems HLS URL
   */
  public async claimPlayback(options: {
    gateToken: string;
    verificationToken?: string;
    contentTitle?: string;
    fallbackWaitMs?: number;
  }): Promise<ResolvedPlaybackResult> {
    await this.init();

    const { gateToken, verificationToken, contentTitle, fallbackWaitMs = 0 } = options;
    const didCookie = this.extractDidCookie(gateToken);

    const localUnlockAt = this.gateUnlockMap.get(gateToken);
    const remainMs =
      localUnlockAt !== undefined
        ? Math.max(0, localUnlockAt - Date.now() + 250)
        : Math.max(0, fallbackWaitMs);

    if (remainMs > 0) {
      console.log(`[ScraperEngine] Waiting remaining countdown (${Math.ceil(remainMs / 1000)}s)...`);
      await new Promise((resolve) => setTimeout(resolve, Math.min(remainMs, 16500)));
    }

    let claimRes: any = null;
    for (let attempt = 1; attempt <= 8; attempt++) {
      const body: Record<string, any> = { gateToken };
      if (verificationToken) {
        body.verificationToken = verificationToken;
      }

      const claimResp = await this.executeFetch('/api/watch/session/claim', {
        method: 'POST',
        body,
        headers: didCookie ? { Cookie: didCookie } : undefined,
      });

      console.log(`[ScraperEngine] Claim Attempt ${attempt} status=${claimResp.status}:`, JSON.stringify(claimResp.data));

      if (claimResp.data?.claim) {
        claimRes = claimResp.data;
        break;
      }

      const errCode = claimResp.data?.code;
      if (
        claimResp.status === 403 &&
        (errCode === 'VERIFICATION_REQUIRED' || errCode === 'INVALID_VERIFICATION')
      ) {
        const err: any = new Error(claimResp.data?.error || 'Playback verification required');
        err.code = 'VERIFICATION_REQUIRED';
        throw err;
      }

      const providerRemain = Number(claimResp.data?.remainingMs || 0);
      const retryDelay = providerRemain > 0 ? Math.min(providerRemain + 250, 5000) : 700;
      await new Promise((r) => setTimeout(r, retryDelay));
    }

    if (!claimRes?.claim) {
      throw new Error('Failed to claim playback session from provider');
    }

    this.gateUnlockMap.delete(gateToken);

    return this.redeemClaimSession(claimRes, contentTitle);
  }

  private async redeemClaimSession(claimRes: any, contentTitle?: string): Promise<ResolvedPlaybackResult> {
    let redeemUrl = claimRes.redeemUrl || '/api/watch/session/redeem';
    if (redeemUrl.startsWith('/') && !redeemUrl.startsWith('/api/')) {
      redeemUrl = `/api${redeemUrl}`;
    }
    const redeemResp = await this.executeFetch(redeemUrl, {
      method: 'POST',
      body: { claim: claimRes.claim, mode: 'browser' },
      headers: {
        Referer: `${this.baseUrl}/`,
        Origin: this.baseUrl,
      },
    });

    const redeemData = redeemResp.data;
    if (!redeemData?.url) {
      throw new Error('Failed to redeem HLS master playlist URL');
    }

    return {
      title: claimRes.title || contentTitle || 'Video',
      hlsMasterUrl: redeemData.url,
      subtitles: Array.isArray(redeemData.subtitles) ? redeemData.subtitles : [],
      durationSec: claimRes.durationSec || 0,
      videoId: claimRes.videoId || '',
      baseUrl: this.baseUrl,
      renewalToken: claimRes.renewalToken || undefined,
      progressToken: claimRes.progressToken || undefined,
      expiresAt: typeof redeemData.expiresAt === 'number' ? redeemData.expiresAt : undefined,
    };
  }

  /**
   * Refreshes an active playback claim using renewalToken before CDN link expiration
   */
  public async refreshPlayback(options: {
    renewalToken: string;
    progressToken?: string;
    contentTitle?: string;
  }): Promise<ResolvedPlaybackResult> {
    await this.init();

    const body: Record<string, any> = { renewalToken: options.renewalToken };
    if (options.progressToken) {
      body.progressToken = options.progressToken;
    }

    const refreshResp = await this.executeFetch('/api/watch/session/refresh-claim', {
      method: 'POST',
      body,
    });

    if (!refreshResp.data?.claim) {
      throw new Error(refreshResp.data?.error || 'Failed to refresh playback claim');
    }

    return this.redeemClaimSession(refreshResp.data, options.contentTitle);
  }

  /**
   * Resolves complete HLS playback in a single call for high performance
   */
  public async resolvePlayback(
    contentType: string,
    contentId: string,
    contentTitle?: string
  ): Promise<ResolvedPlaybackResult> {
    const prepared = await this.preparePlayback(contentType, contentId, contentTitle);
    return this.claimPlayback({
      gateToken: prepared.gateToken,
      contentTitle: prepared.title,
      fallbackWaitMs: Math.min(prepared.waitMs + 500, 16000),
    });
  }

  public async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
      this.isReady = false;
    }
  }
}
