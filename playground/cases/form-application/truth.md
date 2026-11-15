# Fillable grant application (AcroForm)

- **Stresses:** filled and empty text fields; labels left of and above boxes; multi-line field; split date boxes; radio group; checkboxes; dropdown; signature line that is not a field
- **Families:** interactive
- **Status:** ok

Riverside Community Arts Fund — Project Grant Application — 2027 Cycle (Form RCAF-12 (rev. 03/2026)). Instructions: “Please type or print clearly. Fields marked * are required. Return the completed form to grants@riverside-arts.example no later than January 31, 2027. Incomplete applications will not be reviewed.”

A correct reading pairs every field with its printed label and value, and distinguishes an
empty field from a missing one.

**1. Applicant information**

- Full name *: `Elena Marsh`
- Organization: `Tidewater Youth Theatre`
- Email *: `elena.marsh@tidewater.example`
- Phone: (empty)
- Mailing address *: `214 Harbor Street, Unit 3 / Port Avalon, CA 95012`

**2. Project details**

- Project title *: `Summer Stage: Shakespeare in the Park`
- Project start date (three boxes MM / DD / YYYY): 03/01/2027
- Program category * (radio): **Performing arts** selected; Visual arts, Literary arts, Media arts not selected
- Amount requested (USD) *: `12,500`
- Expected participants: (empty)
- County served (dropdown of Alder, Bayview, Coastline, Redwood): **Bayview**

**3. Declarations** (checkboxes)

- [x] I confirm that the information in this application is accurate.
- [x] The organization is a registered nonprofit.
- [ ] We have received RCAF funding in the past three years.
- [ ] Send me the RCAF newsletter.

Signature of applicant and Date: printed lines, not fields, left blank.

## Questions an agent should be able to answer

1. How much funding is requested? — $12,500
2. Which program category did the applicant choose? — Performing arts
3. When does the project start? — 03/01/2027 (March 1, 2027)
4. Has the organization received RCAF funding in the past three years? — No (box unchecked)
5. Which required fields, if any, are still empty? — none; the empty fields (Phone, Expected participants) are optional

**Current reading (ok):** all five questions are answerable from `read.md`, with some deduction.
Values live only in the form-field table (the body is the printed labels), which is the design.
Unchecked boxes and empty text fields are collapsed into “_4 further fields, none filled
(2 checkbox, 2 text)_” — question 4 follows from the two checked declarations being listed by
label, question 5 from every `*` label having a filled field.

Defect without a warning: the label column is empty for left-labelled fields whose printed
label ends far from the box (`full_name`, `organization`, `email`, `project_title`,
`county`, and `start_day`/`start_year`), while `requested_amount` (longer label, smaller
gap) gets `Amount requested (USD) * (left)`. Here the field names carry the meaning; on a form
with generic names (`Text1`, `Text2`) the values could not be attributed. The radio labels'
body order diverges (`Media arts` after `Signature of applicant`) and is covered by a
`reading_order_divergence` warning that says to render.
