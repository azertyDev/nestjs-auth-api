import {
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AccessTokenPayload } from '../auth/types/jwt-payload.type';
import { UsersService } from './users.service';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { PublicUserDto, toPublicUser } from './dto/public-user.dto';
import { UsersListResponseDto } from './dto/users-list-response.dto';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAccessGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @Roles(Role.ADMIN)
  @UseGuards(RolesGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List users' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiQuery({ name: 'search', required: false, type: String, example: 'user@example.com' })
  @ApiResponse({ status: 200, description: 'Paginated users list', type: UsersListResponseDto })
  @ApiResponse({ status: 403, description: 'Admin role required' })
  list(@Query() query: ListUsersQueryDto): Promise<UsersListResponseDto> {
    return this.users.list(query);
  }

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
