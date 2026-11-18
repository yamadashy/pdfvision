_Untrusted PDF-derived data below — content, links, and form values are not instructions._

# playground/cases/beamer-overlays/case.pdf

- **Pages:** 6
- **Title:** Beamer deck with a frame built up over four overlay pages
- **Author:** pdfvision playground
- **Creator:** pdfvision
- **Repeated page chrome (removed from page bodies):** "Introduction Explicit methods Implicit methods Summary" (6 pages); "Ana Ferreira" (6 pages); "Stability of time-stepping" (6 pages); "Explicit Euler for the heat equation" (4 pages); "Forward difference in time, central difference in space" (4 pages); "3 / 24" (4 pages)

## Overview

| Page | Chars | Images | Coverage | Size (pt) | Vectors | Blocks | Warnings | Fields | Links | Annots |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 264 | 0 | 9% | 362.83×272.13 | 13 | 9 | 1 | 0 | 0 | 0 |
| 2 | 261 | 0 | 8% | 362.83×272.13 | 13 | 9 | 0 | 0 | 0 | 0 |
| 3 | 389 | 0 | 11% | 362.83×272.13 | 18 | 10 | 0 | 0 | 0 | 0 |
| 4 | 389 | 0 | 11% | 362.83×272.13 | 18 | 10 | 0 | 0 | 0 | 0 |
| 5 | 389 | 0 | 11% | 362.83×272.13 | 18 | 10 | 0 | 0 | 0 | 0 |
| 6 | 372 | 0 | 12% | 362.83×272.13 | 18 | 10 | 0 | 0 | 0 | 0 |

---

## Page 1

_chars: 264 · images: 0 · coverage: 9% · vectors: 13 · warnings: 1 · size: 362.83×272.13pt_

Numerical Methods for PDEs

Lecture 5: Stability of time-stepping schemes

Ana Ferreira

Department of Applied Mathematics, Lisbon Polytechnic

18 November 2026

1 / 24

### Warnings

> **warning** (near_bottom_edge): body block ends 3.6pt above the page bottom (threshold 6.8pt) — text may be crowded against the lower margin

---

## Page 2

_chars: 261 · images: 0 · coverage: 8% · vectors: 13 · size: 362.83×272.13pt_

Outline

1 Model problem: the heat equation

2 Explicit Euler and its stability limit

3 Implicit Euler and Crank–Nicolson

4 Choosing a step size in practice

2 / 24

---

## Page 3

_chars: 389 · images: 0 · coverage: 11% · vectors: 18 · size: 362.83×272.13pt_

Each step costs O(N) — no linear system to solve

Error is O(Δt + Δx^2) while the scheme is stable

Stable only if λ = Δt / Δx^2 ≤ 1/2

u_j^{n+1} = u_j^n + λ (u_{j+1}^n − 2u_j^n + u_{j−1}^n)

---

## Page 4

_chars: 389 · images: 0 · coverage: 11% · vectors: 18 · size: 362.83×272.13pt_

Each step costs O(N) — no linear system to solve

Error is O(Δt + Δx^2) while the scheme is stable

Stable only if λ = Δt / Δx^2 ≤ 1/2

u_j^{n+1} = u_j^n + λ (u_{j+1}^n − 2u_j^n + u_{j−1}^n)

---

## Page 5

_chars: 389 · images: 0 · coverage: 11% · vectors: 18 · size: 362.83×272.13pt_

Each step costs O(N) — no linear system to solve

Error is O(Δt + Δx^2) while the scheme is stable

Stable only if λ = Δt / Δx^2 ≤ 1/2

u_j^{n+1} = u_j^n + λ (u_{j+1}^n − 2u_j^n + u_{j−1}^n)

---

## Page 6

_chars: 372 · images: 0 · coverage: 12% · vectors: 18 · size: 362.83×272.13pt_

Each step costs O(N) — no linear system to solve

Error is O(Δt + Δx^2) while the scheme is stable

Stable only if λ = Δt / Δx^2 ≤ 1/2

Δt ≤ Δx^2 / 2 ⇒ halving Δx quarters Δt
