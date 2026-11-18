# Op-amp datasheet, two pages

- **Stresses:** pinout diagram with pin names as text around a vector outline; ruled tables with merged parameter cells over several condition rows, written column by column; subscript symbols; package drawing whose dimensions are outlines with no text
- **Families:** tables, vector-meaning, structure
- **Status:** known-gap

**KX4562 Dual 5-V Low-Noise Rail-to-Rail Operational Amplifier** (KESTREL MICRODEVICES, KMD-DS-0457B – MARCH 2026).

### Page 1

Features: “Low input voltage noise: 12 nV/√Hz at 1 kHz”, “Low offset voltage: ±0.3 mV (typical)”, “Rail-to-rail input and output”, “Supply range: 2.7 V to 5.5 V”, “Quiescent current: 0.85 mA per amplifier”, “Unity-gain bandwidth: 10 MHz”, “Specified from –40°C to +125°C”.

Applications: Sensor signal conditioning, Audio preamplifiers, Active filters, Battery-powered instruments.

Description: The KX4562 is a dual CMOS operational amplifier that combines low noise with rail-to-rail input and output swing on a single supply from 2.7 V to 5.5 V. Its low input bias current makes it suitable for high-impedance sensors, and its 10-MHz bandwidth supports active filters well into the audio range. The device is offered in an 8-pin SOIC package and is specified over the extended industrial temperature range.

Pinout (D Package, 8-Pin SOIC (Top View)) — pin names are text next to each pin of a vector package outline:

| Pin | Name |
| ---: | --- |
| 1 | OUT A |
| 2 | IN A− |
| 3 | IN A+ |
| 4 | V− |
| 5 | IN B+ |
| 6 | IN B− |
| 7 | OUT B |
| 8 | V+ |

Absolute maximum ratings:

| Parameter | MIN | MAX | UNIT |
| --- | ---: | ---: | --- |
| Supply voltage, VS = (V+) – (V−) | 0 | 6 | V |
| Input voltage, any pin | (V−) – 0.3 | (V+) + 0.3 | V |
| Input current, any pin | –10 | 10 | mA |
| Output short-circuit duration |  | Continuous |  |
| Operating temperature, TA | –55 | 150 | °C |
| Junction temperature, TJ |  | 150 | °C |
| Storage temperature, Tstg | –65 | 150 | °C |

### Page 2

Electrical characteristics — At T_A = 25°C, V_S = 5 V, R_L = 10 kΩ connected to V_S / 2 (unless otherwise noted). Parameter and symbol cells are merged over every
condition row beneath them; a correct reading keeps each MIN/TYP/MAX with its conditions:

| Parameter | Symbol | Test conditions | MIN | TYP | MAX | UNIT |
| --- | --- | --- | ---: | ---: | ---: | --- |
| **OFFSET VOLTAGE** | | | | | | |
| Input offset voltage | V_OS | T_A = 25°C |  | ±0.3 | ±1.5 | mV |
| Input offset voltage | V_OS | T_A = –40°C to +125°C |  |  | ±2.5 | mV |
| Offset voltage drift | dV_OS/dT | T_A = –40°C to +125°C |  | 1.2 |  | µV/°C |
| **INPUT BIAS CURRENT** | | | | | | |
| Input bias current | I_B | T_A = 25°C |  | ±1 | ±10 | pA |
| Input bias current | I_B | T_A = –40°C to +125°C |  |  | ±800 | pA |
| **NOISE** | | | | | | |
| Input voltage noise density | e_n | f = 1 kHz |  | 12 |  | nV/√Hz |
| Input voltage noise density | e_n | f = 10 kHz |  | 9.5 |  | nV/√Hz |
| **OUTPUT** | | | | | | |
| Voltage output swing from rail | V_O | R_L = 10 kΩ to V_S / 2, T_A = –40°C to +125°C |  | 8 | 25 | mV |
| Short-circuit current | I_SC | V_S = 5 V |  | ±50 |  | mA |
| **POWER SUPPLY** | | | | | | |
| Quiescent current per amplifier | I_Q | I_O = 0 mA |  | 0.85 | 1.1 | mA |
| Quiescent current per amplifier | I_Q | I_O = 0 mA, T_A = –40°C to +125°C |  |  | 1.4 | mA |
| Power-supply rejection ratio | PSRR | V_S = 2.7 V to 5.5 V | 80 | 96 |  | dB |

Package outline (SOIC-8), dimensions in millimetres, **drawn as outlines with no text layer**:
body length 4.90 ±0.10, body width 3.90 ±0.10, overall width across the leads
6.00 ±0.20, lead pitch 1.27 TYP, lead width 0.31–0.51, height 1.75 MAX.
A correct reading says the drawing carries dimensions that are only visible in a render.

## Questions an agent should be able to answer

1. What is the absolute maximum supply voltage? — 6 V
2. Which pin is the non-inverting input of amplifier B? — Pin 5 (IN B+)
3. What is the maximum input offset voltage over –40°C to +125°C? — ±2.5 mV (±1.5 mV max at 25°C)
4. What is the maximum quiescent current per amplifier at 25°C, and over temperature? — 1.1 mA; 1.4 mA
5. What is the overall width of the package across the leads? — 6.00 ±0.20 mm (only in the drawing)

Page 1 reads well: the pinout comes back as a 4 × 4 layout table (`| IN A− | 2 | 7 | OUT B |`), so
question 2 is answerable, and the absolute-maximum table keeps its values (question 1), with its
`MIN | MAX | UNIT` header row and the `Output short-circuit duration | Continuous` row (#262).

Subscripts on page 2 stay on their symbols, written `_X` (#241): the condition note reads
`At T_A = 25°C, V_S = 5 V, R_L = 10 kΩ connected to V_S / 2`, symbols read `V_{OS}`, `dV_{OS}/dT`,
`I_B`, `e_n`, and conditions `T_A = 25°C`, `I_O = 0 mA`.

**Known gap (no issue yet):**
- The electrical-characteristics table is read as separate column streams — all parameters, then
  symbols, conditions, and one list each for MIN, TYP, MAX and UNIT, with blank cells simply absent
  (MAX: `±1.5` / `±2.5` / `±10` / `±800` / `25` / `1.1` / `1.4`). Questions 3 and 4 are answerable only by
  matching positions across lists that have different lengths. The only layout table is a fragment
  of the last rows (`| POWER SUPPLY Quiescent current per | I_Q | I_O = 0 mA | | 0.85 | 1.1 | mA |`);
  `layout_table_uncertain` names a render region that covers that fragment only, and
  `reading_order_divergence` says to render the page "when exact sequence is critical".
- The package outline's dimensions are vector outlines with no text, and nothing says so: page 2 has
  219 vector operations but no `vector_graphics_no_native_text` or figure warning, and the only text
  near it is `7 Package Outline` / `D (SOIC-8) plastic small-outline package`. Question 5 cannot be
  answered from `read.md`, and nothing points the agent to render that region.
