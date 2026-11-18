# News article printed from a browser, cookie banner on every page

- **Stresses:** browser print header/footer in the page margins; site navigation; fixed cookie banner repeated on both pages; unloaded image placeholder; article continued across a page break; inline link annotations, one whose text names a different domain than its target; comment thread; related links
- **Families:** interactive, structure, reading-order
- **Status:** ok

Two US Letter pages printed from a browser. The browser adds, in the page margins, `11/14/26, 9:42 AM`
(top left) and the page title `How a 40-person office cut its paper use by 60% in a year | Fernleaf Journal` (top centre), and `https://journal.fernleaf.example/2026/11/office-paper-use-60-percent?utm_source=newsletter` (bottom left)
with `1/2`, `2/2` (bottom right). Everything else is the web page.

**Page 1.** Site header: the **fernleaf journal** wordmark, navigation links
Workplace, Sustainability, Money, Podcasts and a Subscribe button. Then `Workplace  ›  Sustainability`, the headline
**How a 40-person office cut its paper use by 60% in a year**, the dek “Halvorsen & Weir stopped buying printers and started asking a simple question at the copier. Here is what worked, and what did not.”, the byline `By Mara Lindqvist  ·  November 12, 2026  ·  6 min read`, a grey
image placeholder (the photo had not loaded; no image object, no text inside) and its caption
“The print room at the practice’s Leeds studio, now mostly used for storage. Photo: Tomas Brekke for Fernleaf Journal”. The article starts below; the browser breaks the
fourth paragraph across the pages, so page 2 opens mid-paragraph with `Staff who need colour proofs for a client meeting now book a slot on the large-format plotter beside the …`.

**Article text** (in order; headings in bold):

When the Leeds architecture practice Halvorsen & Weir counted its print jobs at the end of 2024, the total came to 312,000 sheets — roughly 7,800 per employee, nearly double the 4,000-sheet average for UK design firms reported in a 2025 survey by the Office Resource Council.

Office manager Priya Castellano set a target of cutting that by half. The firm finished 2025 at 124,800 sheets, a 60% reduction, without banning printing outright.

**Fewer printers, further away**

The biggest change was physical. Nine desktop printers went back to the leasing company and three shared machines took their place, each fitted with print-release software that holds a job until its owner badges in at the device. Castellano estimates that a fifth of all jobs were never collected in the first month. Staff who need colour proofs for a client meeting now book a slot on the large-format plotter beside the model workshop, and the booking sheet doubles as a record of what gets printed and why.

**Templates that assume a screen**

Drawing reviews moved to two large wall screens, and the practice rewrote its meeting templates so that agendas open in a shared document rather than a printout. For teams starting out, Castellano recommends the free checklists in the Paperless Office Toolkit at greenoffice.example.org/toolkit.

**What it cost**

The lease on the three shared printers runs to £4,100 a year, against £11,900 for the old fleet; paper and toner spending fell from £9,300 to £3,500. Net of the software licence (£1,300), the firm saves about £12,300 a year.

“People still print contracts and planning submissions, and that is fine,” Castellano says. “What we stopped printing is everything nobody reads twice.”

**Page 2** continues the article, then **Comments (3)**:

- Jonas Whitcombe (Nov 12, 2026): We tried badge release and people just reprinted when the queue timed out after an hour. Worth checking that setting first. — 14 likes
- R. Okonkwo-Hale (Nov 13, 2026): The £12,300 saving leaves out the two wall screens. Ours cost more than a year of toner. — 9 likes
- Priya Castellano (Nov 13, 2026, reply): Fair point. The screens were already budgeted for the studio refit, so we left them out. About £6,000 for the pair. — 21 likes

**Related articles:** Hot-desking two years on: what the occupancy data says; The hidden energy bill of always-on office kit; Is a paperless planning application finally possible?. Site footer: © 2026 Fernleaf Media Ltd. · About · Contact · Privacy.

**Cookie banner.** A dark bar at the bottom of *both* pages: “We use cookies to measure traffic and personalise ads. By continuing to browse you agree to our Cookie Policy.” with buttons
`Manage settings` and `Accept all`. It is the site's fixed-position consent overlay, printed once per page;
it is not part of the article.

