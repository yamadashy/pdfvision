/**
 * Built-in encodings of the two standard-14 symbol fonts. pdf.js maps a
 * simple font's codes to Unicode through the Adobe Glyph List, which has no
 * entry for ZapfDingbats glyph names (`a19`, `a23`, ...), so without a
 * ToUnicode CMap a ✓ comes back as its character code, `3`. The tables below
 * are pdf.js's own `ZapfDingbatsEncoding` / `SymbolSetEncoding` joined with
 * its Dingbats and AGL name tables (private-use targets dropped), so the
 * correction agrees with what pdf.js renders.
 */

export type SymbolFontKind = 'dingbats' | 'symbol';

// [first code, characters for consecutive codes]
type CodeRun = readonly [number, string];

const DINGBATS_RUNS: readonly CodeRun[] = [
  [32, ' ✁✂✃✄☎✆✇✈✉☛☞✌✍✎✏✐✑✒✓✔✕✖✗✘✙✚✛✜✝✞✟✠✡✢✣✤✥✦✧★✩✪✫✬✭✮✯✰✱✲✳✴✵✶✷✸✹✺✻✼✽✾✿❀❁❂❃❄❅❆❇❈❉❊❋●❍■❏❐❑❒▲▼◆❖◗❘❙❚❛❜❝❞'],
  [128, '❨❩❪❫❬❭❮❯❰❱❲❳❴❵'],
  [161, '❡❢❣❤❥❦❧♣♦♥♠①②③④⑤⑥⑦⑧⑨⑩❶❷❸❹❺❻❼❽❾❿➀➁➂➃➄➅➆➇➈➉➊➋➌➍➎➏➐➑➒➓➔→↔↕➘➙➚➛➜➝➞➟➠➡➢➣➤➥➦➧➨➩➪➫➬➭➮➯'],
  [241, '➱➲➳➴➵➶➷➸➹➺➻➼➽➾'],
];

const SYMBOL_RUNS: readonly CodeRun[] = [
  [32, ' !∀#∃%&∋()∗+,−./0123456789:;<=>?≅ΑΒΧ∆ΕΦΓΗΙϑΚΛΜΝΟΠΘΡΣΤΥςΩΞΨΖ[∴]⊥_'],
  [97, 'αβχδεφγηιϕκλµνοπθρστυϖωξψζ{|}∼'],
  [160, '€ϒ′≤⁄∞ƒ♣♦♥♠↔←↑→↓°±″≥×∝∂•÷≠≡≈…'],
  [191, '↵ℵℑℜ℘⊗⊕∅∩∪⊃⊇⊄⊂⊆∈∉∠∇'],
  [213, '∏√⋅¬∧∨⇔⇐⇑⇒⇓◊〈'],
  [229, '∑'],
  [241, '〉∫⌠'],
  [245, '⌡'],
];

// ZapfDingbats glyph names followed by their character, for /Differences.
const DINGBATS_NAMES =
  'a1✁a2✂a202✃a3✄a4☎a5✆a119✇a118✈a117✉a11☛a12☞a13✌a14✍a15✎a16✏a105✐a17✑a18✒a19✓a20✔a21✕a22✖a23✗a24✘a25✙a26✚a27✛a28✜a6✝a7✞a8✟a9✠a10✡a29✢a30✣a31✤a32✥a33✦a34✧a35★a36✩a37✪a38✫a39✬a40✭a41✮a42✯a43✰a44✱a45✲a46✳a47✴a48✵a49✶a50✷a51✸a52✹a53✺a54✻a55✼a56✽a57✾a58✿a59❀a60❁a61❂a62❃a63❄a64❅a65❆a66❇a67❈a68❉a69❊a70❋a71●a72❍a73■a74❏a203❐a75❑a204❒a76▲a77▼a78◆a79❖a81◗a82❘a83❙a84❚a97❛a98❜a99❝a100❞a89❨a90❩a93❪a94❫a91❬a92❭a205❮a85❯a206❰a86❱a87❲a88❳a95❴a96❵a101❡a102❢a103❣a104❤a106❥a107❦a108❧a112♣a111♦a110♥a109♠a120①a121②a122③a123④a124⑤a125⑥a126⑦a127⑧a128⑨a129⑩a130❶a131❷a132❸a133❹a134❺a135❻a136❼a137❽a138❾a139❿a140➀a141➁a142➂a143➃a144➄a145➅a146➆a147➇a148➈a149➉a150➊a151➋a152➌a153➍a154➎a155➏a156➐a157➑a158➒a159➓a160➔a161→a163↔a164↕a196➘a165➙a192➚a166➛a167➜a168➝a169➞a170➟a171➠a172➡a173➢a162➣a174➤a175➥a176➦a177➧a178➨a179➩a193➪a180➫a199➬a181➭a200➮a182➯a201➱a183➲a184➳a197➴a185➵a194➶a198➷a186➸a195➹a187➺a188➻a189➼a190➽a191➾';

function expandRuns(runs: readonly CodeRun[]): readonly string[] {
  const table: string[] = [];
  for (const [first, chars] of runs) {
    Array.from(chars).forEach((char, offset) => {
      table[first + offset] = char;
    });
  }
  return table;
}

let dingbatsByCode: readonly string[] | undefined;
let symbolByCode: readonly string[] | undefined;
let dingbatsByName: ReadonlyMap<string, string> | undefined;

function codeTable(kind: SymbolFontKind): readonly string[] {
  if (kind === 'dingbats') {
    dingbatsByCode ??= expandRuns(DINGBATS_RUNS);
    return dingbatsByCode;
  }
  symbolByCode ??= expandRuns(SYMBOL_RUNS);
  return symbolByCode;
}

function dingbatsNameTable(): ReadonlyMap<string, string> {
  dingbatsByName ??= new Map(Array.from(DINGBATS_NAMES.matchAll(/(a\d+)(.)/gu), (match) => [match[1], match[2]]));
  return dingbatsByName;
}

const DINGBATS_FONT_RE = /^(?:[A-Z]{6}\+)?(?:ITC)?(?:Zapf)?Dingbats(?:ITC)?(?:[-,].*)?$/i;
const SYMBOL_FONT_RE = /^(?:[A-Z]{6}\+)?Symbol(?:MT)?(?:[-,].*)?$/i;

/** Which standard symbol font a PDF base font name refers to, if any. */
export function standardSymbolFontKind(name: unknown): SymbolFontKind | undefined {
  if (typeof name !== 'string') return undefined;
  if (DINGBATS_FONT_RE.test(name)) return 'dingbats';
  if (SYMBOL_FONT_RE.test(name)) return 'symbol';
  return undefined;
}

/**
 * The character a code draws in a standard symbol font: the /Differences
 * glyph name when the font overrides that code, the built-in encoding
 * otherwise. Undefined when the glyph has no public Unicode character.
 */
export function symbolFontChar(kind: SymbolFontKind, code: number, differenceName?: string): string | undefined {
  if (differenceName !== undefined) {
    return kind === 'dingbats' ? dingbatsNameTable().get(differenceName) : undefined;
  }
  return codeTable(kind)[code];
}
