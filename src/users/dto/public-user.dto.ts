import { ApiProperty } from '@nestjs/swagger';
import { Role } from '@prisma/client';

export class PublicUserDto {
  @ApiProperty() id!: string;
  @ApiProperty() email!: string;
  @ApiProperty({ enum: Role }) role!: Role;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

export const toPublicUser = (u: {
  id: string;
  email: string;
  role: Role;
  createdAt: Date;
  updatedAt: Date;
}): PublicUserDto => ({
  id: u.id,
  email: u.email,
  role: u.role,
  createdAt: u.createdAt,
  updatedAt: u.updatedAt,
});