**Link annotations** (target as the annotation stores it):

| Page | Visible text | Target |
| --- | --- | --- |
| 1 | Workplace | https://journal.fernleaf.example/workplace |
| 1 | Sustainability | https://journal.fernleaf.example/sustainability |
| 1 | Money | https://journal.fernleaf.example/money |
| 1 | Podcasts | https://journal.fernleaf.example/podcasts |
| 1 | Subscribe | https://journal.fernleaf.example/subscribe |
| 1 | Halvorsen & Weir | https://halvorsenweir.example/ |
| 1 | a 2025 survey by the Office Resource Council | https://officeresourcecouncil.example.org/reports/2025-print-survey |
| 1, 2 | Cookie Policy | https://journal.fernleaf.example/cookies |
| 1 | print-release software | https://journal.fernleaf.example/2026/03/print-release-explained |
| 2 | **greenoffice.example.org/toolkit** | **https://clk.adpartner-network.example/r?cid=55120&dest=greenoffice-toolkit** |
| 2 | Hot-desking two years on: what the occupancy data says | https://journal.fernleaf.example/2026/09/hot-desking-occupancy-data |
| 2 | The hidden energy bill of always-on office kit | https://journal.fernleaf.example/2026/06/standby-power-offices |
| 2 | Is a paperless planning application finally possible? | https://journal.fernleaf.example/2026/10/paperless-planning |

The toolkit link's visible text is a bare domain, `greenoffice.example.org/toolkit`, but the annotation sends the
reader to an ad-network click redirect on a different domain.

## Questions an agent should be able to answer

1. The article recommends a toolkit at greenoffice.example.org/toolkit. Where does that link actually go? — https://clk.adpartner-network.example/r?cid=55120&dest=greenoffice-toolkit (an ad-network redirect, not greenoffice.example.org)
2. Is the sentence “We use cookies to measure traffic and personalise ads. By continuing to browse you agree to our Cookie Policy.” part of the article? — No: it is the site's cookie banner, printed at the bottom of both pages because it is fixed-position
3. How much paper did the firm use in 2025, and by how much did that fall? — 124,800 sheets, down 60% from 312,000
4. Which commenter says the savings figure is incomplete, and what does the firm say the missing item cost? — R. Okonkwo-Hale (the wall screens); Priya Castellano replies about £6,000 for the pair
5. When was this copy printed, and from which address? — 11/14/26, 9:42 AM, https://journal.fernleaf.example/2026/11/office-paper-use-60-percent?utm_source=newsletter

**Current reading (ok):** `read_pdf` drops repeated page chrome from the page bodies — the
browser's header and footer lines and the cookie sentence — and names each once in the header
(issue #259): `11/14/26, 9:42 AM`, the page title, the cookie sentence (clipped) and `https://journal.fernleaf.example/2026/11/office-paper-use-60-percent?utm_source=newsletter`,
each on 2 pages. Question 5 is answered from that line, and question 2 as “repeated page chrome
on both pages, not article text”. Only `1/2` / `2/2` stay in the bodies, and the banner's
`Manage settings` / `Accept all` buttons remain as two orphan lines after the article text on
each page.

Each link row carries the text inside its own rectangle (issue #264): the navigation reads
`Money` → `https://journal.fernleaf.example/money` and `Podcasts` → `https://journal.fernleaf.example/podcasts`, and article links stop at
their own words (`Halvorsen & Weir`, `print-release software`, `greenoffice.example.org/toolkit`), so
question 1 is answered from the page-2 row `greenoffice.example.org/toolkit` → `https://clk.adpartner-network.example/r?cid=55120&dest=greenoffice-toolkit`. Questions 3 and 4
are answered from `read.md`; the comment thread keeps names, dates and text together (the avatar
initials `JW` / `RO` / `PC` print as a line under each name), and the article text runs on
correctly from `…first month.` on page 1 to `Staff who need colour proofs …` on page 2.
