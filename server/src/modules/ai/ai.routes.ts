import { type Context, Hono } from 'hono';
import { type CapabilityId, ErrorCode } from '@aiworkstation/shared-types';
import { requireAuth, requireCapability } from '../../common/middleware/auth.middleware.js';
import { errorJson } from '../../common/response/api-response.js';
import { getOfficialChannel } from '../entitlements/entitlements.service.js';

export const aiRoutes = new Hono();

const CAPABILITY_HEADER = 'x-ai-capability';
const VALID_CAPABILITIES: readonly CapabilityId[] = [
  'chat',
  'vision',
  'embedding',
  'web_search',
  'image_gen',
  'video_gen',
];

/**
 * 官方通道通用转发：从 official_channels 表读取上游地址与密钥，
 * 注入 Authorization 后透传请求体与响应流。
 * 上游配置不在代码/env 中写死（docs/ai-config-membership-v2-plan.md）。
 */
async function proxyToOfficialChannel(
  c: Context,
  capability: CapabilityId,
  buildBody?: (raw: string) => string,
) {
  const channel = await getOfficialChannel(capability);
  if (!channel) {
    return errorJson(
      c,
      `Official channel for capability "${capability}" is not configured on the server.`,
      ErrorCode.INTERNAL_ERROR,
      500,
    );
  }

  const rawBody = await c.req.text();
  const body = buildBody ? buildBody(rawBody) : rawBody;

  let upstreamRes: Response;
  try {
    upstreamRes = await fetch(channel.upstreamUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${channel.apiKey}`,
      },
      body,
    });
  } catch (err) {
    console.error(`[AI Proxy] Upstream request failed (${capability}):`, err);
    return errorJson(
      c,
      'Failed to reach upstream AI provider. Please try again later.',
      ErrorCode.INTERNAL_ERROR,
      500,
    );
  }

  // Pipe the upstream response (SSE stream or JSON) straight through.
  return new Response(upstreamRes.body, {
    status: upstreamRes.status,
    headers: {
      'Content-Type': upstreamRes.headers.get('Content-Type') || 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}

/**
 * Chat completions（对话模型，VIP 起）。
 * 视觉模型请求复用此端点：客户端带 `x-ai-capability: vision` 头时按
 * vision 能力做权益门禁（SVIP 起），上游走 official_channels.vision。
 */
aiRoutes.post('/v1/chat/completions', requireAuth, async (c) => {
  const header = c.req.header(CAPABILITY_HEADER)?.trim();
  const capability: CapabilityId = VALID_CAPABILITIES.includes(header as CapabilityId)
    ? (header as CapabilityId)
    : 'chat';
  let proxyRes: Response | undefined;
  const gateResult = await requireCapability(capability)(c, async () => {
    // 视觉能力走独立上游配置（未配置时回退 chat 上游，兼容单上游部署）
    const channelCap = capability === 'vision' && !(await getOfficialChannel('vision'))
      ? 'chat'
      : capability;
    proxyRes = await proxyToOfficialChannel(c, channelCap);
  });
  return proxyRes ?? gateResult;
});

/** Embeddings（向量模型，VIP 起） */
aiRoutes.post('/v1/embeddings', requireAuth, requireCapability('embedding'), async (c) => {
  return proxyToOfficialChannel(c, 'embedding');
});

/** Images generations（生图，SVIP 起） */
aiRoutes.post('/v1/images/generations', requireAuth, requireCapability('image_gen'), async (c) => {
  return proxyToOfficialChannel(c, 'image_gen');
});

/** Videos generations（视频生成，SVIP 起，预留） */
aiRoutes.post('/v1/videos/generations', requireAuth, requireCapability('video_gen'), async (c) => {
  return proxyToOfficialChannel(c, 'video_gen');
});

/**
 * 联网搜索（VIP 起）。
 * 客户端发 { query, maxResults }；上游配置为 tavily 时做请求/响应格式适配，
 * 统一返回 { results: [{ title, url, snippet, score }] }。
 */
aiRoutes.post('/v1/search', requireAuth, requireCapability('web_search'), async (c) => {
  const channel = await getOfficialChannel('web_search');
  if (!channel) {
    return errorJson(
      c,
      'Official channel for capability "web_search" is not configured on the server.',
      ErrorCode.INTERNAL_ERROR,
      500,
    );
  }

  let query = '';
  let maxResults = 5;
  try {
    const payload = (await c.req.json()) as { query?: string; maxResults?: number };
    query = String(payload.query ?? '').trim();
    if (Number.isFinite(payload.maxResults) && Number(payload.maxResults) > 0) {
      maxResults = Math.min(20, Math.floor(Number(payload.maxResults)));
    }
  } catch {
    return errorJson(c, 'Invalid JSON body.', ErrorCode.VALIDATION_ERROR, 400);
  }
  if (!query) {
    return errorJson(c, 'Field "query" is required.', ErrorCode.VALIDATION_ERROR, 400);
  }

  try {
    if (channel.provider === 'tavily') {
      const res = await fetch(channel.upstreamUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${channel.apiKey}`,
        },
        body: JSON.stringify({ query, max_results: maxResults }),
      });
      const json = (await res.json()) as {
        results?: Array<{ title?: string; url?: string; content?: string; score?: number }>;
      };
      if (!res.ok) {
        console.error('[AI Proxy] Tavily search failed:', res.status, json);
        return errorJson(c, 'Upstream search provider error.', ErrorCode.INTERNAL_ERROR, 500);
      }
      return c.json({
        results: (json.results ?? []).map((r) => ({
          title: r.title ?? '',
          url: r.url ?? '',
          snippet: r.content ?? '',
          score: r.score,
        })),
      });
    }

    if (channel.provider === 'brave') {
      const url = `${channel.upstreamUrl}?q=${encodeURIComponent(query)}&count=${maxResults}`;
      const res = await fetch(url, {
        headers: { Accept: 'application/json', 'X-Subscription-Token': channel.apiKey },
      });
      const json = (await res.json()) as {
        web?: { results?: Array<{ title?: string; url?: string; description?: string }> };
      };
      if (!res.ok) {
        console.error('[AI Proxy] Brave search failed:', res.status, json);
        return errorJson(c, 'Upstream search provider error.', ErrorCode.INTERNAL_ERROR, 500);
      }
      return c.json({
        results: (json.web?.results ?? []).map((r) => ({
          title: r.title ?? '',
          url: r.url ?? '',
          snippet: r.description ?? '',
        })),
      });
    }

    return errorJson(
      c,
      `Unsupported web_search upstream provider "${channel.provider}".`,
      ErrorCode.INTERNAL_ERROR,
      500,
    );
  } catch (err) {
    console.error('[AI Proxy] Search upstream request failed:', err);
    return errorJson(c, 'Failed to reach upstream search provider.', ErrorCode.INTERNAL_ERROR, 500);
  }
});
