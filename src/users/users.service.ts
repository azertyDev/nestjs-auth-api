import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { toPublicUser } from './dto/public-user.dto';
import { UsersListResponseDto } from './dto/users-list-response.dto';

const publicUserSelect = {
  id: true,
  email: true,
  role: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: { email: string; passwordHash: string; role?: Role }): Promise<User> {
    try {
      return await this.prisma.user.create({
        data: {
          email: data.email,
          passwordHash: data.passwordHash,
          role: data.role ?? Role.USER,
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Email already registered');
      }
      throw e;
    }
  }

  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async findById(id: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async list(query: ListUsersQueryDto): Promise<UsersListResponseDto> {
    const where: Prisma.UserWhereInput | undefined = query.search
      ? {
          email: {
            contains: query.search,
            mode: 'insensitive',
          },
        }
      : undefined;
    const skip = (query.page - 1) * query.limit;

    const [total, users] = await this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
        select: publicUserSelect,
      }),
    ]);

    return {
      data: users.map(toPublicUser),
      total,
      page: query.page,
      limit: query.limit,
      totalPages: Math.ceil(total / query.limit),
    };
  }
}
