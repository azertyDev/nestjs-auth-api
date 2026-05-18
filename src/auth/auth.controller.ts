import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { RegisterDto } from './dto/register.dto';
import { TokenResponseDto } from './dto/token-response.dto';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { JwtAccessGuard } from './guards/jwt-access.guard';
import { JwtRefreshGuard } from './guards/jwt-refresh.guard';
import type {
  AccessTokenPayload,
  RefreshTokenPayload,
  RequestMeta,
} from './types/jwt-payload.type';
import { UsersService } from '../users/users.service';
import { PublicUserDto, toPublicUser } from '../users/dto/public-user.dto';

const extractMeta = (req: Request): RequestMeta => ({
  ip: req.ip,
  userAgent: req.headers['user-agent']?.toString().slice(0, 256),
});

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly users: UsersService,
  ) {}

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Register new user' })
  register(@Body() dto: RegisterDto, @Req() req: Request): Promise<TokenResponseDto> {
    return this.auth.register(dto.email, dto.password, extractMeta(req));
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Login with credentials' })
  login(@Body() dto: LoginDto, @Req() req: Request): Promise<TokenResponseDto> {
    return this.auth.login(dto.email, dto.password, extractMeta(req));
  }

  @Public()
  @UseGuards(JwtRefreshGuard)
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Rotate refresh token' })
  refresh(
    @Body() _dto: RefreshDto,
    @CurrentUser() payload: RefreshTokenPayload & { raw: string },
    @Req() req: Request,
  ): Promise<TokenResponseDto> {
    return this.auth.refresh(payload.raw, extractMeta(req));
  }

  @ApiBearerAuth()
  @UseGuards(JwtAccessGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Logout current session' })
  async logout(@Body() dto: RefreshDto, @CurrentUser() current: AccessTokenPayload): Promise<void> {
    await this.auth.logout(current.sub, dto.refreshToken);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAccessGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('logout-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Logout all sessions' })
  async logoutAll(@CurrentUser() current: AccessTokenPayload): Promise<void> {
    await this.auth.logoutAll(current.sub);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAccessGuard)
  @Get('me')
  @ApiOperation({ summary: 'Current user' })
  async me(@CurrentUser() current: AccessTokenPayload): Promise<PublicUserDto> {
    const user = await this.users.findById(current.sub);
    return toPublicUser(user);
  }
}
