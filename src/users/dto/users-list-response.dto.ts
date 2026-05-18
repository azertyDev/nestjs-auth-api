import { ApiProperty } from '@nestjs/swagger';
import { PublicUserDto } from './public-user.dto';

export class UsersListResponseDto {
  @ApiProperty({ type: () => [PublicUserDto] })
  data!: PublicUserDto[];

  @ApiProperty({ example: 42 })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;

  @ApiProperty({ example: 3 })
  totalPages!: number;
}
