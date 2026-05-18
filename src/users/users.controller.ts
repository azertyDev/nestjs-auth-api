import { Controller, Get, Param, ParseUUIDPipe, ForbiddenException } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard';
import { UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../auth/types/jwt-payload.type';
import { UsersService } from './users.service';
import { PublicUserDto, toPublicUser } from './dto/public-user.dto';
import { Role } from '@prisma/client';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAccessGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get(':id')
  @ApiOperation({ summary: 'Get user by id (self or admin)' })
  async getById(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() current: AccessTokenPayload,
  ): Promise<PublicUserDto> {
    if (current.sub !== id && current.role !== Role.ADMIN) {
      throw new ForbiddenException('Access denied');
    }
    const user = await this.users.findById(id);
    return toPublicUser(user);
  }
}
