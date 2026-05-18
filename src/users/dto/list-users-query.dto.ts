import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

const toOptionalInteger = (value: unknown): unknown => {
  if (value === undefined) {
    return value;
  }

  if (typeof value === 'string' && value.trim() === '') {
    return value;
  }

  if (typeof value === 'string' || typeof value === 'number') {
    return Number(value);
  }

  return value;
};

const toOptionalSearch = (value: unknown): unknown => {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

export class ListUsersQueryDto {
  @Transform(({ value }) => toOptionalInteger(value))
  @IsInt()
  @Min(1)
  page = 1;

  @Transform(({ value }) => toOptionalInteger(value))
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @Transform(({ value }) => toOptionalSearch(value))
  @IsOptional()
  @IsString()
  search?: string;
}
