# Refund process flowchart with decision branches

- **Stresses:** terminators, process boxes and decision diamonds with real text; vector connectors with arrowheads; Yes/No labels beside the connectors; a branch that loops back; two branches that merge into one box; shapes written before connectors
- **Families:** vector-meaning, reading-order
- **Status:** ok
- **Showcase:** The flow exists only as strokes: connectors leave diamonds sideways, one loops back up as an elbow, two branches merge, and every Yes/No sits beside its connector, not in any box.

One Letter page: a section heading, a flowchart and its caption, and a note. The flowchart, as steps:

1. **Start** → **Log the refund request** → decision **Receipt attached?**
2. Receipt attached? — **No** → **Email the customer for the receipt** → back to *Log the refund request*.
   **Yes** → decision **Bought within 30 days?**
3. Bought within 30 days? — **No** → **Offer store credit** → **End**. **Yes** → decision **Item unused?**
4. Item unused? — **Yes** → **Refund to the original payment method**. **No** → **Inspect the item** →
   decision **Fault from manufacture?**
5. Fault from manufacture? — **Yes** → **Refund to the original payment method**. **No** →
   **Offer a repair at our cost** → **End**.
6. Refund to the original payment method → **Send confirmation email** → **End**.

Note below the figure: Store credit and repairs are recorded in the same log as refunds. A request that is waiting for a receipt is closed automatically after 14 days.

## Questions an agent should be able to answer

1. A customer bought an item 45 days ago and has the receipt. What does the desk do? — Offer store credit
2. The item is within 30 days and has been used, and the inspection finds a manufacturing fault. What happens? — Refund to the original payment method, then a confirmation email
3. What happens when the request has no receipt? — The desk emails the customer for the receipt and the request goes back to being logged (closed automatically after 14 days if none arrives)
4. Which step comes right after a refund? — Send confirmation email
5. When is a repair offered instead of a refund? — When a used item, within 30 days, has a fault that is not from manufacture

Fixed in #265: `### Connections` lists all sixteen arrows as `from → to (label)`, each label the
`Yes`/`No` nearest its connector: `Bought within 30 days? → Offer store credit (No)`,
`Email the customer for the receipt → Log the refund request` (the loop back),
`Fault from manufacture? → Refund to the original payment method (Yes)` and
`Offer a repair at our cost → End` (the merges). Every question is answered from it.

The body still reads the labels as three loose groups (the left branch with `Refund to the original
payment method` after `Offer a repair at our cost`, the caption, the centre column, then the right
branch, `No` / `No` after `End`); the connections do not depend on that order.
