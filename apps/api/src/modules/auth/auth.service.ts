import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import type { Principal } from '@tiny-blogs/shared';
import { ApiError } from '../../common/errors/api-error';
import { verifyPassword } from '../../common/password';
import { ENV, type ApiEnv } from '../../config/env';
import { RefreshTokenEntity } from './entities/refresh-token.entity';
import { UserEntity } from './entities/user.entity';
import { DAY_MS, DUMMY_PASSWORD_HASH, generateRefreshToken, hashRefreshToken } from './tokens';

/** access token 的载荷（契约 §4.4：`sub` / `userId` / `ver`）。 */
export interface AccessTokenPayload {
  readonly sub: number;
  readonly userId: number;
  /** 签发时的 `users.token_version`；与库里不一致即视为被强制下线。 */
  readonly ver: number;
}

/** 一次成功签发的结果。`refreshToken` 原文只用于写 cookie，不入库、不入日志。 */
export interface IssuedTokens {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly refreshExpiresAt: Date;
}

/**
 * 鉴权的全部不变量都在这个服务里（契约 §4.4）：
 * - 登录失败不区分"用户名不存在"与"口令错误"，且两条路径耗时相近；
 * - refresh 轮换：旧行作废 + 新行插入，被作废的 token 再次出现即判定重放，
 *   重放会撤销该用户全部会话并 `token_version++`；
 * - access 的 `ver` 与 `users.token_version` 不一致一律 401。
 */
@Injectable()
export class AuthService {
  constructor(
    @Inject(ENV) private readonly env: ApiEnv,
    @InjectRepository(UserEntity) private readonly users: Repository<UserEntity>,
    @InjectRepository(RefreshTokenEntity) private readonly refreshTokens: Repository<RefreshTokenEntity>,
    private readonly jwt: JwtService,
  ) {}

  /**
   * 用户名 + 口令登录。
   *
   * @param username 登录名。
   * @param password 明文口令。
   * @returns 新签发的 access/refresh。
   * @throws {ApiError} 凭证错误时抛 401 `INVALID_CREDENTIALS`（两种情况同一错误码）。
   */
  async login(username: string, password: string): Promise<IssuedTokens> {
    const user = await this.users.findOne({ where: { username } });

    if (user === null) {
      // 等时假校验：让"账号不存在"与"口令错误"在时间上不可区分。
      await verifyPassword(DUMMY_PASSWORD_HASH, password);
      throw invalidCredentials();
    }

    const matched = await verifyPassword(user.passwordHash, password);
    if (!matched) {
      throw invalidCredentials();
    }

    return this.issueTokens(user);
  }

  /**
   * 用 refresh token 换取新的 access（并轮换 refresh）。
   *
   * @param rawRefresh cookie 里的刷新令牌原文。
   * @returns 新的 access/refresh。
   * @throws {ApiError} 缺失/不存在/过期 → 401 `REFRESH_INVALID`；重放 → 401 `REFRESH_REPLAYED`。
   */
  async refresh(rawRefresh: string | null): Promise<IssuedTokens> {
    if (rawRefresh === null || rawRefresh === '') {
      throw refreshInvalid();
    }

    const tokenHash = hashRefreshToken(rawRefresh);
    const stored = await this.refreshTokens.findOne({ where: { tokenHash } });
    if (stored === null) {
      throw refreshInvalid();
    }

    const user = await this.users.findOne({ where: { id: stored.userId } });
    if (user === null) {
      throw refreshInvalid();
    }

    if (stored.revokedAt !== null) {
      // 已被轮换过的 token 再次出现 = 泄漏。撤销该用户全部会话并让所有 access 失效。
      await this.revokeAllSessions(user);
      throw refreshReplayed();
    }

    if (stored.expiresAt.getTime() <= Date.now()) {
      throw refreshInvalid();
    }

    // 轮换：只有 revoked_at 仍为空的那一行才会被更新，抢跑的一方按重放处理。
    const rotation = await this.refreshTokens.update(
      { id: stored.id, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
    if (rotation.affected !== 1) {
      await this.revokeAllSessions(user);
      throw refreshReplayed();
    }

    return this.issueTokens(user);
  }

  /**
   * 注销：撤销当前 refresh。幂等——没有 cookie 或 token 已作废都不报错。
   *
   * @param rawRefresh cookie 里的刷新令牌原文（可为 null）。
   */
  async logout(rawRefresh: string | null): Promise<void> {
    if (rawRefresh === null || rawRefresh === '') {
      return;
    }
    await this.refreshTokens.update(
      { tokenHash: hashRefreshToken(rawRefresh), revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }

  /**
   * 校验 access token 并取出当前操作者。
   *
   * @param accessToken Bearer token 原文。
   * @returns 当前操作者。
   * @throws {ApiError} 签名/过期/账号不存在/`ver` 不匹配 → 401 `UNAUTHORIZED`。
   */
  async verify(accessToken: string): Promise<Principal> {
    let payload: AccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(accessToken);
    } catch {
      throw ApiError.unauthorized('access token 无效或已过期');
    }

    const userId = Number(payload.userId ?? payload.sub);
    if (!Number.isInteger(userId)) {
      throw ApiError.unauthorized('access token 载荷无效');
    }

    const user = await this.users.findOne({ where: { id: userId } });
    if (user === null) {
      throw ApiError.unauthorized('账号不存在');
    }
    if (payload.ver !== user.tokenVersion) {
      throw ApiError.unauthorized('会话已失效，请重新登录');
    }

    return { id: user.id, username: user.username };
  }

  /**
   * 签发一对 token，并把 refresh 的指纹写库。
   *
   * @param user 目标账号。
   * @returns 签发结果。
   */
  private async issueTokens(user: UserEntity): Promise<IssuedTokens> {
    const refreshToken = generateRefreshToken();
    const refreshExpiresAt = new Date(Date.now() + this.env.auth.jwt.refreshTokenTtlDays * DAY_MS);

    await this.refreshTokens.insert({
      userId: user.id,
      tokenHash: hashRefreshToken(refreshToken),
      expiresAt: refreshExpiresAt,
      revokedAt: null,
    });

    const accessToken = await this.jwt.signAsync(
      { sub: user.id, userId: user.id, ver: user.tokenVersion } satisfies AccessTokenPayload,
      { expiresIn: this.env.auth.jwt.accessTokenTtlSeconds },
    );

    return { accessToken, refreshToken, refreshExpiresAt };
  }

  /**
   * 撤销某账号的全部会话：未撤销的 refresh 全部作废，并令 `token_version` 自增。
   *
   * @param user 目标账号。
   */
  private async revokeAllSessions(user: UserEntity): Promise<void> {
    await this.refreshTokens.update({ userId: user.id, revokedAt: IsNull() }, { revokedAt: new Date() });
    await this.users.increment({ id: user.id }, 'tokenVersion', 1);
  }
}

/**
 * @returns 登录失败的统一异常（不泄漏账号是否存在）。
 */
function invalidCredentials(): ApiError {
  return new ApiError('INVALID_CREDENTIALS', '用户名或口令不正确', HttpStatus.UNAUTHORIZED);
}

/**
 * @returns refresh 缺失/无效的异常。
 */
function refreshInvalid(): ApiError {
  return new ApiError('REFRESH_INVALID', 'refresh token 无效或已过期', HttpStatus.UNAUTHORIZED);
}

/**
 * @returns 检测到重放时的异常。
 */
function refreshReplayed(): ApiError {
  return new ApiError(
    'REFRESH_REPLAYED',
    'refresh token 已被使用过，为安全起见已下线该账号的全部会话',
    HttpStatus.UNAUTHORIZED,
  );
}
