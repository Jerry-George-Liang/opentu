import { afterEach, describe, expect, it, vi } from 'vitest';

describe('tuzi-api-endpoints', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('只把内置 tuzi-api 上游 origin 视为可信', async () => {
    vi.resetModules();

    const { isTrustedTuziApiBaseUrl, isTuziCompatibleBaseUrl } = await import(
      '../provider-routing/tuzi-api-endpoints'
    );

    expect(isTrustedTuziApiBaseUrl('https://api.tu-zi.com/v1')).toBe(true);
    expect(isTrustedTuziApiBaseUrl('https://apisz.ourzhishi.top/v1')).toBe(
      true
    );
    expect(isTrustedTuziApiBaseUrl('https://api.openai.com/v1')).toBe(false);
    expect(isTrustedTuziApiBaseUrl('https://evil.tu-zi.com/v1')).toBe(false);
    expect(isTuziCompatibleBaseUrl('https://api.sydney-ai.com/v1')).toBe(true);
    expect(isTuziCompatibleBaseUrl('https://api.ourzhishi.top/v1')).toBe(true);
    expect(isTuziCompatibleBaseUrl('https://apisz.ourzhishi.top/v1')).toBe(
      true
    );
    expect(isTuziCompatibleBaseUrl('https://api.openai.com/v1')).toBe(false);
  });

  it('解析 tuzi-api 状态接口中的站点列表，并过滤非上游站点', async () => {
    vi.resetModules();

    const { parseTuziApiAddressList, TUZI_API_FALLBACK_ENDPOINTS } =
      await import('../provider-routing/tuzi-api-endpoints');

    const endpoints = parseTuziApiAddressList([
      {
        name: '主站点',
        url: 'https://api.tu-zi.com/v1',
        description: '主站点',
      },
      {
        name: '不可信站点',
        url: 'https://example.com',
        description: '应被过滤',
      },
      {
        url: 'https://apisz.ourzhishi.top/',
      },
    ]);

    expect(endpoints).toEqual([
      {
        name: '主站点',
        url: 'https://api.tu-zi.com',
        description: '主站点',
      },
      {
        name: '深圳地址（无前端）',
        url: 'https://apisz.ourzhishi.top',
        description: '深圳地址',
      },
    ]);
    expect(endpoints.length).toBeLessThan(TUZI_API_FALLBACK_ENDPOINTS.length);
  });

  it.each([
    'https://opentu.ai',
    'https://pr.opentu.ai',
    'http://localhost:7200',
    'https://self-hosted.example/opentu/',
  ])(
    '通过 %s 的同源代理读取站点，不携带凭据，并缓存成功结果',
    async (origin) => {
      vi.resetModules();
      vi.stubGlobal('location', new URL(origin));
      const endpoints = [{ name: '主站点', url: 'https://api.tu-zi.com' }];
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            success: true,
            data: { api_address_list: endpoints },
          })
        )
      );
      vi.stubGlobal('fetch', fetchMock);

      const { loadTuziApiEndpointSources } = await import(
        '../provider-routing/tuzi-api-endpoints'
      );
      const result = await loadTuziApiEndpointSources();

      expect(result).toEqual([expect.objectContaining(endpoints[0])]);
      expect(fetchMock).toHaveBeenCalledWith(
        `${new URL(origin).origin}/__opentu_tuzi_session__/api/status`,
        { cache: 'no-store', credentials: 'omit' }
      );
      expect(await loadTuziApiEndpointSources()).toBe(result);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
  );

  it('Worker 没有 window 时仍通过当前 origin 的代理读取站点', async () => {
    vi.resetModules();
    vi.stubGlobal('window', undefined);
    vi.stubGlobal('location', new URL('https://opentu.ai/sw.js'));
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ success: true, data: { api_address_list: [] } })
        )
      );
    vi.stubGlobal('fetch', fetchMock);

    const { loadTuziApiEndpointSources, TUZI_API_FALLBACK_ENDPOINTS } =
      await import('../provider-routing/tuzi-api-endpoints');

    await expect(loadTuziApiEndpointSources()).resolves.toEqual(
      TUZI_API_FALLBACK_ENDPOINTS
    );
    expect(fetchMock).toHaveBeenCalledWith(
      'https://opentu.ai/__opentu_tuzi_session__/api/status',
      { cache: 'no-store', credentials: 'omit' }
    );
  });

  it.each([
    undefined,
    'https://api.tu-zi.com/opentu/',
    'file:///opentu/index.html',
  ])('在无 HTTP origin 或与上游同源时直接读取状态（%s）', async (url) => {
    vi.resetModules();
    if (!url) {
      vi.stubGlobal('window', undefined);
    }
    vi.stubGlobal('location', url ? new URL(url) : undefined);
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ success: true, data: { api_address_list: [] } })
        )
      );
    vi.stubGlobal('fetch', fetchMock);

    const { loadTuziApiEndpointSources, TUZI_API_STATUS_URL } = await import(
      '../provider-routing/tuzi-api-endpoints'
    );

    await loadTuziApiEndpointSources();
    expect(fetchMock).toHaveBeenCalledWith(TUZI_API_STATUS_URL, {
      cache: 'no-store',
      credentials: 'omit',
    });
  });

  it('代理错误不会缓存为成功，后续调用可以恢复', async () => {
    vi.resetModules();
    vi.stubGlobal('location', new URL('https://opentu.ai'));
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('Bad Gateway', { status: 502 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              api_address_list: [
                { name: '主站点', url: 'https://api.tu-zi.com' },
              ],
            },
          })
        )
      );
    vi.stubGlobal('fetch', fetchMock);

    const { loadTuziApiEndpointSources } = await import(
      '../provider-routing/tuzi-api-endpoints'
    );
    await expect(loadTuziApiEndpointSources()).rejects.toThrow('502');
    await expect(loadTuziApiEndpointSources()).resolves.toEqual([
      expect.objectContaining({ url: 'https://api.tu-zi.com' }),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('代理返回 SPA HTML 时拒绝响应，baseUrl 列表仍回退到内置站点', async () => {
    vi.resetModules();
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockImplementation(
          async () => new Response('<!doctype html><html></html>')
        )
    );

    const {
      loadTuziApiEndpointSources,
      loadTuziApiEndpointBaseUrls,
      TUZI_API_FALLBACK_ENDPOINTS,
    } = await import('../provider-routing/tuzi-api-endpoints');

    await expect(loadTuziApiEndpointSources()).rejects.toThrow();
    await expect(loadTuziApiEndpointBaseUrls()).resolves.toEqual(
      TUZI_API_FALLBACK_ENDPOINTS.map((endpoint) => endpoint.url)
    );
  });

  it('获取站点来源失败时，baseUrl 列表回退到内置 tuzi-api 站点', async () => {
    vi.resetModules();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      })
    );

    const { loadTuziApiEndpointBaseUrls, TUZI_API_FALLBACK_ENDPOINTS } =
      await import('../provider-routing/tuzi-api-endpoints');

    await expect(loadTuziApiEndpointBaseUrls()).resolves.toEqual(
      TUZI_API_FALLBACK_ENDPOINTS.map((endpoint) =>
        endpoint.url.replace(/\/+$/, '')
      )
    );
  });

  it('只把显式配置的本地 API 作为直连恢复节点', async () => {
    vi.resetModules();
    vi.doMock('../tuzi-embedded-config', () => ({
      tuziEmbeddedConfig: {
        enabled: true,
        apiBaseUrl: 'http://192.168.50.225:18180',
        parentOrigin: null,
      },
    }));

    try {
      const {
        isConfiguredTuziApiBaseUrl,
        isTrustedTuziApiBaseUrl,
        isTuziRequestRecoveryBaseUrl,
      } = await import('../provider-routing/tuzi-api-endpoints');

      expect(isConfiguredTuziApiBaseUrl('http://192.168.50.225:18180/v1')).toBe(
        true
      );
      expect(
        isTuziRequestRecoveryBaseUrl('http://192.168.50.225:18180/v1')
      ).toBe(true);
      expect(isTrustedTuziApiBaseUrl('http://192.168.50.225:18180/v1')).toBe(
        false
      );
      expect(
        isTuziRequestRecoveryBaseUrl('http://192.168.50.226:18180/v1')
      ).toBe(false);
    } finally {
      vi.doUnmock('../tuzi-embedded-config');
    }
  });
});
