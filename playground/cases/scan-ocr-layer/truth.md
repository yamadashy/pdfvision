# Scanned letter with an imperfect OCR text layer

- **Stresses:** full-page raster scans; invisible OCR text (render mode 3) with OCR errors; a second scanned page with no text layer
- **Families:** raster-text, hidden-overlap
- **Status:** ok
- **Showcase:** The only text is an invisible OCR layer under a scanned image, and its errors (`retumed`, `l4`, a dropped line) look like ordinary native text.

**Page 1 — what the scan shows** (a skewed, speckled image of a typed letter):

> Hollis & Weber Property Management
> 88 Quarry Lane, Suite 210, Fairhaven, OR 97405
> October 2, 2026
> Mr. Jonah Pruett
> 1427 Larch Avenue, Apt 5B
> Fairhaven, OR 97404
> Re: Security deposit return — 1427 Larch Avenue, Apt 5B
> Dear Mr. Pruett,
> Following the move-out inspection on September 18, 2026, we have itemized the
> deductions from your security deposit of $1,850.00 as follows:
> Carpet cleaning, bedroom 2 $145.00
> Replacement of 1 window blind $38.50
> Unpaid utility balance (September) $61.25
> Total deductions $244.75
> Amount returned $1,605.25
> A check for the amount returned is enclosed. If you dispute any item, please
> write to us within 14 days of the date of this letter.
> Sincerely,
> Marianne Holloway
> Property Manager
> Enclosures: check no. 30418; move-out inspection summary

(plus a handwritten signature between “Sincerely,” and the name).

**Page 1 — what the invisible OCR layer contains.** Same lines, except:

- dropped: `Replacement of 1 window blind $38.50` is not in the layer at all
- `Unpaid utility balance (September) $61.25` → `Unpaid utility balance (September) $81.25`
- `Amount returned $1,605.25` → `Amount retumed $1,605.25`
- `write to us within 14 days of the date of this letter.` → `write to us within l4 days of the date of this letter.`

A correct reading does not present the OCR layer as the page's text without saying it comes
from a scan, so the reader knows the image is the authority. The misread amount and the
dropped line are invisible in the text itself: the layer still says `Total deductions $244.75`,
which no longer adds up (`$145.00 + $81.25 = $226.25`).

**Page 2** — image only, no text layer. It shows:

MOVE-OUT INSPECTION SUMMARY; Unit: 1427 Larch Avenue, Apt 5B; Inspection date: 09/18/2026

| Room | Condition | Notes |
| --- | --- | --- |
| Living room | Good | — |
| Kitchen | Fair | Oven needs degreasing |
| Bedroom 1 | Good | — |
| Bedroom 2 | Poor | Carpet stained near window; blind missing |
| Bathroom | Good | — |

Keys returned: 2 of 2. Inspected by: R. Castillo. Tenant signature line (blank).

A correct reading says page 2 has no text and needs OCR or the render.

## Questions an agent should be able to answer

1. How much of the deposit is being returned? — $1,605.25
2. Which deductions were taken, and for how much? — Carpet cleaning, bedroom 2 $145.00; Replacement of 1 window blind $38.50; Unpaid utility balance (September) $61.25
3. Within how many days must a dispute be raised? — 14
4. Who signed the letter? — Marianne Holloway, Property Manager
5. Which room was rated Poor at the inspection? — Bedroom 2 (page 2, image only)

**Current reading (ok — the warnings carry it):** `read.md` returns the OCR layer verbatim as page 1's
text, errors included (`Amount retumed`, `l4 days`, `$81.25`, the blind line missing), so
from text alone question 2 is answered wrongly (two deductions, utility `$81.25`) and question 3
reads `l4`. Page 1 carries `raster_backed_text_layer` (“native text appears to be an OCR/text
layer over a full-page raster image … rerun with --ocr or compare against the render before
trusting wording”), and page 2 carries `raster_image_no_native_text` (“compare the render or OCR
when exact text matters”). Both name the next step, so an agent that follows them gets 2, 3
and 5 right; questions 1 and 4 are answered correctly from the layer.
