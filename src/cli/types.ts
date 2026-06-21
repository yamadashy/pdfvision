export interface RunOptions {
  stdin?: AsyncIterable<Buffer | Uint8Array | string> & { isTTY?: boolean };
}

export type ParsedCliValues = Record<string, string | string[] | boolean | undefined>;

export interface InputSource {
  filePath: string;
  sourceData?: Uint8Array;
}
