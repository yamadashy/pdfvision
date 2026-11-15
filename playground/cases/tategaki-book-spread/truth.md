# Vertical novel spread (縦組み見開き) with ruby

- **Stresses:** two vertical pages on one landscape sheet read right page first; columns right to left; ruby beside base kanji; 縦中横 numbers; vertical ―― and ……; chapter heading; running heads and kanji page numbers at the outer edges
- **Families:** vertical-rotated, reading-order, structure
- **Status:** known-gap

One 728 × 516 pt landscape page holding a two-page spread of a vertically set novel (縦組み).
Every glyph is its own horizontal-mode text object placed down the column (the common DTP form,
not an Identity-V vertical font); 、。「」ー…― use the font's vertical variants and the content
stream emits the text in reading order. The **right-hand page is read first** (p. 124),
then the left (p. 125); on each page the columns run right to left,
38 em boxes of 9 pt per column.

Page furniture: running head `汐見坂の灯` (vertical, top of the right page's outer edge) and
`三 灯台守の手紙` (top of the left page's outer edge); page numbers `一二四`
(bottom right) and `一二五` (bottom left), in kanji. A reading may drop them as
page chrome.

The right page opens chapter **三 灯台守の手紙** with a larger vertical heading in
the first 3 column slots, then the text. In reading order, one paragraph per line:

> 港の時計台が午後11時を打ったとき、澪はまだ埠頭の端に立っていた。風は昼間よりいくらか弱まり、沖のほうで漁火がひとつ、またひとつと消えていくのが見えた。
>
> 父が灯台を降りてから、もう12年になる。それなのに澪は、夜になるとこの場所へ足を運ぶ癖をやめられずにいた。
>
> 「こんな時間に、何をしているんだい」
>
> 振り返ると、外套の襟を立てた男が、古い街灯の下に立っていた。郵便局の嘱託をしている真鍋という老人で、澪が子どものころから、この町の手紙はほとんど彼の手を通っていた。
>
> 「灯りを見ていたんです。もう、ともらない灯りですけど」
>
> 「そうか……」
>
> 真鍋はしばらく黙っていたが、やがて外套の内ポケットから、角の擦り切れた封筒を一通取り出した。
>
> 「これをね、ずっと渡しそびれていた。宛名は君のお父さんだが――いや、読めばわかる」
>
> 封筒の消印は、父が灯台を去った年の冬のものだった。差出人の欄には、澪の知らない女の名前が、細い万年筆の字で書かれていた。
>
> 「どうして、今になって」
>
> 「今だから、さ。君ももう、あのころのお父さんと同じ年だろう」
>
> 澪は封筒を受け取った。紙は思っていたよりもずっと軽く、そのくせ、指先にいつまでも冷たさが残った。潮騒が足もとで寄せては返し、そのたびに、遠い灯台の白い壁がかすかに浮かんで見えるような気がした。
>
> 家に戻ると、澪は台所の明かりだけをつけて、食卓の上で封を切った。便箋は二枚あった。一枚目には、こう書かれていた。
>
> ――あなたが灯りを守っているあいだ、わたしはずっと、その光を数えていました。
>
> 澪は二枚目をめくろうとして、手を止めた。窓の外で、ないはずの光が一度だけ、海の上を掠めていった。

Ruby (small kana to the right of the base, not part of the running text):
澪（みお）、埠頭（ふとう）、漁火（いさりび）、嘱託（しょくたく）、真鍋（まなべ）、潮騒（しおさい）、掠（かす）. A good reading
keeps the base text intact and either drops the ruby or attaches it to its base — it must not
splice the kana into the sentence. `11` and `12` are 縦中横 (two digits set side by side inside
one em box) and read as one number each.

## Questions an agent should be able to answer

1. 澪に封筒を渡したのは誰で、どんな仕事をしている人か。 — 真鍋という老人で、郵便局の嘱託をしている
2. 父が灯台を降りてから何年になるか。 — 12年
3. 港の時計台が何時を打ったとき、澪は埠頭にいたか。 — 午後11時
4. 便箋の一枚目には何と書かれていたか。 — 「あなたが灯りを守っているあいだ、わたしはずっと、その光を数えていました。」
5. 「漁火」の読みは何か。 — いさりび

**Known gap (no issue yet):** the vertical columns are rebuilt and ruby is attached to its base
as `澪《みお》`, `漁火《いさりび》` (questions 1, 4 and 5 are answered from `read.md`), but every
glyph that is not CJK breaks its column: the 縦中横 numbers come back as bare `11` and `12` near
the end of the page, and the columns holding them are cut there — the text reads `時を打ったとき、
澪《みお》はまだ…` with `港の時計台が午後` moved below the chapter title, and
`父が灯台を降りてから、もう` … `年になる。それなのに澪は、…` far apart. The vertical ―― is
emitted as two stray `―` lines, cutting `宛名は君のお父さんだが` from `いや、読めばわかる` and
dropping the dash that opens the letter. The chapter heading splits into `三` (first line of the
page) and `灯台守の手紙` (mid-page). No warning is raised. Questions 2 and 3 cannot be answered
from `read.md` — the hours and years are there only as context-free numbers. `……` comes back
NFKC-normalised as `......`; that is intended.
