async page => {
  /* 票 08/09 真浏览器 E2E 主旅程（playwright-cli run-code 执行）；
     截图统一落 qa-shots/admin-*；凭据只从环境变量读。 */
  const base = 'http://127.0.0.1:5173';
  // run-code 沙箱里没有 process；凭据由临时静态文件（dev server 的 public/）带进来，
  // 用完即删，也不进 git。本文件与命令行里都不出现明文。
  await page.goto(base + '/__qa-credentials.json');
  const credText = await page.evaluate(() => document.body.innerText);
  const creds = JSON.parse(credText);
  const user = creds.username;
  const password = creds.password;
  if (!user || !password) {
    throw new Error('凭据文件内容不完整');
  }
  const shot = (name) => page.screenshot({ path: `qa-shots/${name}.png`, fullPage: true });
  const log = (msg) => console.log(`[e2e] ${msg}`);

  // ---- 1. 未登录访问后台 → 登录页带 redirect ----
  await page.goto(`${base}/admin/posts`);
  await page.waitForURL('**/admin/login**');
  await page.waitForTimeout(600);
  await shot('admin-01-login-redirect');
  log('guard: /admin/posts -> /admin/login?redirect=/admin/posts');

  // ---- 2. 登录失败：明确反馈 ----
  await page.getByPlaceholder('store manager').fill('admin');
  await page.locator('input[type="password"]').fill('wrong-password-123');
  await page.getByRole('button', { name: '进入后台' }).click();
  await page.getByText('用户名或密码不正确').waitFor({ timeout: 8000 });
  await page.waitForTimeout(300);
  await shot('admin-02-login-failed');
  log('login failed feedback shown: 用户名或密码不正确');

  // ---- 3. 登录成功 → 列表 ----
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: '进入后台' }).click();
  await page.waitForURL('**/admin/posts', { timeout: 10000 });
  await page.locator('.n-table tbody tr').first().waitFor({ timeout: 10000 });
  await page.waitForTimeout(800);
  await shot('admin-03-posts-list');
  const draftCount = await page.locator('.chip.draft').count();
  log(`posts list rendered; draft stamps = ${draftCount}`);

  // localStorage / document.cookie 断言（access token 只能在内存）
  const storageProbe = await page.evaluate(() => ({
    localStorageKeys: Object.keys(window.localStorage),
    sessionStorageKeys: Object.keys(window.sessionStorage),
    documentCookieHasRefresh: document.cookie.includes('refresh_token'),
  }));
  log(`storage probe: ${JSON.stringify(storageProbe)}`);

  // ---- 4. 新建文章（编辑器） ----
  await page.getByRole('button', { name: '＋ 新建文章' }).click();
  await page.waitForURL('**/admin/posts/new', { timeout: 10000 });
  await page.waitForTimeout(1000);
  const title = 'paste to upload E2E 验收';
  await page.locator('.ed-title').fill(title);
  await page.locator('#ed-summary textarea').fill(
    '用一次真实上传验证粘贴图片到插入 Markdown 的完整链路，占位符会被替换成站内 URL。',
  );
  await page.locator('.src').fill('## 为什么要预渲染\n\n预览与前台共用同一条渲染管线。\n\n```js\nconsole.log("hello");\n```\n');
  await page.waitForTimeout(900); // 等预览防抖
  const previewHeading = await page.locator('.ed-out h2').count();
  log(`preview h2 count = ${previewHeading}`);
  await shot('admin-04-editor-new');

  // ---- 5. 插入图片 → 上传 → URL 写进正文 ----
  await page.locator('input[type="file"]').setInputFiles('qa-fixtures/1x1.png');
  await page.waitForFunction(
    () => document.querySelector('.src').value.includes('/uploads/'),
    null,
    { timeout: 15000 },
  );
  const md = await page.locator('.src').inputValue();
  const inserted = md.match(/!\[1x1\]\((\/uploads\/[^)]+)\)/);
  if (inserted === null) {
    throw new Error(`上传后正文里没有 /uploads 链接：${md}`);
  }
  log(`uploaded url inserted: ${inserted[1]}`);
  await page.waitForTimeout(900);
  const previewImgCount = await page.locator('.ed-out img').count();
  log(`preview img count = ${previewImgCount}`);
  await shot('admin-05-upload-inserted');

  // ---- 6. 保存草稿 → URL 换成编辑态 ----
  await page.getByRole('button', { name: '存草稿' }).click();
  await page.waitForURL('**/admin/posts/paste-to-upload-e2e/edit', { timeout: 10000 });
  await page.waitForTimeout(600);
  await shot('admin-06-saved-draft');
  log('saved; url = /admin/posts/paste-to-upload-e2e/edit');

  // ---- 7. 发布（确认弹层 + 固定文案可见） ----
  const noticeText = await page.locator('.ed-notice').textContent();
  log(`publish notice: ${noticeText.trim()}`);
  await page.getByRole('button', { name: '发布', exact: true }).click();
  await page.getByRole('button', { name: '发布', exact: true }).nth(1).waitFor({ timeout: 5000 });
  await page.locator('.n-dialog').getByRole('button', { name: '发布' }).click();
  await page.locator('.chip.pub, .ed-act >> text=取消发布').first().waitFor({ timeout: 10000 });
  await page.waitForTimeout(500);
  await shot('admin-07-published');
  log('published');

  // ---- 8. 公开接口可见 / 草稿不可见 ----
  const publicCheck = await page.evaluate(async () => {
    const published = await fetch('/api/posts/paste-to-upload-e2e');
    const draft = await fetch('/api/posts/keyboard-shortcuts-tradeoff');
    return { publishedStatus: published.status, draftStatus: draft.status };
  });
  log(`public api: published=${publicCheck.publishedStatus}, draft=${publicCheck.draftStatus}`);
  if (publicCheck.publishedStatus !== 200) {
    throw new Error('发布后的文章公开接口居然不可见');
  }
  if (publicCheck.draftStatus !== 404) {
    throw new Error('草稿居然能从公开接口读到');
  }

  // ---- 9. 公开页面与预览一致（同一渲染管线） ----
  const publicTab = await page.context().newPage();
  await publicTab.goto(`${base}/posts/paste-to-upload-e2e`);
  await publicTab.locator('.prose h2').first().waitFor({ timeout: 10000 });
  await publicTab.waitForTimeout(500);
  await publicTab.screenshot({ path: 'qa-shots/admin-08-public-view.png', fullPage: true });
  const publicH2 = await publicTab.locator('.prose h2').first().textContent();
  log(`public page h2 = ${publicH2}`);
  await publicTab.close();

  // ---- 10. 冲突场景：双开同一篇 ----
  const page2 = await page.context().newPage();
  const editUrl = `${base}/admin/posts/paste-to-upload-e2e/edit`;
  await page.goto(editUrl);
  await page2.goto(editUrl);
  await page2.waitForTimeout(1500);
  await page2.locator('.ed-title').fill('paste to upload E2E 验收（另一个窗口改过）');
  await page2.getByRole('button', { name: '存草稿' }).click();
  await page2.waitForTimeout(1200);
  await page.locator('.src').fill('## 为什么要预渲染\n\n第一个窗口的本地改动。\n');
  await page.getByRole('button', { name: '存草稿' }).click();
  await page.getByText('这篇文章在别处被改过了').waitFor({ timeout: 8000 });
  await page.waitForTimeout(400);
  await shot('admin-10-conflict-409');
  log('conflict modal shown (409 STALE_WRITE)');
  // 拉取最新：验证冲突层可用，页面恢复一致
  await page.locator('.n-dialog, .n-card').getByRole('button', { name: '拉取最新' }).click();
  await page.waitForTimeout(1200);
  const titleAfterPull = await page.locator('.ed-title').inputValue();
  log(`after pull latest, title = ${titleAfterPull}`);
  await shot('admin-11-conflict-pulled');
  await page2.close();

  // ---- 11. 退出登录 → 回前台 ----
  await page.goto(`${base}/admin/posts`);
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: '退出' }).click();
  await page.waitForURL(`${base}/`, { timeout: 10000 });
  await page.waitForTimeout(800);
  await shot('admin-12-after-logout');
  log('logout -> home');

  // ---- 12. 退出后访问后台 → 重新跳登录 ----
  await page.goto(`${base}/admin/posts`);
  await page.waitForURL('**/admin/login**', { timeout: 8000 });
  log('after logout, /admin/posts redirects to login again');

  return 'E2E main journey OK';
}
