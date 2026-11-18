# Refund process flowchart with decision branches

- **Stresses:** terminators, process boxes and decision diamonds with real text; vector connectors with arrowheads; Yes/No labels beside the connectors; a branch that loops back; two branches that merge into one box; shapes written before connectors
- **Families:** vector-meaning, reading-order
- **Status:** known-gap (#265)

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

**Known gap (#265):** nothing on the page warns, and the flow cannot be recovered from the text. The
labels come out as three loose groups in an order that follows neither the flow nor the page: the
left branch first (`Inspect the item` / `Fault from manufacture?` / `No` / `Offer a repair at our
cost` / `No` / `Yes`), then the caption in the middle of the figure, then the centre column
(`Start` … `End`, with `Yes` after each diamond), then `No` / `No` / `Email the customer for the
receipt` / `Offer store credit`. Every Yes/No is cut from its connector, the loop back to *Log the
refund request* and the two merges into *Refund* and *End* exist only as strokes, and the order puts
*Offer store credit* after *End*. Question 4 is answerable (the centre column happens to read in flow
order); questions 1, 2, 3 and 5 need the render, and no warning says so: `vector_chart_labels` and
`text_row_vector_bars` do not cover diagrams, and the page is under the `dense_vector_graphics`
threshold.
