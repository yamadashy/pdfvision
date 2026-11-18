# Town walking map with rotated and curved street names

- **Stresses:** street names rotated along strokes at 0°, 90°, about 38° and about −69°; a road and a river named along a curve one glyph at a time; numbered markers keyed to a legend; north arrow and scale bar; landscape page
- **Families:** vertical-rotated, vector-meaning, page-geometry
- **Status:** known-gap (#265)

One Letter landscape page: the title **Wendbury town centre** with a map on the left and a legend on
the right. The map's labels, each read as a whole name:

- Streets: MARKET STREET, Abbey Road, Tanner’s Lane, Station Avenue; the curved road QUAYSIDE WALK; the river River Wend.
- Numbered markers, keyed by the legend: 1 Tourist Information, 2 St Bride’s Abbey, 3 Wendbury Museum, 4 Covered Market, 5 Railway Station, 6 Ferry Pier.

What the drawing shows (only visible in the render): Tanner’s Lane runs diagonally from Abbey Road
north of Market Street towards the east end of Market Street, passing the Wendbury Museum (3); Station
Avenue leads from the east end of Market Street (by the Covered Market, 4) down to the Railway
Station (5); the Ferry Pier (6) is on Quayside Walk, on the River Wend.

## Questions an agent should be able to answer

1. What number marks the Wendbury Museum? — 3
2. What are the names of the curved road and of the river? — Quayside Walk; the River Wend
3. Which street names appear on the map? — Market Street, Abbey Road, Tanner’s Lane, Station Avenue, Quayside Walk
4. Which street leads to the Railway Station? — Station Avenue (from the east end of Market Street) — only in the drawing
5. What distance does the scale bar show? — 200 m

Questions 1, 2, 3 and 5 are answerable from `read.md`: the straight street names, rotated or not, come
back whole (`Tanner’s Lane`, `Station Avenue`, `Abbey Road`), and so do the two names set along the
curve one glyph per text object (`QUAYSIDE WALK`, `River Wend`, #307), each one run in curve order
with a bbox over every glyph; the legend lines carry their numbers except one.

**Known gap (#265):** the page has no warning. The legend is split around the map's labels (entries
1–2 before them, 3–6 after) and entry 5 comes apart (`Railway Station` / `5`). The map's own markers
are bare numbers among street names, and question 4 — which street leads where — exists only in the
drawing; nothing points the agent to render it (the page is far below `dense_vector_graphics`).
