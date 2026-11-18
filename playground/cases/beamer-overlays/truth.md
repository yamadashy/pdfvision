# Beamer deck with a frame built up over four overlay pages

- **Stresses:** 4:3 pages; overlay pages whose unrevealed items are drawn at 15% opacity; an \only formula swap on the last overlay; repeated navigation bar and footer with a frame counter that does not advance
- **Families:** hidden-overlap, page-geometry, structure
- **Status:** ok
- **Showcase:** every overlay page carries the text of all four items, the unrevealed ones only drawn at 15% opacity, and the content shared by the steps of one frame looks like repeated page chrome

Six PDF pages, three frames. Every page has the section navigation bar (Introduction · Explicit methods · Implicit methods · Summary)
and a footer: Ana Ferreira | Stability of time-stepping | frame counter.

- **Page 1** (frame 1 / 24) — title frame: Numerical Methods for PDEs; Lecture 5: Stability of time-stepping schemes; Ana Ferreira, Department of Applied Mathematics, Lisbon Polytechnic; 18 November 2026.
- **Page 2** (frame 2 / 24) — “Outline”: Model problem: the heat equation; Explicit Euler and its stability limit; Implicit Euler and Crank–Nicolson; Choosing a step size in practice.
- **Pages 3–6** (all frame 3 / 24) — “Explicit Euler for the heat equation”, built up over 4 overlays.
  Every overlay page contains the text of all four items; the ones not yet revealed are drawn at
  15% opacity and are not visible to a reader as content. What a reader sees:

  - Page 3 (overlay 1): items “Forward difference in time, central difference in space”; formula `u_j^{n+1} = u_j^n + λ (u_{j+1}^n − 2u_j^n + u_{j−1}^n)`.
  - Page 4 (overlay 2): items “Forward difference in time, central difference in space”, “Each step costs O(N) — no linear system to solve”; formula `u_j^{n+1} = u_j^n + λ (u_{j+1}^n − 2u_j^n + u_{j−1}^n)`.
  - Page 5 (overlay 3): items “Forward difference in time, central difference in space”, “Each step costs O(N) — no linear system to solve”, “Error is O(Δt + Δx²) while the scheme is stable”; formula `u_j^{n+1} = u_j^n + λ (u_{j+1}^n − 2u_j^n + u_{j−1}^n)`.
  - Page 6 (overlay 4): items “Forward difference in time, central difference in space”, “Each step costs O(N) — no linear system to solve”, “Error is O(Δt + Δx²) while the scheme is stable”, “Stable only if λ = Δt / Δx² ≤ 1/2”; formula `Δt ≤ Δx²/2 ⇒ halving Δx quarters Δt`.

A correct reading tells the overlay pages apart: which items each page shows (and that the
faint ones are not yet shown), and that the formula changes on page 6.

## Questions an agent should be able to answer

1. How many slides does the excerpt contain, and how do they map to pages? — three frames over six pages; pages 3–6 are one frame revealed in four steps
2. Which bullet points can the audience see on page 4? — the first two: “Forward difference in time, central difference in space” and “Each step costs O(N) — no linear system to solve”
3. What formula is shown under the list on page 6, and what did pages 3–5 show there instead? — `Δt ≤ Δx²/2 ⇒ halving Δx quarters Δt`; the update rule `u_j^{n+1} = u_j^n + λ (u_{j+1}^n − 2u_j^n + u_{j−1}^n)`
4. What is the stability condition for explicit Euler? — λ = Δt/Δx² ≤ 1/2
5. What frame number does the footer show on page 5? — 3 / 24

**Reads correctly, the faint items flagged (#270):** pages 3, 4 and 5 still carry the text of every
item (it is in the file), but each names the items still faint on that step in a `faint_text`
warning — page 3 the last three, page 4 `Error is O(Δt + Δx2) …` and `Stable only if λ = Δt / Δx2 ≤ 1/2`,
page 5 the last one, page 6 none — "usually an item not yet revealed on this overlay step", with a
bbox each, so question 2 is answered: page 4 shows the first two. The four overlay pages are
recognised as steps of one frame for the chrome pass, so what they share is their body: the frame
title, the first item and the `3 / 24` counter stay in every one of pages 3–6, and only the
navigation bar, author and talk title (on all three frames) are stripped and named once in the
header (question 5). Nothing states the overlay grouping in words, but the identical title and
counter on pages 3–6 plus the warning give question 1. Question 3 is answered by comparing pages:
page 6 ends `Δt ≤ Δx^2 / 2 ⇒ halving Δx quarters Δt`, pages 3–5 with the update rule
`u_j^{n+1} = u_j^n + λ (u_{j+1}^n − 2u_j^n + u_{j−1}^n)` (#241). Question 4 is answered from the
last item.
