import { IsString, MaxLength, MinLength } from 'class-validator';

/** 登录入参。 */
export class LoginDto {
  @IsString({ message: 'username 必须是字符串' })
  @MinLength(1, { message: 'username 不能为空' })
  @MaxLength(32, { message: 'username 不能超过 32 个字符' })
  username!: string;

  @IsString({ message: 'password 必须是字符串' })
  @MinLength(1, { message: 'password 不能为空' })
  @MaxLength(200, { message: 'password 不能超过 200 个字符' })
  password!: string;
}
