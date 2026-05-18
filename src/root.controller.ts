import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from './auth/decorators/public.decorator';
import type { Env } from './config/env.schema';

@ApiExcludeController()
@Controller()
export class RootController {
  constructor(private readonly config: ConfigService<Env, true>) {}

  @Public()
  @Get()
  redirect(@Res() res: Response): void {
    const target = this.config.get('ENABLE_SWAGGER', { infer: true }) ? '/api/docs' : '/health';
    res.redirect(302, target);
  }
}
