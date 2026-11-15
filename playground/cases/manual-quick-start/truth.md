# Kettle quick-start sheet with exploded drawing and step table

- **Stresses:** vector exploded drawing with numbered callouts and leader lines; parts list keyed by number; step table with large numerals in dark cells drawn as their own layer; warning box with vector icon; one sentence in English, Japanese and French
- **Families:** vector-meaning, tables, reading-order, scripts
- **Status:** known-gap

One A4 quick-start sheet: **Brightwell KT-17 Electric Kettle** (Model KT-17  ·  1.7 L  ·  220–240 V ~ 50/60 Hz  ·  2000 W).

**Diagram (vector only).** An exploded line drawing of the kettle with eight numbered black callout
circles joined to the parts by leader lines. The drawing itself carries no text; the callout
digits are text, scattered around the drawing (2, 5, 6, 7 on the left; 1, 3, 4, 8 on the right).
What each number names comes from the parts list beside it:

1. Lid
2. Lid release button
3. Removable limescale filter
4. Kettle body
5. Water level window (MIN 0.5 L / MAX 1.7 L)
6. Power switch with indicator light
7. 360° power base
8. Power cord (stores under the base)

**Getting started.** A two-column table: each row has a dark cell with a large white step numeral
and a cell with a capitalised title and one instruction. The numeral column is drawn as its own
layer, before the row text, as DTP layouts often emit it; a correct reading still pairs each
numeral with its own title and instruction, in order:

| Step | Title | Instruction |
| ---: | --- | --- |
| 1 | REMOVE ALL PACKAGING | Take the limescale filter (3) out of the spout, rinse it and the inside of the kettle body (4) with clean water, then refit the filter. |
| 2 | SET UP THE BASE | Place the power base (7) on a dry, level surface away from the edge of the worktop. Unwind only as much power cord (8) as you need. |
| 3 | FILL WITH WATER | Press the lid release button (2) to open the lid (1). Fill to between MIN (0.5 L) and MAX (1.7 L) on the water level window (5), then close the lid. |
| 4 | SWITCH ON | Seat the kettle on the base and press the power switch (6) down. The light comes on, and the kettle switches off by itself when the water boils. |
| 5 | DISCARD THE FIRST TWO BOILS | Before first use, boil a full kettle and pour the water away. Repeat once more; after that the kettle is ready for drinks. |

**Warning box** (yellow triangle with an exclamation mark, vector only): WARNING — Risk of scalding.
Never open the lid while the water is boiling or lift the kettle off the base mid-boil. Do not fill above MAX: boiling water may be ejected from the spout.

**Safety sentence in three languages:**

- EN: Unplug the base before cleaning and never immerse it in water.
- JA: お手入れの前に電源プラグを抜き、電源ベースを水に浸けないでください。
- FR: Débranchez le socle avant le nettoyage et ne le plongez jamais dans l’eau.

Footer: Brightwell Home Appliances Ltd.  ·  support.brightwell-home.example / QSG-KT17  Rev. B  09/2026.

## Questions an agent should be able to answer

1. What is part 6, and in which step is it used? — Power switch with indicator light; step 4 (SWITCH ON)
2. What do you do right after setting up the base? — Step 3, FILL WITH WATER: Press the lid release button (2) to open the lid (1). Fill to between MIN (0.5 L) and MAX (1.7 L) on the water level window (5), then close the lid.
3. Which part do you press to open the lid, and how much water may the kettle hold at most? — Part 2, the lid release button; 1.7 L (MAX)
4. What does the warning box tell you not to do? — Never open the lid while the water is boiling or lift the kettle off the base mid-boil. Do not fill above MAX: boiling water may be ejected from the spout.
5. What does the French safety line say, and does it match the English one? — “Débranchez le socle avant le nettoyage et ne le plongez jamais dans l’eau.” — yes, it is the same instruction as “Unplug the base before cleaning and never immerse it in water.”

**Known gap (no issue yet):** the warning box comes apart. `read.md` prints the heading
`WARNING — Risk of scalding` and then, directly under it, the three safety lines (`EN Unplug the base before cleaning and never immerse it in water.` …)
and the page footer (`Brightwell Home Appliances Ltd. · support.brightwell-home.example`); the box's own two sentences
(`Never open the lid while the water is boiling or lift the kettle off the base mid-boil.` / `Do not fill above MAX: boiling water may be ejected from the spout.`) come only after the footer, as the last body
text of the page. No warning fires. An agent answering question 4 from the text order takes the
unplug/immersion sentence as the scalding warning, and can mistake the real warning text for a
trailer below the footer.

Everything else reads correctly. The parts list keeps each number with its name, so question 1,
the part half of question 3 and the number references inside the steps resolve from text; the
callout digits themselves come out as a bare run (`2 5 6 7 1 3 4 8`, left side then right
side) with nothing on the drawing to map, which is harmless here because the drawing carries
no labels of its own. The step table survives its layer order: each numeral is printed right
before its own title and instruction, 1 to 5, so questions 1 and 2 are answered in order. The
Japanese and French lines, accents and `’` included, are intact (question 5).
