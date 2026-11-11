/**
 * 安全断言（票 09）：
 * 1. refresh cookie 的 httpOnly / SameSite=Strict / Path=/api/auth（看登录响应头，值不回显）；
 * 2. 6 MB 上传 → 422 FILE_TOO_LARGE；
 * 3. 伪装 .exe → 422 UNSUPPORTED_MEDIA_TYPE；
 * 4. /uploads 路径穿越 → 4xx，且不吐 .env 内容。
 * 凭据从 .env 读取，只打印断言结果。
 */
const fs = require('fs');

const BASE = 'http://127.0.0.1:3000';

function readEnv(key) {
  const line = fs.readFileSync('.env', 'utf8').split(/\r?\n/).find((l) => l.startsWith(`${key}=`));
  if (!line) {
    throw new Error(`missing ${key}`);
  }
  return line.slice(key.length + 1).trim().replace(/^"|"$/g, '');
}

async function main() {
  const username = readEnv('ADMIN_USERNAME');
  const password = readEnv('ADMIN_PASSWORD');

  // 1. refresh cookie 属性
  const login = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!login.ok) {
    throw new Error(`登录失败：${String(login.status)}`);
  }
  const setCookies = login.headers.getSetCookie();
  const refreshCookie = setCookies.find((c) => c.startsWith('refresh_token='));
  if (refreshCookie === undefined) {
    throw new Error('登录响应里没有 refresh_token cookie');
  }
  const attrs = refreshCookie.split(';').map((part) => part.trim().toLowerCase());
  const has = (name) => attrs.includes(name) || attrs.some((a) => a.startsWith(`${name}=`));
  const value = attrs.find((a) => a.startsWith('refresh_token=')) ?? '';
  const get = (name) => attrs.find((a) => a.startsWith(`${name}=`))?.split('=')[1] ?? '';
  const cookieCheck = {
    httpOnly: has('httponly'),
    sameSite: get('samesite'),
    path: get('path'),
    valueNotInDocumentCookie: true,
  };
  console.log('[cookie] httpOnly:', cookieCheck.httpOnly, '| SameSite:', cookieCheck.sameSite, '| Path:', cookieCheck.path);
  if (!cookieCheck.httpOnly || cookieCheck.sameSite !== 'strict' || cookieCheck.path !== '/api/auth') {
    throw new Error('refresh cookie 属性不符合 ADR-0003');
  }
  console.log('[cookie] cookie 值长度（仅长度，不回显）:', value.length);

  const { accessToken } = await login.json();
  const auth = { authorization: `Bearer ${accessToken}` };

  // 2. 6 MB → 422 FILE_TOO_LARGE
  const huge = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(6 * 1024 * 1024),
  ]);
  // 必须走真正的 multipart：multer 的 fileSize 限额在解析 multipart 时生效。
  const hugeForm = new FormData();
  hugeForm.append('file', new Blob([huge], { type: 'image/png' }), 'huge.png');
  const hugeRes = await fetch(`${BASE}/api/admin/upload`, {
    method: 'POST',
    headers: auth,
    body: hugeForm,
  });
  const hugeBody = await hugeRes.json();
  console.log('[6MB] status:', hugeRes.status, '| code:', hugeBody.error?.code);
  if (hugeRes.status !== 422 || hugeBody.error?.code !== 'FILE_TOO_LARGE') {
    throw new Error('6MB 未按预期返回 422 FILE_TOO_LARGE');
  }

  // 3. 伪装 .exe → 422 UNSUPPORTED_MEDIA_TYPE
  const exe = Buffer.from('MZ\x90\x00\x03\x00\x00\x00not-an-image', 'latin1');
  const exeForm = new FormData();
  exeForm.append('file', new Blob([exe], { type: 'image/png' }), 'evil.exe.png');
  const exeRes = await fetch(`${BASE}/api/admin/upload`, {
    method: 'POST',
    headers: auth,
    body: exeForm,
  });
  const exeBody = await exeRes.json();
  console.log('[.exe] status:', exeRes.status, '| code:', exeBody.error?.code);
  if (exeRes.status !== 422 || exeBody.error?.code !== 'UNSUPPORTED_MEDIA_TYPE') {
    throw new Error('.exe 未按预期返回 422 UNSUPPORTED_MEDIA_TYPE');
  }

  // 4. 路径穿越
  const attempts = ['/uploads/../../.env', '/uploads/%2e%2e%2f%2e%2e%2f.env', '/uploads/.env'];
  for (const path of attempts) {
    const res = await fetch(`${BASE}${path}`);
    const text = await res.text();
    console.log(`[traversal] ${path} -> ${String(res.status)}（含 DB_PASSWORD: ${text.includes('DB_PASSWORD')}）`);
    if (res.status < 400 || text.includes('DB_PASSWORD') || text.includes('JWT_SECRET')) {
      throw new Error(`路径穿越未拦住：${path}`);
    }
  }

  console.log('SECURITY ASSERTIONS: ALL PASS');
}

main().catch((error) => {
  console.error('SECURITY ASSERTIONS FAILED:', error.message);
  process.exit(1);
});
