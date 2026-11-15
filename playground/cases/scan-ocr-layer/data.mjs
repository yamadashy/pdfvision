// Shared by assets.mjs (what the scan shows) and build.mjs (the OCR text
// layer and the truth). Coordinates are PDF points on a Letter page, top-left
// origin, y at the top of the line.

// `ocr` is what the OCR engine put in the text layer when it differs from
// the page: a misread string, or null when it dropped the line entirely.
export const LETTER = [
  { text: 'Hollis & Weber Property Management', x: 72, y: 70, size: 15, bold: true },
  { text: '88 Quarry Lane, Suite 210, Fairhaven, OR 97405', x: 72, y: 90, size: 10 },
  { text: 'October 2, 2026', x: 72, y: 136, size: 11 },
  { text: 'Mr. Jonah Pruett', x: 72, y: 172, size: 11 },
  { text: '1427 Larch Avenue, Apt 5B', x: 72, y: 187, size: 11 },
  { text: 'Fairhaven, OR 97404', x: 72, y: 202, size: 11 },
  { text: 'Re: Security deposit return — 1427 Larch Avenue, Apt 5B', x: 72, y: 238, size: 11, bold: true },
  { text: 'Dear Mr. Pruett,', x: 72, y: 268, size: 11 },
  { text: 'Following the move-out inspection on September 18, 2026, we have itemized the', x: 72, y: 292, size: 11 },
  { text: 'deductions from your security deposit of $1,850.00 as follows:', x: 72, y: 307, size: 11 },
  { text: 'Carpet cleaning, bedroom 2', amount: '$145.00', x: 100, y: 337, size: 11 },
  {
    text: 'Replacement of 1 window blind',
    amount: '$38.50',
    x: 100,
    y: 352,
    size: 11,
    ocr: null,
  },
  {
    text: 'Unpaid utility balance (September)',
    amount: '$61.25',
    x: 100,
    y: 367,
    size: 11,
    ocrAmount: '$81.25',
  },
  { text: 'Total deductions', amount: '$244.75', x: 100, y: 391, size: 11, bold: true },
  { text: 'Amount returned', amount: '$1,605.25', x: 100, y: 406, size: 11, bold: true, ocr: 'Amount retumed' },
  { text: 'A check for the amount returned is enclosed. If you dispute any item, please', x: 72, y: 436, size: 11 },
  {
    text: 'write to us within 14 days of the date of this letter.',
    x: 72,
    y: 451,
    size: 11,
    ocr: 'write to us within l4 days of the date of this letter.',
  },
  { text: 'Sincerely,', x: 72, y: 486, size: 11 },
  { text: 'Marianne Holloway', x: 72, y: 552, size: 11 },
  { text: 'Property Manager', x: 72, y: 567, size: 11 },
  { text: 'Enclosures: check no. 30418; move-out inspection summary', x: 72, y: 600, size: 9 },
];
// Right edge the amounts are aligned to.
export const AMOUNT_RIGHT = 470;

export const INSPECTION = {
  title: 'MOVE-OUT INSPECTION SUMMARY',
  unit: 'Unit: 1427 Larch Avenue, Apt 5B',
  date: 'Inspection date: 09/18/2026',
  columns: ['Room', 'Condition', 'Notes'],
  rows: [
    ['Living room', 'Good', '—'],
    ['Kitchen', 'Fair', 'Oven needs degreasing'],
    ['Bedroom 1', 'Good', '—'],
    ['Bedroom 2', 'Poor', 'Carpet stained near window; blind missing'],
    ['Bathroom', 'Good', '—'],
  ],
  inspector: 'Inspected by: R. Castillo',
  keys: 'Keys returned: 2 of 2',
};

/** Rotation of the paper on the scanner glass, in degrees. */
export const SKEW = [0.7, -0.5];
/** Raster resolution of the scans, pixels per PDF point (≈ 100 dpi). */
export const SCAN_SCALE = 1.4;
