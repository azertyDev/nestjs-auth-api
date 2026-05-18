import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import request from 'supertest';
import { randomUUID } from 'crypto';
import * as argon2 from 'argon2';
import { Role } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

interface MemUser {
  id: string;
  email: string;
  passwordHash: string;
  role: Role;
  createdAt: Date;
  updatedAt: Date;
}

interface MemRefresh {
  id: string;
  userId: string;
  tokenHash: string;
  family: string;
  expiresAt: Date;
  revokedAt: Date | null;
  replacedBy: string | null;
  userAgent: string | null;
  ip: string | null;
  createdAt: Date;
}

interface MemUserWhere {
  email?: {
    contains?: string;
    mode?: 'insensitive';
  };
}

interface MemUserFindManyArgs {
  where?: MemUserWhere;
  skip?: number;
  take?: number;
  orderBy?: {
    createdAt?: 'asc' | 'desc';
  };
}

type MemPublicUser = Pick<MemUser, 'id' | 'email' | 'role' | 'createdAt' | 'updatedAt'>;

const toMemPublicUser = (user: MemUser): MemPublicUser => ({
  id: user.id,
  email: user.email,
  role: user.role,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

class FakePrisma {
  private users: MemUser[] = [];
  private tokens: MemRefresh[] = [];

  user = {
    create: async ({
      data,
    }: {
      data: Omit<MemUser, 'id' | 'createdAt' | 'updatedAt'> & Partial<MemUser>;
    }) => {
      if (this.users.some((u) => u.email === data.email)) {
        const err = new Error('Unique constraint failed');
        (err as Error & { code?: string }).code = 'P2002';
        Object.setPrototypeOf(
          err,
          (await import('@prisma/client')).Prisma.PrismaClientKnownRequestError.prototype,
        );
        throw err;
      }
      const u: MemUser = {
        id: data.id ?? randomUUID(),
        email: data.email,
        passwordHash: data.passwordHash,
        role: data.role ?? Role.USER,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.users.push(u);
      return u;
    },
    findUnique: async ({ where }: { where: { email?: string; id?: string } }) =>
      this.users.find(
        (u) => (where.email && u.email === where.email) || (where.id && u.id === where.id),
      ) ?? null,
    count: async ({ where }: { where?: MemUserWhere } = {}) =>
      this.users.filter((u) => this.matchesUser(u, where)).length,
    findMany: async ({ where, skip = 0, take, orderBy }: MemUserFindManyArgs = {}): Promise<
      MemPublicUser[]
    > => {
      const direction = orderBy?.createdAt ?? 'asc';
      const sorted = this.users
        .filter((u) => this.matchesUser(u, where))
        .sort((a, b) =>
          direction === 'asc'
            ? a.createdAt.getTime() - b.createdAt.getTime()
            : b.createdAt.getTime() - a.createdAt.getTime(),
        );
      return sorted.slice(skip, take === undefined ? undefined : skip + take).map(toMemPublicUser);
    },
  };

  refreshToken = {
    create: async ({
      data,
    }: {
      data: Omit<MemRefresh, 'createdAt' | 'revokedAt' | 'replacedBy' | 'userAgent' | 'ip'> &
        Partial<MemRefresh>;
    }) => {
      const t: MemRefresh = {
        id: data.id ?? randomUUID(),
        userId: data.userId,
        tokenHash: data.tokenHash,
        family: data.family,
        expiresAt: data.expiresAt,
        revokedAt: null,
        replacedBy: null,
        userAgent: data.userAgent ?? null,
        ip: data.ip ?? null,
        createdAt: new Date(),
      };
      this.tokens.push(t);
      return t;
    },
    findUnique: async ({ where }: { where: { tokenHash: string } }) =>
      this.tokens.find((t) => t.tokenHash === where.tokenHash) ?? null,
    update: async ({ where, data }: { where: { id: string }; data: Partial<MemRefresh> }) => {
      const idx = this.tokens.findIndex((t) => t.id === where.id);
      if (idx < 0) throw new Error('not found');
      this.tokens[idx] = { ...this.tokens[idx], ...data };
      return this.tokens[idx];
    },
    updateMany: async ({
      where,
      data,
    }: {
      where: Partial<MemRefresh>;
      data: Partial<MemRefresh>;
    }) => {
      let count = 0;
      this.tokens = this.tokens.map((t) => {
        const match = Object.entries(where).every(([k, v]) => {
          if (k === 'revokedAt' && v === null) return t.revokedAt === null;
          return (t as unknown as Record<string, unknown>)[k] === v;
        });
        if (match) {
          count += 1;
          return { ...t, ...data };
        }
        return t;
      });
      return { count };
    },
  };

  $transaction = async (
    arg: Promise<unknown>[] | ((tx: FakePrisma) => Promise<unknown>),
  ): Promise<unknown> => (Array.isArray(arg) ? Promise.all(arg) : arg(this));
  $connect = async () => undefined;
  $disconnect = async () => undefined;
  $queryRaw = async () => [1];
  $on = (): void => undefined;

  private matchesUser(user: MemUser, where?: MemUserWhere): boolean {
    const contains = where?.email?.contains;
    if (!contains) {
      return true;
    }

    if (where?.email?.mode === 'insensitive') {
      return user.email.toLowerCase().includes(contains.toLowerCase());
    }

    return user.email.includes(contains);
  }
}

const ENV = {
  NODE_ENV: 'test',
  PORT: '0',
  DATABASE_URL: 'postgresql://u:p@localhost:5432/t',
  JWT_ACCESS_SECRET: 'a'.repeat(48),
  JWT_REFRESH_SECRET: 'b'.repeat(48),
  JWT_ACCESS_TTL: '15m',
  JWT_REFRESH_TTL: '7d',
  THROTTLE_TTL: '60',
  THROTTLE_LIMIT: '10000',
  CORS_ORIGINS: 'http://localhost:3000',
  ENABLE_SWAGGER: 'false',
  LOG_LEVEL: 'fatal',
};

const ADMIN_EMAIL = 'admin@example.com';
const ADMIN_PASSWORD = 'AdminP@ss1';

describe('Auth flow (e2e)', () => {
  let app: INestApplication;
  let fakePrisma: FakePrisma;
  const requestApp = () => request(app.getHttpServer());

  beforeAll(async () => {
    Object.assign(process.env, ENV);
    fakePrisma = new FakePrisma();
    await fakePrisma.user.create({
      data: {
        email: ADMIN_EMAIL,
        passwordHash: await argon2.hash(ADMIN_PASSWORD),
        role: Role.ADMIN,
      },
    });

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(fakePrisma)
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  let accessToken = '';
  let refreshToken = '';
  let oldRefresh = '';

  it('POST /auth/register issues tokens', async () => {
    const res = await requestApp()
      .post('/auth/register')
      .send({ email: 'alice@example.com', password: 'StrongP@ss1' })
      .expect(201);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.refreshToken).toBeTruthy();
    accessToken = res.body.accessToken;
    refreshToken = res.body.refreshToken;
  });

  it('POST /auth/register rejects duplicate', async () => {
    await requestApp()
      .post('/auth/register')
      .send({ email: 'alice@example.com', password: 'StrongP@ss1' })
      .expect(409);
  });

  it('POST /auth/login returns tokens', async () => {
    const res = await requestApp()
      .post('/auth/login')
      .send({ email: 'alice@example.com', password: 'StrongP@ss1' })
      .expect(200);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.refreshToken).toBeTruthy();
  });

  it('POST /auth/login rejects wrong password (no enumeration)', async () => {
    await requestApp()
      .post('/auth/login')
      .send({ email: 'alice@example.com', password: 'WrongP@ss9' })
      .expect(401);
    await requestApp()
      .post('/auth/login')
      .send({ email: 'no-such@example.com', password: 'WhateverP@1' })
      .expect(401);
  });

  it('GET /auth/me with access token', async () => {
    const res = await requestApp()
      .get('/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(res.body.email).toBe('alice@example.com');
  });

  it('GET /auth/me without token → 401', async () => {
    await requestApp().get('/auth/me').expect(401);
  });

  it('GET /users returns paginated users for admin', async () => {
    const loginRes = await requestApp()
      .post('/auth/login')
      .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
      .expect(200);

    const res = await requestApp()
      .get('/users')
      .query({ page: 1, limit: 10, search: 'alice' })
      .set('Authorization', `Bearer ${loginRes.body.accessToken}`)
      .expect(200);

    expect(res.body).toMatchObject({
      total: 1,
      page: 1,
      limit: 10,
      totalPages: 1,
    });
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({ email: 'alice@example.com', role: Role.USER });
    expect(res.body.data[0]).not.toHaveProperty('passwordHash');
  });

  it('GET /users rejects regular users', async () => {
    await requestApp().get('/users').set('Authorization', `Bearer ${accessToken}`).expect(403);
  });

  it('POST /auth/refresh rotates tokens', async () => {
    oldRefresh = refreshToken;
    const res = await requestApp().post('/auth/refresh').send({ refreshToken }).expect(200);
    expect(res.body.refreshToken).not.toBe(oldRefresh);
    refreshToken = res.body.refreshToken;
    accessToken = res.body.accessToken;
  });

  it('reuse of old refresh token revokes entire family', async () => {
    await requestApp().post('/auth/refresh').send({ refreshToken: oldRefresh }).expect(403);

    // Even the now-rotated refresh should be invalidated after family revoke
    await requestApp().post('/auth/refresh').send({ refreshToken }).expect(403);
  });

  it('POST /auth/register: validation rejects weak password', async () => {
    await requestApp()
      .post('/auth/register')
      .send({ email: 'bob@example.com', password: 'weak' })
      .expect(400);
  });
});
