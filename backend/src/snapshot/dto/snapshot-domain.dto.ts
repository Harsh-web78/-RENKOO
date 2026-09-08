import {
  IsString,
  MaxLength,
} from 'class-validator';

/*
 * Anonymous snapshot input. The service re-validates
 * with normalizeDomain() — this DTO is the outer
 * shape guard only (string, bounded length).
 */
export class SnapshotDomainDto {
  @IsString()
  @MaxLength(253)
  domain!: string;
}
