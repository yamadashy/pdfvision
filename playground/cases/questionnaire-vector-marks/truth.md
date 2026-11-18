# Filled-in health questionnaire (問診票) whose answers are drawn marks

- **Stresses:** no form fields; yes/no answers as ticks stroked over □ boxes; single choices as filled ○ among empty ones; a five-point scale grid with one filled circle per row; option labels all present as text; free-text answers as ordinary text
- **Families:** vector-meaning, interactive, scripts
- **Status:** known-gap

One A4 page, a completed questionnaire. Patient: 佐倉 みのり, born 1988年4月12日, filled in 2026年11月18日.
All options are printed; the answers are only marks (a tick over a □, a filled ○). A correct reading
reports which option is marked:

**1. はい／いいえ**
- (1) 現在、治療中の病気がありますか — **はい**（高血圧（内服中））
- (2) 薬や食べ物でアレルギーが出たことがありますか — **はい**（ペニシリン系の抗生物質）
- (3) これまでに手術を受けたことがありますか — **いいえ**
- (4) 妊娠中、または妊娠の可能性がありますか — **いいえ**
- (5) 最近3か月で体重が3kg以上変わりましたか — **はい**（約4kg減少）

**2. 生活習慣** (one filled ○ per row)
- 喫煙 — **以前吸っていた**
- 飲酒 — **週3〜5日**
- 運動習慣 — **ほとんどしない**

**3. この1か月の状態** (scale: まったくない / あまりない / どちらとも / ときどき / よくある)
- 夜、眠りにつきにくい — **ときどき**
- 日中に強い眠気がある — **あまりない**
- 食欲がない — **まったくない**
- 気分が落ち込む — **どちらとも**

## Questions an agent should be able to answer

1. Does the patient have an allergy, and to what? — Yes, to penicillin-class antibiotics
2. Has the patient had surgery? — No
3. What is the patient's smoking status? — 以前吸っていた (former smoker)
4. How often does the patient drink? — 週3〜5日
5. How often does the patient have trouble falling asleep at night? — ときどき
6. Could the patient be pregnant? — No (いいえ)

**Known gap (no issue yet):** no answer except the free text survives, and nothing on the page
warns. The ticks and filled circles leave no trace, so every option reads as equally present:
questions 2–6 have no answer (question 1 is answered only through the free-text `内容:ペニシリン系の
抗生物質`). The layout makes it worse: section 1 is read column by column — the five questions, then
`はい` ×5, `いいえ` ×5 and the `内容:` answers — with section 2's options interleaved by column
(`吸わない` / `飲まない` / `以前吸っていた` / `週1〜2日` / …) and spliced between them, so even the
row an option belongs to is lost; the scale grid's five headings come before its four rows with no
cells. A reader that assumes "nothing marked" would also be wrong: the form is complete.
