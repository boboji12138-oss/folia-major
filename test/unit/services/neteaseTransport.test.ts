import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// 验证 Safari 同源传输及原有桌面/外部 API 配置的兼容边界。
beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('VITE_NETEASE_API_BASE', '/api/netease');
    vi.stubGlobal('window', {});
    vi.stubGlobal('localStorage', { getItem: vi.fn(() => null), setItem: vi.fn(), removeItem: vi.fn() });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 200, data: { unikey: 'test-key' } }))));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('NetEase browser transport', () => {
    it('obtains QR keys with no third-party credentials', async () => {
        const { neteaseApi } = await import('@/services/netease');
        await expect(neteaseApi.getQrKey()).resolves.toMatchObject({ code: 200 });
        expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/netease/login/qr/key?timestamp='), expect.objectContaining({ credentials: 'omit', mode: 'same-origin' }));
    });

    it('passes restored account sessions in a header, not in the URL', async () => {
        vi.mocked(localStorage.getItem).mockReturnValue('MUSIC_U=private-test-session');
        const { neteaseApi } = await import('@/services/netease');
        await neteaseApi.getLoginStatus();
        const [url, options] = vi.mocked(fetch).mock.calls[0];
        expect(String(url)).not.toContain('cookie=');
        expect(new Headers(options?.headers).get('X-Netease-Cookie')).toBe('MUSIC_U=private-test-session');
    });

    it('encodes QR keys so they cannot alter the request query', async () => {
        const { neteaseApi } = await import('@/services/netease');
        await neteaseApi.checkQr('key&cookie=unexpected');
        expect(String(vi.mocked(fetch).mock.calls[0][0])).toContain('key=key%26cookie%3Dunexpected');
    });

    it('keeps explicitly configured non-Vercel APIs working', async () => {
        vi.stubEnv('VITE_NETEASE_API_BASE', 'https://api.example.test');
        const { neteaseApi } = await import('@/services/netease');
        await neteaseApi.getQrKey();
        expect(fetch).toHaveBeenCalledWith(expect.stringContaining('https://api.example.test/login/qr/key'), expect.objectContaining({ mode: 'cors', credentials: 'include' }));
    });
});
