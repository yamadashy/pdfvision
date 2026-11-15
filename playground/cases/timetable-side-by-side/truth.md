# Bus timetable, two grids side by side

- **Stresses:** two independent grids sharing row baselines; dot leaders; rotated trip-number headers; times written column by column; blank and — cells; footnote symbols; bold for p.m.
- **Families:** tables, vertical-rotated
- **Status:** known-gap

**Route 14 — Harbour Station – Northgate Terminal**, NORTHBOUND. Effective September 7, 2026.

Two separate grids for the same stops. A correct reading keeps each time under its own trip and
its own grid; the weekend grid's times must never be read as weekday trips. p.m. times are set in
bold on the page (written `pm` here); `—` means the trip skips the stop; an empty cell means the trip
does not run that far.

_MONDAY TO FRIDAY_

| Stop | 1401 | 1403 | 1405 | 1407 | 1409 | 1411 | 1413 | 1415 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Harbour Station | 6:05 | 6:35 | 7:05§ | 7:20 |  | 12:05 pm | 3:25 pm§ | 5:35 pm |
| Customs House | 6:08 | 6:38 | 7:08 | 7:23 |  | 12:08 pm | 3:28 pm | 5:38 pm |
| Mill Street | 6:12 | 6:42 | 7:12 | 7:27 | 7:42 | 12:12 pm | 3:32 pm | 5:42 pm |
| Quarry Road ‡ | 6:16 | 6:46 | 7:16 | — | 7:46 | 12:16 pm | 3:36 pm | 5:46 pm |
| St Brendan’s Hospital | 6:20 | 6:50 | 7:20 | 7:31 | 7:50 | 12:20 pm | 3:40 pm | 5:50 pm |
| Linden Park | 6:24 | 6:54 | 7:24 | — | 7:54 | 12:24 pm | 3:44 pm | 5:54 pm |
| Ferris Lane School | 6:28 | 6:58 | 7:28 | 7:39 | 7:58 | 12:28 pm | 3:48 pm | 5:58 pm |
| Ashgrove Shops | 6:32 | 7:02 | 7:32 | 7:43 | 8:02 | 12:32 pm | 3:52 pm | 6:02 pm |
| Northgate Library | 6:38 | 7:08 | 7:38 | 7:49 | 8:08 | 12:38 pm | 3:58 pm | 6:08 pm |
| Northgate Terminal | 6:42 | 7:12 | 7:42 | 7:53 | 8:12 | 12:42 pm | 4:02 pm | 6:12 pm |

_SATURDAY, SUNDAY & HOLIDAYS_

| Stop | 1501 | 1503 | 1505 | 1507 | 1509 | 1511 | 1513 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Harbour Station | 8:15 |  | 10:15 | 12:15 pm | 2:15 pm | 4:15 pm | 6:15 pm |
| Customs House | 8:18 |  | 10:18 | 12:18 pm | 2:18 pm | 4:18 pm | 6:18 pm |
| Mill Street | 8:22 | 9:52 | 10:22 | 12:22 pm | 2:22 pm | 4:22 pm | 6:22 pm |
| Quarry Road ‡ | 8:26 | 9:56 | 10:26 | 12:26 pm | 2:26 pm | 4:26 pm | 6:26 pm |
| St Brendan’s Hospital | 8:30 | 10:00 | 10:30 | 12:30 pm | 2:30 pm | 4:30 pm | 6:30 pm |
| Linden Park | 8:34 | 10:04 | 10:34 | 12:34 pm | 2:34 pm | 4:34 pm | 6:34 pm |
| Ferris Lane School | 8:38 | 10:08 | 10:38 | 12:38 pm | 2:38 pm | 4:38 pm | 6:38 pm |
| Ashgrove Shops | 8:42 | 10:12 | 10:42 | 12:42 pm | 2:42 pm | 4:42 pm | 6:42 pm |
| Northgate Library | 8:48 | 10:18 | 10:48 | 12:48 pm | 2:48 pm | 4:48 pm | 6:48 pm |
| Northgate Terminal | 8:52 | 10:22 | 10:52 | 12:52 pm | 2:52 pm | 4:52 pm |  |

§ Runs on school days only; serves Ferris Lane School. ‡ Request stop: signal the driver. — Bus does not stop here. Blank: trip begins or ends at another stop. Times in bold are p.m.

## Questions an agent should be able to answer

1. On a weekday, when does the bus that leaves Harbour Station at 7:05 reach Northgate Terminal? — 7:42
2. What is the first bus from Mill Street on a Saturday? — 8:22 (trip 1501)
3. Does weekday trip 1407 stop at Quarry Road? — No (— in that cell); it also skips Linden Park
4. Which weekday trips run on school days only? — 1405 (7:05) and 1413 (3:25 pm)
5. When is the last weekend bus to Northgate Library, and does it continue to the terminal? — 6:48 pm; no, trip 1513 ends at Northgate Library

Every question can be worked out from `read.md`, but only by counting positions in column lists
and with no warning that this is necessary; nothing marks the bold p.m. times.

**Known gap (no issue yet):** the page has no warnings at all.
- The single layout table (9 × 11) fuses the two grids into one, drops the `Harbour Station` row and
  the rotated trip-number header, and merges trip columns into one cell where a column starts with
  blanks or the grids' columns crowd: the weekday `1409` and `1411` times share one cell
  (`7:42 12:12`), and from `St Brendan’s Hospital` down the weekend trips 1501–1507 collapse into one
  cell (`| 8:30 10:00 10:30 12:30 | |`) while above it they are split differently
  (`| 8:22 | 9:52 10:22 12:22 |`). Reading that table by column gives wrong trip/time pairs.
- The body gives every trip number first (both grids' headers, interleaved with the agency name
  and phone line), then each grid stop by stop: the stop name with its first times, then the rest
  of that stop's row (`Customs House … 6:08 6:38 7:08` / `7:23` / `12:08` / `3:28` / `5:38`). A stop
  served by fewer trips has fewer times, and nothing says which trip a lone time belongs to; it used
  to give each trip as a column list headed by its trip number. Question 2 needs the weekend row
  of the stop, read left to right.
- Bold is lost, so the p.m. legend (`Times in bold are p.m.`) cannot be applied: `5:35` and `6:15`
  read the same as the a.m. times (question 5's “pm” comes only from the order of the trips).
