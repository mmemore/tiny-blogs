/**
 * 集中式环境变量校验。
 *
 * 纪律（AGENTS.md「Secrets and personal data」、票 01 验收项）：
 * - 每个变量只在这里读取一次，其余模块通过 `ENV` 注入令牌拿到校验后的强类型对象。
 * - 必需变量缺失 → 抛 `EnvValidationError`，错误信息里只出现变量名，绝不出现变量值。
 * - 任何 secret 都没有硬编码默认值；占位值（`change-me…`）同样视为未配置。
 * - 校验函数是纯函数（不读 `process.env`、不加载 `.env` 文件），便于单元测试。
 */

/** 运行环境。 */
export type NodeEnv = 'development' | 'test' | 'production';

/** 环境变量校验失败。`problems` 为可直接展示给开发者的逐条问题描述（不含变量值）。 */
export class EnvValidationError extends Error {
  readonly problems: readonly string[];

  /**
   * @param problems 逐条问题描述，例如 `JWT_SECRET 未设置（必需）`。
   */
  constructor(problems: readonly string[]) {
    super(['环境变量校验失败，API 拒绝启动：', ...problems.map((problem) => `  - ${problem}`)].join('\n'));
    this.name = 'EnvValidationError';
    this.problems = problems;
  }
}

/** 数据库连接配置。 */
export interface DatabaseEnv {
  readonly host: string;
  readonly port: number;
  readonly name: string;
  readonly user: string;
  readonly password: string;
}

/** JWT 与 access token 相关配置。 */
export interface JwtEnv {
  readonly secret: string;
  /** access token 有效期，形如 `15m` / `900s` / `1h`。 */
  readonly accessTokenTtl: string;
  /** access token 有效期的秒数（由 `accessTokenTtl` 解析而来，签发时直接用它）。 */
  readonly accessTokenTtlSeconds: number;
  /** refresh token 有效期（天）。 */
  readonly refreshTokenTtlDays: number;
}

/** 鉴权模块配置：JWT + 登录限流。 */
export interface AuthEnv {
  readonly jwt: JwtEnv;
  /** 登录接口同一 IP 在窗口内允许的次数。 */
  readonly loginRateLimit: number;
  /** 登录限流窗口（毫秒）。 */
  readonly loginRateWindowMs: number;
}

/** 种子管理员凭据。口令只用于首次建号，永不写日志。 */
export interface AdminEnv {
  readonly username: string;
  readonly password: string;
}

/** 构建导出链路配置（服务间 token，禁止进入前端产物）。 */
export interface BuildExportEnv {
  readonly token: string;
  readonly url: string;
}

/** 本地图片存储配置。 */
export interface UploadEnv {
  readonly dir: string;
  readonly maxBytes: number;
}

/** 校验后的完整 API 配置。 */
export interface ApiEnv {
  readonly nodeEnv: NodeEnv;
  readonly isProduction: boolean;
  readonly isTest: boolean;
  readonly apiPort: number;
  readonly database: DatabaseEnv;
  readonly auth: AuthEnv;
  readonly admin: AdminEnv;
  readonly buildExport: BuildExportEnv;
  readonly upload: UploadEnv;
}

/** Nest 依赖注入令牌：注入校验后的 `ApiEnv`。 */
export const ENV = Symbol('TINY_BLOGS_API_ENV');

/** 只读的原始环境变量表。 */
export type RawEnvSource = Readonly<Record<string, string | undefined>>;

/** 占位值前缀：`.env.example` 里的 `change-me…`。拦住"直接复制示例就上线"的情形。 */
const PLACEHOLDER_PATTERN = /^change[-_ ]?me/i;

interface StringRule {
  /** 缺失时使用该值；留空表示该变量为必需项。 */
  readonly fallback?: string;
  /** 是否为敏感值：命中占位值时视为未配置。 */
  readonly secret?: boolean;
  readonly pattern?: RegExp;
  /** 校验失败时附带的格式说明。 */
  readonly hint?: string;
  readonly minLength?: number;
}

interface IntRule {
  readonly fallback: number;
  readonly min: number;
  readonly max: number;
}

/**
 * 读取一个字符串变量。
 *
 * @param source 原始环境变量表。
 * @param name 变量名（用于报错文案）。
 * @param rule 校验规则。
 * @param problems 问题收集器。
 * @returns 校验后的值；缺失且无默认值时返回空串（随后必然抛错）。
 */
function readString(source: RawEnvSource, name: string, rule: StringRule, problems: string[]): string {
  const raw = source[name];
  const value = typeof raw === 'string' ? raw.trim() : '';

  if (value === '') {
    if (rule.fallback !== undefined) {
      return rule.fallback;
    }
    problems.push(`${name} 未设置（必需）`);
    return '';
  }

  if (rule.secret === true && PLACEHOLDER_PATTERN.test(value)) {
    // 占位值直接判死，不再叠加"长度不足"这类次要提示，报错要能一眼指向动作。
    problems.push(`${name} 仍是占位值，请填入真实随机值（生成方式见 .env.example 注释）`);
    return value;
  }
  if (rule.minLength !== undefined && value.length < rule.minLength) {
    problems.push(`${name} 长度不足 ${rule.minLength} 个字符`);
  }
  if (rule.pattern !== undefined && !rule.pattern.test(value)) {
    problems.push(`${name} 格式不合法${rule.hint === undefined ? '' : `（${rule.hint}）`}`);
  }

  return value;
}

