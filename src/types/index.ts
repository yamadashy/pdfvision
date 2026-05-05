export type OutputFormat = 'text' | 'json';

export interface ProcessOptions {
  pages?: string;
  format: OutputFormat;
  noCache: boolean;
  render?: boolean;
}

export interface PageResult {
  page: number;
  text: string;
  image?: string;
}

export interface DocumentMetadata {
  title: string | null;
  author: string | null;
  subject: string | null;
  creator: string | null;
}

export interface DocumentResult {
  file: string;
  totalPages: number;
  metadata: DocumentMetadata;
  pages: PageResult[];
}
