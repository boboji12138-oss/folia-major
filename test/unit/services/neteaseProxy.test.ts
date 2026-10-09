import { Readable } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import handler from '../../../api-ts/netease';

// 同源代理边界：完整保留 API 路径/参数，凭据只进入 POST 正文，不进入 URL/浏览器 Cookie。
const invoke = async (url: string, headers: Record<string, string> = {}, method = 'GET') => {
    const req = Object.assign(Readable.from([]), { url, headers, method });
    const responseHeaders: Record<string, unknown> = {};
    let output = '';
    const res = { statusCode: 0, setHeader: (key: string, value: unknown) => { responseHeaders[key] = value; }, end: (body: string) => { output = body; } };
    await handler(req as any, res as any);
    return { status: res.statusCode, headers: responseHeaders, body: JSON.parse(output) };
};

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('NetEase same-origin proxy', () => {
    it('forwards QR, search, lyrics and playback paths without exposing credentials in the URL', async () => {
        vi.stubEnv('NETEASE_API_UPSTREAM', 'https://api.example.test');
        const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 200 })));
        vi.stubGlobal('fetch', fetchMock);
        for (const path of ['/login/qr/key', '/login/qr/check', '/cloudsearch', '/lyric/new', '/song/url/v1', '/playlist/detail']) {
            const result = await invoke(`/api/netease?path=${path}&id=42&key=qr-key`, { 'x-netease-cookie': 'MUSIC_U=private-test-session', cookie: 'unrelated=do-not-forward' });
            const [target, options] = fetchMock.mock.calls.at(-1)!;
            expect(new URL(target).origin + new URL(target).pathname).toBe(`https://api.example.test${path}`);
            expect(new URL(target).searchParams.has('_foliaRequest')).toBe(true);
            expect(String(target)).not.toContain('private-test-session');
            expect(options.method).toBe('POST');
            expect(JSON.parse(options.body)).toMatchObject({ id: '42', key: 'qr-key', cookie: 'MUSIC_U=private-test-session', noCookie: true });
            expect(options.headers).not.toHaveProperty('Cookie');
            expect(result.headers['Cache-Control']).toContain('no-store');
            expect(result.headers).not.toHaveProperty('Set-Cookie');
        }
    });

    it.each(['/api/netease?path=//evil.example/x', '/api/netease?path=/../login', '/api/netease?path=https://evil.example'])('rejects unsafe targets: %s', async url => {
        const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
        expect((await invoke(url)).status).toBe(400);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('returns a retryable failure without printing upstream errors or session data', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('private-session-do-not-expose')));
        const result = await invoke('/api/netease/login/qr/check');
        expect(result).toMatchObject({ status: 502, body: { code: 502, transient: true } });
        expect(JSON.stringify(result)).not.toContain('private-session-do-not-expose');
    });

    it('keeps upstream status and business response codes intact', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 301, msg: '需要登录' }), { status: 401 })));
        expect(await invoke('/api/netease/user/account')).toMatchObject({ status: 401, body: { code: 301 } });
    });
});
