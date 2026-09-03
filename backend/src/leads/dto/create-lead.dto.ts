import { IsEmail, IsNumber, IsOptional, IsString, Min, IsBoolean } from 'class-validator';

export class CreateLeadDto {
  @IsOptional() @IsString()
  name?: string;

  @IsOptional() @IsEmail()
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

  @IsOptional() @IsString()
  notes?: string;

  @IsOptional() @IsString()
  landingPage?: string;

  @IsOptional() @IsString()
  keyword?: string;
}
