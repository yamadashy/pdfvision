export interface SearchLine {
  text: string;
  owners: (SearchOwner | undefined)[];
  syntheticHyphenated?: boolean;
  syntheticVertical?: boolean;
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SearchOwner extends Box {
  text: string;
}
