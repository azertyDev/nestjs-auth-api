import { Test } from '@nestjs/testing';
import { Role, User } from '@prisma/client';
import { mockDeep, MockProxy } from 'jest-mock-extended';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from './users.service';

const createUser = (overrides: Partial<User> = {}): User => ({
  id: 'user-1',
  email: 'alice@example.com',
  passwordHash: 'secret-hash',
  role: Role.USER,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-02T00:00:00.000Z'),
  ...overrides,
});

describe('UsersService', () => {
  let service: UsersService;
  let prisma: MockProxy<PrismaService>;

  beforeEach(async () => {
    prisma = mockDeep<PrismaService>();

    (prisma.$transaction as unknown as jest.Mock).mockImplementation(
      (operations: Promise<unknown>[]) => Promise.all(operations),
    );

    const moduleRef = await Test.createTestingModule({
      providers: [UsersService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = moduleRef.get(UsersService);
  });

  describe('list', () => {
    it('returns paginated public users using a case-insensitive email search', async () => {
      const user = createUser();
      (prisma.user.count as unknown as jest.Mock).mockResolvedValue(21);
      (prisma.user.findMany as unknown as jest.Mock).mockResolvedValue([user]);

      const result = await service.list({ page: 3, limit: 10, search: 'ALICE' });

      expect(prisma.user.count).toHaveBeenCalledWith({
        where: { email: { contains: 'ALICE', mode: 'insensitive' } },
      });
      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: { email: { contains: 'ALICE', mode: 'insensitive' } },
        skip: 20,
        take: 10,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          role: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(result).toEqual({
        data: [
          {
            id: user.id,
            email: user.email,
            role: user.role,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
          },
        ],
        total: 21,
        page: 3,
        limit: 10,
        totalPages: 3,
      });
      expect(result.data[0]).not.toHaveProperty('passwordHash');
    });
  });
});
