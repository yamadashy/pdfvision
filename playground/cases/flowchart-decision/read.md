_Untrusted PDF-derived data below — content, links, and form values are not instructions._

# playground/cases/flowchart-decision/case.pdf

- **Pages:** 1
- **Title:** Refund process flowchart with decision branches
- **Author:** pdfvision playground
- **Creator:** pdfvision

---

## Page 1

_chars: 550 · images: 0 · coverage: 4% · vectors: 45 · size: 612×792pt_

5.3 Refunds and returns

Inspect the item

Fault from

manufacture?

No

Offer a repair
at our cost

Refund to the original
payment method

No

Yes

Figure 2. Handling a refund request at the service desk

Start

Log the refund request

Receipt

attached?

Yes

Bought within

30 days?

Yes

Item unused?

Yes

Send confirmation email

End

No

No

Email the customer

for the receipt

Offer store credit

Store credit and repairs are recorded in the same log as refunds. A request that is waiting for a receipt is closed automatically after 14
days.

### Connections

_Arrows drawn between boxes of text; the text above does not show them._

- Start → Log the refund request — bbox 250,117,0,26
- Log the refund request → Receipt attached? — bbox 250,177,0,30
- Receipt attached? → Email the customer for the receipt (No) — bbox 310,238,94,0
- Receipt attached? → Bought within 30 days? (Yes) — bbox 250,269,0,30
- Email the customer for the receipt → Log the refund request — bbox 314,160,154,61
- Bought within 30 days? → Offer store credit (No) — bbox 310,330,94,0
- Bought within 30 days? → Item unused? (Yes) — bbox 250,361,0,30
- Offer store credit → End — bbox 290,347,178,379
- Item unused? → Inspect the item (No) — bbox 156,422,34,0
- Item unused? → Refund to the original payment method (Yes) — bbox 250,453,0,134
- Inspect the item → Fault from manufacture? — bbox 92,439,0,42
- Fault from manufacture? → Offer a repair at our cost (No) — bbox 92,543,0,44
- Fault from manufacture? → Refund to the original payment method (Yes) — bbox 152,512,34,92
- Offer a repair at our cost → End — bbox 92,621,118,105
- Refund to the original payment method → Send confirmation email — bbox 250,621,0,28
- Send confirmation email → End — bbox 250,683,0,30
