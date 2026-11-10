import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import type { MeResponse, Principal, TokenResponse } from '@tiny-blogs/shared';
import { readCookie } from '../../common/cookies';
import { ENV, type ApiEnv } from '../../config/env';
import { AuthService } from './auth.service';
import { CurrentPrincipal } from './decorators/current-principal.decorator';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { REFRESH_COOKIE_NAME, refreshCookieClearOptions, refreshCookieOptions } from './tokens';

/**
 * 鉴权接口（契约 §5）。
 *
 * refresh token 只走 httpOnly cookie（`Path=/api/auth`），响应体里永远只有 access token，
 * 因此前端把 access 放内存即可，XSS 拿不到长期凭证。
 */
@Controller('auth')
export class AuthController {
  constructor(
    @Inject(ENV) private readonly env: ApiEnv,
    private readonly auth: AuthService,
  ) {}

  /**
   * 登录。同一 IP 在窗口内超过 `AUTH_LOGIN_RATE_LIMIT` 次即 429。
   *
   * @param dto 登录名 + 口令。
   * @param response 用于写 refresh cookie。
   * @returns 仅含 access token。
   */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ThrottlerGuard)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<TokenResponse> {
    const issued = await this.auth.login(dto.username, dto.password);
    response.cookie(REFRESH_COOKIE_NAME, issued.refreshToken, refreshCookieOptions(this.env));
    return { accessToken: issued.accessToken };
  }

  /**
   * 用 cookie 里的 refresh 换新 access，并轮换 refresh。
   *
   * @param request 读取 cookie。
   * @param response 写新 cookie。
   * @returns 仅含 access token。
   */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<TokenResponse> {
    const rawRefresh = readCookie(request.headers.cookie, REFRESH_COOKIE_NAME);
    const issued = await this.auth.refresh(rawRefresh);
    response.cookie(REFRESH_COOKIE_NAME, issued.refreshToken, refreshCookieOptions(this.env));
    return { accessToken: issued.accessToken };
  }

  /**
   * 注销：撤销当前 refresh 并清 cookie。幂等（没有 cookie 也返回 204）。
   *
   * @param request 读取 cookie。
   * @param response 清 cookie。
   */
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.auth.logout(readCookie(request.headers.cookie, REFRESH_COOKIE_NAME));
    response.clearCookie(REFRESH_COOKIE_NAME, refreshCookieClearOptions(this.env));
  }

  /**
   * 当前登录者。
   *
   * @param principal 由 guard 注入。
   * @returns `{ id, username }`。
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentPrincipal() principal: Principal): MeResponse {
    return principal;
  }
}
