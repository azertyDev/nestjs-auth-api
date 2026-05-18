import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { AccessTokenPayload } from '../types/jwt-payload.type';
import type { Env } from '../../config/env.schema';

@Injectable()
export class JwtAccessStrategy extends PassportStrategy(Strategy, 'jwt-access') {
  constructor(config: ConfigService<Env, true>) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get('JWT_ACCESS_SECRET', { infer: true }),
      issuer: config.get('JWT_ISSUER', { infer: true }),
      audience: config.get('JWT_AUDIENCE', { infer: true }),
      jsonWebTokenOptions: {
        algorithms: ['HS256'],
        clockTolerance: config.get('JWT_CLOCK_TOLERANCE_SEC', { infer: true }),
      },
    });
  }

  validate(payload: AccessTokenPayload): AccessTokenPayload {
    if (!payload?.sub || !payload?.jti) {
      throw new UnauthorizedException();
    }
    return payload;
  }
}