/**
 * 读取一个整数变量。
 *
 * @param source 原始环境变量表。
 * @param name 变量名。
 * @param rule 默认值与取值范围。
 * @param problems 问题收集器。
 * @returns 校验后的整数；非法时返回默认值（随后必然抛错）。
 */
function readInt(source: RawEnvSource, name: string, rule: IntRule, problems: string[]): number {
  const raw = source[name];
  const value = typeof raw === 'string' ? raw.trim() : '';

  if (value === '') {
    return rule.fallback;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    problems.push(`${name} 必须是整数`);
    return rule.fallback;
  }
  if (parsed < rule.min || parsed > rule.max) {
    problems.push(`${name} 必须在 ${rule.min}..${rule.max} 之间`);
    return rule.fallback;
  }

  return parsed;
}

/**
 * 把 `ACCESS_TOKEN_TTL` 这类时长字符串解析成秒数。
 *
 * @param ttl 形如 `15m` / `900s` / `1h` / `2d` 的时长串（格式已由 `readString` 校验）。
 * @returns 秒数；格式异常时返回 0（调用方此时已经在校验问题列表里）。
 */
function parseTtlSeconds(ttl: string): number {
  const matched = /^(\d+)([smhd])$/.exec(ttl);
  if (matched === null) {
    return 0;
  }
  const amount = Number(matched[1]);
  const unit = matched[2];
  const multiplier = unit === 's' ? 1 : unit === 'm' ? 60 : unit === 'h' ? 3600 : 86_400;
  return amount * multiplier;
}

/**
 * 校验并组装 API 配置。
 *
 * @param source 原始环境变量表，默认 `process.env`。
 * @returns 冻结的强类型配置对象。
 * @throws {EnvValidationError} 任一必需变量缺失或格式不合法时抛出，`problems` 列出全部问题。
 */
export function readApiEnv(source: RawEnvSource = process.env): ApiEnv {
  const problems: string[] = [];

  const nodeEnv = readString(source, 'NODE_ENV', {
    fallback: 'development',
    pattern: /^(development|test|production)$/,
    hint: 'development | test | production',
  }, problems) as NodeEnv;

  const apiPort = readInt(source, 'API_PORT', { fallback: 3000, min: 1, max: 65535 }, problems);

  const database: DatabaseEnv = {
    host: readString(source, 'DB_HOST', { fallback: '127.0.0.1' }, problems),
    port: readInt(source, 'DB_PORT', { fallback: 3306, min: 1, max: 65535 }, problems),
    name: readString(source, 'DB_NAME', {}, problems),
    user: readString(source, 'DB_USER', {}, problems),
    password: readString(source, 'DB_PASSWORD', { secret: true }, problems),
  };

  const accessTokenTtl = readString(source, 'ACCESS_TOKEN_TTL', {
    fallback: '15m',
    pattern: /^\d+[smhd]$/,
    hint: '例如 15m、900s、1h',
  }, problems);

  const jwt: JwtEnv = {
    secret: readString(source, 'JWT_SECRET', { secret: true, minLength: 32 }, problems),
    accessTokenTtl,
    accessTokenTtlSeconds: parseTtlSeconds(accessTokenTtl),
    refreshTokenTtlDays: readInt(source, 'REFRESH_TOKEN_TTL_DAYS', { fallback: 30, min: 1, max: 365 }, problems),
  };

  // 登录限流窗口可调：生产用 5 次/分钟，测试里调高以免互相污染（见 ticket 03）。
  const auth: AuthEnv = {
    jwt,
    loginRateLimit: readInt(source, 'AUTH_LOGIN_RATE_LIMIT', { fallback: 5, min: 1, max: 100_000 }, problems),
    loginRateWindowMs: readInt(
      source,
      'AUTH_LOGIN_RATE_WINDOW_MS',
      { fallback: 60_000, min: 1_000, max: 3_600_000 },
      problems,
    ),
  };

  const admin: AdminEnv = {
    username: readString(source, 'ADMIN_USERNAME', {
      fallback: 'admin',
      pattern: /^[A-Za-z0-9_-]{3,32}$/,
      hint: '3–32 位字母、数字、下划线或连字符',
    }, problems),
    password: readString(source, 'ADMIN_PASSWORD', { secret: true, minLength: 12 }, problems),
  };

  const buildExport: BuildExportEnv = {
    token: readString(source, 'BUILD_EXPORT_TOKEN', { secret: true, minLength: 32 }, problems),
    url: readString(source, 'BUILD_EXPORT_URL', { fallback: `http://127.0.0.1:${apiPort}/api/build/export` }, problems),
  };

  const upload: UploadEnv = {
    dir: readString(source, 'UPLOAD_DIR', { fallback: './var/uploads' }, problems),
    maxBytes: readInt(source, 'UPLOAD_MAX_BYTES', { fallback: 5_242_880, min: 1024, max: 52_428_800 }, problems),
  };

  if (problems.length > 0) {
    throw new EnvValidationError(problems);
  }

  return Object.freeze({
    nodeEnv,
    isProduction: nodeEnv === 'production',
    isTest: nodeEnv === 'test',
    apiPort,
    database: Object.freeze(database),
    auth: Object.freeze(auth),
    admin: Object.freeze(admin),
    buildExport: Object.freeze(buildExport),
    upload: Object.freeze(upload),
  });
}
