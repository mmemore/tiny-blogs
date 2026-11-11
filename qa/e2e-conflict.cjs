// 冲突场景补拍：409 STALE_WRITE 弹层（视口截图，不 fullPage——fixed 弹层在整页拼接里会丢）。
async page => {
  const base = 'http://127.0.0.1:5173';
  await page.goto(base + '/__qa-credentials.json');
  const creds = JSON.parse(await page.evaluate(() => document.body.innerText));

  await page.goto(base + '/admin/login');
  await page.waitForTimeout(600);
  await page.getByPlaceholder('store manager').fill(creds.username);
  await page.locator('input[type="password"]').fill(creds.password);
  await page.getByRole('button', { name: '进入后台' }).click();
  await page.waitForURL('**/admin/posts', { timeout: 10000 });

  const editUrl = base + '/admin/posts/paste-to-upload-e2e/edit';
  const page2 = await page.context().newPage();
  await page.goto(editUrl);
  await page2.goto(editUrl);
  await page.waitForTimeout(1500);
  await page2.locator('.ed-title').fill('paste to upload E2E 验收（另一窗口又改过）');
  await page2.getByRole('button', { name: '存草稿' }).click();
  await page2.waitForTimeout(1500);
  await page.locator('.src').fill('## 为什么要预渲染\n\n第二个窗口的本地改动。\n');
  await page.getByRole('button', { name: '存草稿' }).click();
  await page.getByText('这篇文章在别处被改过了').waitFor({ timeout: 8000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'qa-shots/admin-10-conflict-409.png' });

  // 收尾：拉取最新，恢复一致，关掉第二个页面
  await page.locator('.n-card').getByRole('button', { name: '拉取最新' }).click();
  await page.waitForTimeout(1200);
  await page2.close();
  return 'conflict shot retaken';
}
