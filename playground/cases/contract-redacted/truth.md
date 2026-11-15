# Services agreement with redactions and review annotations

- **Stresses:** numbered clauses with bold defined terms; a proper redaction; a black box over live text; white-on-white text; highlight, sticky note, strike-out and link annotations
- **Families:** hidden-overlap, interactive, structure
- **Status:** ok

MASTER SERVICES AGREEMENT between **Corvane Analytics Ltd.** (“Provider”), 40 Wharf Road, Leith, Edinburgh EH6 6QX, and **Blue Fern Retail, Inc.**
(“Client”), 1180 Mercer Street, Suite 400, Seattle, WA 98109, effective November 1, 2026. Defined terms are bold.

**What a reader sees on the page** (█ = black box; clause 4.3 is blank space):

**1. Definitions**

1.1 “Services” means the data-engineering and analytics services described in Schedule A.

1.2 “Deliverables” means all reports, dashboards and code that Provider delivers to Client in performing the Services.

1.3 “Confidential Information” means any non-public information disclosed by one party to the other, in any form, that is marked or would reasonably be understood as confidential.

**2. Services**

2.1 Provider shall perform the Services with reasonable skill and care and in accordance with the service levels in Schedule B.

2.2 Client shall give Provider timely access to the systems, data and personnel reasonably required for the Services.

**3. Fees and Payment**

3.1 Client shall pay Provider a fixed monthly fee of █████ (the “Fees”), invoiced monthly in advance.

3.2 Invoices are payable within thirty (30) days of the invoice date.

3.3 Late payments bear interest at 1.5% per month until paid in full.

**4. Term and Termination**

4.1 This Agreement starts on the Effective Date and continues for an initial term of twenty-four (24) months (the “Initial Term”).

4.2 Either party may terminate this Agreement for material breach on thirty (30) days’ written notice if the breach is not cured within that period.

4.3 

**5. Confidentiality**

5.1 Each party shall keep the other party’s Confidential Information confidential and use it only to perform this Agreement, for the term and three (3) years after.

**6. Limitation of Liability**

6.1 Provider’s aggregate liability under this Agreement shall not exceed █████ in any contract year.

6.2 Neither party is liable for indirect or consequential loss, including loss of profit, revenue or data.

**7. Notices**

7.1 Notices to Provider shall be submitted through https://contracts.corvane.example/notices and notices to Client sent by courier to the address above.

**8. Governing Law**

8.1 This Agreement is governed by the laws of the State of Washington, and the courts of King County have exclusive jurisdiction.

Signature block (page 2):

- CORVANE ANALYTICS LTD. — By: (blank line) · Name: Priya Natarajan · Title: Chief Executive Officer · Date: November 3, 2026
- BLUE FERN RETAIL, INC. — By: (blank line) · Name: Marcus Oyelaran · Title: General Counsel · Date: November 5, 2026

**What is hidden but extractable** — a correct reading must not present these as visible text,
and should flag them, because the page shows something else:

- 6.1 cap `USD 250,000` — still in the content stream under a filled black rectangle (failed redaction).
- 4.3 `Client may terminate this Agreement for convenience after month twelve (12) upon payment of an early-termination fee of USD 120,000.` — white text on the white page (hidden clause).

**What is gone:** the 3.1 fee (`USD 48,500` in the unredacted original) is not in the file; only the black
box is. A correct reading says the fee is redacted and does not guess.

**Annotations** (page numbers are physical):

- Highlight (page 1) over `thirty (30) days’ written notice` in 4.2.
- Strike-out (page 1) over `1.5% per month` in 3.3, comment: “Replace with 1.0% per month, per our standard terms.”
- Sticky note (page 2) beside 6.1: “Cap is too low for a 24-month term. Ask for 2x annual fees. — J. Ortiz, Client Legal”
- Link (page 2) on the URL in 7.1 → `https://contracts.corvane.example/notices`

## Questions an agent should be able to answer

1. What is the monthly fee? — Not disclosed: it is properly redacted (no text behind the box)
2. What is Provider's liability cap? — Shown redacted; the text under the box still reads USD 250,000, which a correct reading flags as a failed redaction rather than reporting as visible
3. Is anything in the document hidden from a human reader? — Yes: the 6.1 cap under a black box, and clause 4.3 in white text (Client may terminate this Agreement for convenience after month twelve (12) upon payment of an early-termination fee of USD 120,000.)
4. What did the reviewer say about the liability clause, and what change did they propose to late-payment interest? — “Cap is too low for a 24-month term. Ask for 2x annual fees. — J. Ortiz, Client Legal”; strike “1.5% per month” — “Replace with 1.0% per month, per our standard terms.”
5. Who signed for the Client, and when? — Marcus Oyelaran, General Counsel, November 5, 2026

**Current reading (ok):** both failed redactions are still in the text, where they belong — the
file contains them — and each is flagged on its page. Page 2 reads `shall not exceed USD 250,000 in any
contract year.` and carries `text_under_opaque_fill` naming exactly `"USD 250,000"` with its bbox, so
the rest of clause 6.1 stays ordinary visible text and question 2 is answered as “shown redacted;
the hidden text reads USD 250,000”. Page 1 reads clause 4.3 as a normal clause and carries
`text_matches_background` (severity `warning`) naming its two lines (`"Client may terminate this Agreement for convenience after..."` and
`"early-termination fee of USD 120,000."`) with bboxes, which answers question 3. Both warnings
point at `--render-region` for the listed bbox, and the render shows the black box and the blank.
The warnings sit at the end of each page, after the annotation tables, so an agent has to read to the
end of the page before quoting clause 6.1 or 4.3. (Issue #249.)
The strike-out and highlight rows carry the text they mark in `Marked Text` (`1.5% per month`,
`thirty (30) days’ written notice`), so question 4 needs no box-to-text matching. (Issue #260.)

Defects without a warning: the proper redaction is only partly readable. 3.1 reads `a fixed monthly fee of` / `(the “Fees”),
invoiced monthly in` / `advance.` — the value is simply absent (no box is reported, there is no warning, and the line
is broken where the box sits), so question 1 gets “not stated” where the page shows a redaction:
the reading cannot establish that anything was redacted. Annotations are listed per page
with author, contents, colour and bbox, and the link with its target, so question 4 is answerable
— but the highlight and strike-out rows do not quote the text they mark (`1.5% per month`,
`thirty (30) days’ written notice`); only the strike-out's comment reveals what it is about.
Bold defined terms are not marked in the output. Question 5 is answered correctly.
