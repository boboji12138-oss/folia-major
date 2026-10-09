# iPhone 网易云登录修复交付

验收日期：2026-10-09。目标生产地址：https://folia-major-rose.vercel.app 。

## 已证实的故障

线上 API 的 `/login/qr/key` 返回 HTTP 200、`code: 200` 和 key，但携带
`Origin: https://folia-major-rose.vercel.app` 后仍缺少
`Access-Control-Allow-Origin`。Chromium 真实页面明确报出该缺失，并拒绝
`credentials: include` 的 fetch。直接在 Safari 地址栏打开接口不检验网页跨域读取权限，
所以接口直开成功与 Folia 登录失败并不矛盾。这是本次抓取证据，不是猜测。

此外，API `module/login_qr_check.js` 的 catch 引用了 try 块内的 `result`，
上游请求失败时会触发 ReferenceError。API 的共享缓存键忽略 POST 正文，
所以代理还必须隔离每一次上游请求，不能把不同搜索或扫码状态混在一起。

## 代码变更

- `api-ts/netease.ts`、生成的 `api/netease.js`：固定服务端上游，完整转发网易 API
  路径与参数。客户端会话头转为上游 POST 正文；不转发浏览器 Cookie 或上游
  Set-Cookie。响应 no-store，请求 URL 用随机标识避开旧上游正文无关缓存。
  限定路径、禁止重定向、设置请求超时，错误不会复制凭据或上游原始异常。
- `vercel.json`：增加 `/api/netease/:path*` 的同域路由，保留 QQ 及其他函数。
- `vite.config.ts`：Vercel 构建强制网页版走同源代理；已有远端
  `VITE_NETEASE_API_BASE` 供服务端使用；开发环境也装配相同代理。
  上游可用服务端 `NETEASE_API_UPSTREAM` 指定，默认使用当前既有 API 网站。
- `src/services/netease.ts`：同域请求不携带浏览器 Cookie，已保存的网易会话通过
  `X-Netease-Cookie` 传递；二维码 key 编码、请求有超时。
  其他部署与 Electron 保留既有配置。
- `src/services/onlineMusic/neteaseProvider.ts`：确认码 803 必须带有效会话；
  瞬时失败保留重试标识，二维码 175 秒过期。沿用串行轮询及代次检查。
- `src/services/onlineMusic/loginSelfCheck.ts`：同域自检实际访问上游登录状态，
  HTTP 错误不再被当成可达成功。
- `index.html`、`public/*png`：使用 iPhone 支持的 180px Apple 图标与
  192px/512px PNG manifest 图标；manifest 明确 start_url/scope。
- API 仓库 `module/login_qr_check.js`、`server.js`：保留真实扫码业务错误，
  网络异常不会再引用不存在的变量；登录和带会话的响应不进入共享缓存。

网易会话仍沿用项目原有的 provider localStorage 持久化边界。本次没有把它迁移为
HttpOnly 服务端会话，因此不能声称前端脚本无法访问该凭据。测试未使用任何真实用户
Cookie/Token，日志和交付文件也不包含这些信息。

## 验证结果

- Folia 相关单元测试：119 项通过，涵盖代理、传输、provider、扫码会话、歌曲替代、
  专辑及每日推荐；TypeScript 检查通过。
- API 离线测试：9 项通过；变更文件 Prettier/ESLint 通过。
- 生产构建通过，生成 PWA service worker 与 manifest；`/api` 不落入 SPA 导航缓存。
- iPhone 13 视口 Chromium/WebKit：4 项通过。两种引擎均从真实远端 API 经本地
  同源代理获取 key、PNG 二维码并读到等待扫码状态 801；另用测试会话验证了
  确认、账号刷新及页面重载后的会话恢复，没有 cookie URL。
- 真实远端搜索“晴天”“星茶会”成功；歌曲 186016 的歌词返回非空。
- 音源 API：歌曲 186016 没有可用 URL；歌曲 2012953236 返回网易官方
  `music.126.net` CDN URL、code 200、无试听标记。仅拿到 URL 不能算实际播放通过。
- 官方音源独立浏览器播放：Chromium 已实际播放超过 1 秒，媒体无错误；该源返回
  HTTP 206、audio/mpeg、Range 与 CORS 支持。Linux WebKit 收到媒体响应，但播放报
  `NotSupportedError` / 媒体错误码 4；原因尚未确认，不能据此宣布 iPhone 播放已修复。
  这是独立媒体标签测试，仍不等同于完整 Folia 播放流程验收。

## 尚未完成

- 没有真实网易账号扫码确认，没有验证用户账号 Cookie、用户歌单或会员音源。
- 没有用户的物理 iPhone 测试，没有验证锁屏或后台播放。
- 本地预交付阶段尚未获得有效 GitHub/Vercel 连接，未推送、未创建远端 PR、未合并、未部署。
  用户随后已完成 GitHub CLI 授权；当前 PR 和生产部署状态以 GitHub/Vercel 实际记录为准。
  上述浏览器测试指本地修复与真实 API，不能代表原生产网站已更新。
- 生产部署后的登录、搜索、歌词及完整 Folia 播放链路仍须逐项验收。

## 最少的后续操作

用户用 iPhone 连接 GitHub，授予两个现有仓库访问权限。代理修复可先进入 Folia
的 PR，用户确认后合并到原生产分支，利用现有 Vercel Git 集成部署；无需另建项目。
API 修复可独立提交第二个 PR。若自动部署失败，再连接 Vercel 排查原项目；不购买服务。

部署成功后验证目标网址的 `/api/netease/login/qr/key`、二维码图片及轮询，
由用户在网易云 App 中确认登录，再检查账户恢复、搜索、官方音源、歌词。
只有一部 iPhone 时，可保存二维码图片，在网易云扫一扫中选择相册；是否支持相册识别
取决于当前网易云 App 版本，需要用户实际确认。

Safari 添加到主屏幕：打开目标网址 → 分享 → 添加到主屏幕 → 添加。
图标和安装条件已在源码修复，但必须等该构建部署后才能验收。
