export interface SearchLine {
  text: string;
  owners: (SearchOwner | undefined)[];
  syntheticHyphenated?: boolean;
  syntheticDehyphenated?: boolean;
  syntheticJoinIndex?: number;
  syntheticStacked?: boolean;
  syntheticVertical?: boolean;
  syntheticRuby?: boolean;
  syntheticRubyBase?: boolean;
  rubyRanges?: SearchLineRange[];
}

export interface SearchLineRange {
  start: number;
  end: number;
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SearchOwner extends Box {
  text: string;
  fontSize?: number;
}
