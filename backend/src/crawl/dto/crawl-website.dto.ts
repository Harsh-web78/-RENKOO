import { IsString } from 'class-validator';

export class CrawlWebsiteDto {
  @IsString()
  websiteId!: string;
}