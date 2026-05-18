import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AccessTokenPayload, RefreshTokenPayload } from '../types/jwt-payload.type';

type AuthedRequest = Request & {
  user: AccessTokenPayload | (RefreshTokenPayload & { raw: string });
};

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const req = ctx.switchToHttp().getRequest<AuthedRequest>();
  return req.user;
});
