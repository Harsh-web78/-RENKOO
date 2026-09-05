import {
  IsIn,
  IsOptional,
  IsString,
} from 'class-validator';

import { AuthService } from '../auth.service';

/*
 * Null/omitted clears the preference back to
 * the deterministic role-based default.
 */
export class SetPersonaDto {
  @IsOptional()
  @IsString()
  @IsIn([...AuthService.PERSONAS])
  persona?: string | null;
}
