import { Injectable, OnModuleDestroy, OnModuleInit, Logger } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient<{
    log: Array<Prisma.LogDefinition>;
  }>
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: [
        { emit: 'event', level: 'error' },
        { emit: 'event', level: 'warn' },
      ],
    });
  }

  async onModuleInit(): Promise<void> {
    (this as unknown as { $on: (e: string, cb: (ev: { message: string }) => void) => void }).$on(
      'error',
      (e) => this.logger.error({ event: 'prisma.error', message: e.message }),
    );
    (this as unknown as { $on: (e: string, cb: (ev: { message: string }) => void) => void }).$on(
      'warn',
      (e) => this.logger.warn({ event: 'prisma.warn', message: e.message }),
    );
    await this.$connect();
    this.logger.log('Prisma connected');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
