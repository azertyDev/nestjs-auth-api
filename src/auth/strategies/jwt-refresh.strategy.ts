import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Request } from 'express';
import { Strategy } from 'passport-jwt';
import type { RefreshTokenPayload } from '../types/jwt-payload.type';
import type { Env } from '../../config/env.schema';

const refreshExtractor = (req: Request): string | null => {
  if (req?.body && typeof req.body === 'object' && 'refreshToken' in req.body) {
    const v = (req.body as Record<string, unknown>).refreshToken;
    return typeof v === 'string' ? v : null;
  }
  return null;
};

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
  constructor(config: ConfigService<Env, true>) {
    super({
      jwtFromRequest: refreshExtractor,
      ignoreExpiration: false,
      secretOrKey: config.get('JWT_REFRESH_SECRET', { infer: true }),
      issuer: config.get('JWT_ISSUER', { infer: true }),
      audience: config.get('JWT_AUDIENCE', { infer: true }),
      passReqToCallback: true,
      jsonWebTokenOptions: {
        algorithms: ['HS256'],
        clockTolerance: config.get('JWT_CLOCK_TOLERANCE_SEC', { infer: true }),
      },
    });
  }

  validate(req: Request, payload: RefreshTokenPayload): RefreshTokenPayload & { raw: string } {
    if (!payload?.sub || !payload?.jti || !payload?.family) {
      throw new UnauthorizedException();
    }
    const raw = refreshExtractor(req);
    if (!raw) throw new UnauthorizedException();
    return { ...payload, raw };
  }
}
