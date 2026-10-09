import { expect, test } from '@playwright/test';
import { installBaseState, mockNeteaseApi, openApp } from '../ui/helpers/appFixtures';

// 手机视口回归：同源扫码、账号刷新与会话恢复；不代表真实网易账号授权已完成。
test('QR confirmation refreshes the account without cross-site requests or cookie URLs', async ({ page }) => {
    await installBaseState(page, { neteaseMode: 'guest', preserveNativeMediaQueries: true });
    await mockNeteaseApi(page, 'guest', '/api/netease');
    const requests: Array<{ pathname: string; session: boolean; cookieInUrl: boolean }> = [];
    page.on('request', request => {
        const url = new URL(request.url());
        if (url.pathname.startsWith('/api/netease/')) requests.push({ pathname: url.pathname, session: Boolean(request.headers()['x-netease-cookie']), cookieInUrl: url.searchParams.has('cookie') });
    });
    await openApp(page);
    await page.getByRole('button', { name: /Log in to 网易云|Connect .* Account/ }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByAltText('QR Code')).toBeVisible();
    await expect(dialog).toBeHidden({ timeout: 15_000 });
    await expect(page.getByRole('heading', { name: 'Daily Mix' }).first()).toBeVisible();
    expect(requests.some(r => r.pathname === '/api/netease/login/qr/check')).toBe(true);
    expect(requests.every(r => !r.cookieInUrl)).toBe(true);
    expect(requests.some(r => r.pathname === '/api/netease/login/status' && r.session)).toBe(true);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Daily Mix' }).first()).toBeVisible();
});

test('Safari QR generation and waiting poll reach the real upstream through the proxy', async ({ page }) => {
    test.skip(process.env.FOLIA_LIVE_API_TESTS !== '1', 'Live API checks are opt-in and require network access');
    await page.goto('/runtime-config.js');
    const result = await page.evaluate(async () => {
        const keyResponse = await fetch('/api/netease/login/qr/key', { credentials: 'omit' });
        const keyBody = await keyResponse.json();
        const key = keyBody.data?.unikey;
        if (!key) return { keyCode: keyBody.code, qrImage: false, pollCode: null, noStore: false };
        const qr = await (await fetch('/api/netease/login/qr/create?qrimg=true&key=' + encodeURIComponent(key), { credentials: 'omit' })).json();
        const poll = await (await fetch('/api/netease/login/qr/check?key=' + encodeURIComponent(key), { credentials: 'omit' })).json();
        return { keyCode: keyBody.code, qrImage: Boolean(qr.data?.qrimg?.startsWith('data:image/png;base64,')), pollCode: poll.code, noStore: keyResponse.headers.get('cache-control')?.includes('no-store') };
    });
    expect(result).toEqual({ keyCode: 200, qrImage: true, pollCode: 801, noStore: true });
});
