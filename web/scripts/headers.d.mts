export interface SiteOptions {
  supabaseUrl: string;
  /** Where the samples come from; relative paths are this site. */
  sampleUrls?: string[];
}
export function contentSecurityPolicy(options: SiteOptions): string;
export function headersFile(options: SiteOptions): string;
export function redirectsFile(): string;
