import { IsBoolean, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class UpdateLeadDto {
  @IsOptional() @IsString()
  name?: string;

  @IsOptional() @IsString()
  email?: string;

  @IsOptional() @IsString()
  phone?: string;

  @IsOptional() @IsString()
  company?: string;

  @IsOptional() @IsString()
  source?: string;

  @IsOptional() @IsString()
  sourceDetail?: string;

  @IsOptional() @IsString()
  status?: string;

  @IsOptional() @IsNumber() @Min(0)
  score?: number;

  @IsOptional() @IsNumber() @Min(0)
  estimatedValue?: number;

  @IsOptional() @IsBoolean()
  converted?: boolean;

  @IsOptional() @IsString()
  notes?: string;

  @IsOptional() @IsString()
  landingPage?: string;

  @IsOptional() @IsString()
  keyword?: string;
}
