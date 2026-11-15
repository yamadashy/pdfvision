# Gantt project schedule with status-coloured bars and a today line

- **Stresses:** task table whose right half is a week grid; durations, forecast slip, status, progress, milestones, today line and dependencies exist only as vector shapes
- **Families:** vector-meaning, tables
- **Status:** known-gap

One Letter landscape page: **Cobalt Ridge Health — Patient Portal Relaunch — Project Schedule**, Project manager: Renata Solis, Schedule v7.
Footer `Cobalt Ridge Health  |  PMO  |  Internal` and `Page 1 of 1`.

The left half is a table (ID, Task, Owner, Plan start, Plan end). The right half is a timescale of
16 week columns headed by month (Sep–Dec 2026) and week-start date (9/7 … 12/21).
Everything in the last column below exists **only as shapes**: bar extent, colour, progress strip,
◆ milestones, a dashed red vertical **Today** line (no date printed on it), and dependency arrows.
The legend at the bottom explains the colours: Done, On track, At risk, Late, plus Progress, Milestone, Today and Dependency.

| ID | Task | Owner | Plan start | Plan end | Bar (shapes only) |
| --- | --- | --- | --- | --- | --- |
| **1** | **Discovery** | | | | summary bar Sep 7–Sep 25 |
| 1.1 | Stakeholder interviews | P. Nair | 9/7/26 | 9/18/26 | Sep 7–Sep 18, Done, 100% done |
| 1.2 | Current-state audit | J. Brandt | 9/14/26 | 9/25/26 | Sep 14–Sep 25, Done, 100% done |
| 1.3 | Requirements sign-off | R. Solis | 9/25/26 | 9/25/26 | ◆ milestone, Done |
| **2** | **Design** | | | | summary bar Sep 21–Oct 23 |
| 2.1 | UX wireframes | M. Lindqvist | 9/21/26 | 10/9/26 | Sep 21–Oct 9, Done, 100% done |
| 2.2 | Visual design system | A. Tanaka | 9/28/26 | 10/23/26 | Sep 28–Oct 23, Done, 100% done |
| 2.3 | Design review | R. Solis | 10/23/26 | 10/23/26 | ◆ milestone, Done |
| **3** | **Build** | | | | summary bar Oct 5–Nov 27 |
| 3.1 | API integration | D. Okafor | 10/12/26 | 11/20/26 | Oct 12–Nov 20, On track, 50% done |
| 3.2 | Data migration | S. Kowalski | 10/5/26 | 10/30/26 | Oct 5–Nov 13, Late, 40% done |
| 3.3 | Secure messaging module | L. Haddad | 10/19/26 | 11/27/26 | Oct 19–Nov 27, At risk, 15% done |
| 3.4 | Appointment scheduling | D. Okafor | 10/26/26 | 11/27/26 | Oct 26–Nov 27, On track, 10% done |
| 3.5 | Accessibility audit | A. Tanaka | 11/9/26 | 11/20/26 | Nov 9–Nov 20, On track, 0% done |
| **4** | **Test & launch** | | | | summary bar Nov 23–Dec 25 |
| 4.1 | QA regression | QA team | 11/23/26 | 12/4/26 | Nov 23–Dec 4, On track, 0% done |
| 4.2 | Penetration test | Vendor (TBD) |  |  | Nov 30–Dec 11, At risk, 0% done |
| 4.3 | User acceptance testing | J. Brandt | 12/7/26 | 12/18/26 | Dec 7–Dec 18, On track, 0% done |
| 4.4 | Go-live | R. Solis | 12/18/26 | 12/18/26 | ◆ milestone, On track |
| 4.5 | Hypercare | Support |  |  | Dec 21–Dec 25, On track, 0% done |

Two tasks (Penetration test, Hypercare) have blank date cells; their schedule is the bar alone. **Data migration** is
planned to end 10/30/26 (text), but its red bar now runs to
Nov 13 — the slip is visible only on the timescale.

The Today line falls on Wednesday Oct 28 (week of 10/26), three working
days after the Design review milestone (Oct 23) and seven weeks before Go-live
(Dec 18).

Dependency arrows (finish → start): Requirements sign-off → UX wireframes; Design review → Appointment scheduling; API integration → QA regression; QA regression → User acceptance testing; User acceptance testing → Go-live.

## Questions an agent should be able to answer

1. Which tasks are under way in the week of 11/9? — API integration, Data migration, Secure messaging module, Appointment scheduling, Accessibility audit (bars only; Data migration's plan dates say it ended earlier)
2. Which task is late, and which are at risk? — late: Data migration; at risk: Secure messaging module, Penetration test (colour only)
3. Where does the Today line fall relative to the Design review milestone? — just after it: the milestone is on Oct 23, Today is in the following week (Wed Oct 28)
4. When is Data migration now expected to finish? — Nov 13, two weeks after its planned Oct 30 (bar only)
5. What has to finish before QA regression can start? — API integration (dependency arrow only)

**Known gap (no issue yet):** the page raises no warning (117 vector ops, no
`dense_vector_graphics`, nothing saying that colour or bar extent carries data), so an agent has
no reason to render it, and the text alone answers the bar-only questions wrongly or not at all:

- Question 1 is answered from the plan dates, which drop Data migration (`10/5/26 | 10/30/26`)
  from the week of 11/9; its forecast bar runs through it.
- Question 2: no status appears anywhere in the text; the legend (`Done / On track / At risk / Late`)
  is printed with nothing to attach it to.
- Question 4 is answered wrongly as the plan end `10/30/26`.
- Question 5: dependency arrows leave no trace; an agent can only guess from dates.
- Question 3 is recoverable by luck of the stream order: `Today` is emitted between the week
  headers `10/26` and `11/2`, after `2.3 | Design review | R. Solis | 10/23/26 | 10/23/26`.

The layout table (`Table 1 (21 rows × 5 columns)`) now holds every phase and task row through
4.5, the tasks without dates included (`4.2 | Penetration test | Vendor (TBD)`), so the plan dates
can be read per task; fixed in #262, before which it stopped after row 3.5 with no note. Its header
row reads `ID | Task | Owner | Plan start Plan end`: the last two header labels are one line from
line building, so the end-date column is unnamed. In the page body the Plan start / Plan end
values come back as two column lists that skip the blank cells of Penetration test and Hypercare, so aligning them to the task list by position shifts the dates of every task
after QA regression (Penetration test would get UAT's `12/7/26`); the layout table does not.
