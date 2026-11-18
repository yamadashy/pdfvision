# Filled-in health questionnaire (問診票) whose answers are drawn marks

- **Stresses:** no form fields; yes/no answers as ticks stroked over □ boxes; single choices as filled ○ among empty ones; a five-point scale grid with one filled circle per row; option labels all present as text; free-text answers as ordinary text
- **Families:** vector-meaning, interactive, scripts
- **Status:** ok
- **Showcase:** Every option label is text and the answers are only strokes — a tick over a □, a dot in a ○ — so the text alone reads as a blank form; a rating grid has no text beside its circles at all.

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

Fixed in #303: the drawn answers are reported as content. `### Choice marks` gives one row per row
of boxes — the question at its left, the marked option, the options left empty — so every question
above is answered from it: `(3) これまでに手術を受けたことがありますか | いいえ | はい`,
`喫煙 | 以前吸っていた | 吸わない / 吸う(1日 本)`, and the rating grid by its column headings
(`夜、眠りにつきにくい | ときどき | まったくない / あまりない / どちらとも / よくある`). A tick is a stroked
open V with its longer arm rising right, a selected circle holds a filled dot; the boxes and circles carry
no text.

The body reads sections 1 and 2 row by row, each question or habit on one line with its options
(`(2) 薬や食べ物でアレルギーが出たことがありますか はい いいえ 内容:ペニシリン系の抗生物質`, #301); the choice
table does not depend on that order.
