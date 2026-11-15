# Two-page draft memo with a diagonal watermark and a stamp

- **Stresses:** large rotated semi-transparent DRAFT watermark behind the text on every page; letter-spaced small-caps headings; a rotated SAMPLE stamp over a header field; short table; numbered list
- **Families:** hidden-overlap, encoding, structure
- **Status:** ok

A two-page memo on BRIGHTWATER LOGISTICS letterhead. Behind the text of both pages, a large light-grey
**DRAFT** runs diagonally from lower left to upper right; a red rotated **SAMPLE** stamp sits
over the Date field. A correct reading keeps the watermark and stamp out of the memo's lines (or
reports them separately) — they mark the document's status, they are not part of any sentence.

**MEMORANDUM**

- TO: Executive Committee
- FROM: Lena Marsh, Director of Facilities
- CC: Owen Pratt, Chief Financial Officer; Site Managers
- DATE: November 12, 2026
- RE: Consolidation of the Fremont and Hayward warehouses

**Background** (letter-spaced small caps)

Brightwater currently runs two cross-dock warehouses eleven miles apart. Fremont handles inbound ocean freight; Hayward handles regional retail replenishment. Both leases expire in 2028, and both buildings are below 60% utilisation outside the November peak.

Facilities and Finance were asked in August to assess whether a single site could absorb both flows without extending dock-to-stock times.

**Proposal** (letter-spaced small caps)

We propose to consolidate both operations into the Hayward building, which has the larger yard and can take four additional dock doors. Moving costs, racking and the dock works are estimated at $2.1 million one-off; lower rent, utilities and shuttle runs save about $1.4 million a year from fiscal 2028.

The move affects 18 roles at Fremont. All affected staff will be offered positions at Hayward with a relocation allowance; we do not expect redundancies.

**Timeline** (page 2)

| Milestone | Owner | Target date |
| --- | --- | --- |
| Committee approval | Executive Committee | December 9, 2026 |
| Dock works complete at Hayward | Facilities | April 30, 2027 |
| Fremont inbound moved to Hayward | Operations | June 15, 2027 |
| Fremont lease surrendered | Legal | September 30, 2027 |

**Risks** — The main risk is the November peak: if the dock works slip past April, Hayward will run the 2027 peak with its current eight doors. Operations recommends a fallback short-term lease on overflow space, budgeted within the one-off figure above.

**Recommendations**

1. Approve the consolidation and the one-off budget of $2.1 million.
2. Authorise Legal to open surrender talks with the Fremont landlord.
3. Ask HR to brief affected staff no later than January 2027.

## Questions an agent should be able to answer

1. Is this memo final? — No: every page carries a DRAFT watermark, and the header is stamped SAMPLE
2. What date is the memo, and who wrote it? — November 12, 2026; Lena Marsh, Director of Facilities
3. What are the expected annual savings and the one-off cost? — about $1.4 million a year from fiscal 2028; $2.1 million one-off
4. When should the dock works at Hayward be complete, and who owns that milestone? — April 30, 2027, Facilities
5. What is the second recommendation? — Authorise Legal to open surrender talks with the Fremont landlord.

**Current reading (ok):** all five questions are answerable from `read.md`. The watermark does
*not* fuse into the memo's lines here: it comes out as a separate `DRAFT` paragraph on each page
(between `MEMORANDUM` and the header fields on page 1, inside the timeline on page 2), and the
stamp as `SAMPLE` between the CC and Date values. Neither is labelled as a watermark or
stamp, but their presence answers question 1. The survey's failure (`Sample invoiceInvoice
number`) did not reproduce with a watermark drawn behind the text at this angle and size.

The letter-spaced small-caps headings read as words (`BACKGROUND`, `PROPOSAL`,
`RECOMMENDATIONS`, #268). Defects without a warning: the header
block is read as a label column then a value column (`TO:` … `RE:`, then the five values, with
`SAMPLE` between the third and fourth), so question 2 depends on counting. The timeline
table is not detected: after the header and first row, its rows are flattened column by column
(`Dock works complete at Hayward` / `Fremont inbound…` / `Fremont lease surrendered`, then
`Facilities` / `Operations` / `Legal`, then the dates), so question 4 is answered by position.
The only warnings are `text_overlap` (“block bboxes overlap … may visually collide”), caused by
the watermark; they name no next step.
