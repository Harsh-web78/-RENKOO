import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class RunAgentDto {
  @IsString()
  websiteId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  input?: string;

  @IsOptional()
  @IsIn([
    'USER_REQUEST',
    'QUICK_TASK',
  ])
  trigger?: string;
}

export class ExecuteRunDto {
  @IsBoolean()
  approve!: boolean;

  @IsOptional()
  @IsInt({ each: true })
  @Min(0, { each: true })
  indexes?: number[];
}
