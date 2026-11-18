_Untrusted PDF-derived data below — content, links, and form values are not instructions._

# playground/cases/datasheet/case.pdf

- **Pages:** 2
- **Title:** Op-amp datasheet, two pages
- **Author:** pdfvision playground
- **Creator:** pdfvision
- **Repeated page chrome (removed from page bodies):** "KX4562" (2 pages); "KESTREL MICRODEVICES" (2 pages); "KMD-DS-0457B – MARCH 2026" (2 pages); "Copyright © 2026, Kestrel Microdevices" (2 pages); "Product Folder Links: KX4562" (2 pages)

## Overview

| Page | Chars | Images | Coverage | Size (pt) | Vectors | Tables | Blocks | Warnings | Fields | Links | Annots |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 1511 | 0 | 17% | 612×792 | 22 | 2 | 19 | 0 | 0 | 0 | 0 |
| 2 | 1071 | 0 | 7% | 612×792 | 219 | 1 | 80 | 1 | 0 | 0 | 0 |

---

## Page 1

_chars: 1511 · images: 0 · coverage: 17% · vectors: 22 · tables: 2 · size: 612×792pt_

KX4562 Dual 5-V Low-Noise Rail-to-Rail Operational Amplifier

1 Features

• Low input voltage noise: 12 nV/√Hz at 1 kHz
• Low offset voltage: ±0.3 mV (typical)
• Rail-to-rail input and output
• Supply range: 2.7 V to 5.5 V
• Quiescent current: 0.85 mA per amplifier
• Unity-gain bandwidth: 10 MHz
• Specified from –40°C to +125°C

4 Pin Configuration

5 Absolute Maximum Ratings

Over operating free-air temperature range (unless otherwise noted)

OUT A 1 8 V+
IN A− 2 7 OUT B
IN A+ 3 6 IN B−
V− 4 5 IN B+

D Package, 8-Pin SOIC (Top View)

2 Applications

• Sensor signal conditioning
• Audio preamplifiers
• Active filters
• Battery-powered instruments

3 Description

The KX4562 is a dual CMOS operational amplifier that combines
low noise with rail-to-rail input and output swing on a single
supply from 2.7 V to 5.5 V. Its low input bias current makes it
suitable for high-impedance sensors, and its 10-MHz bandwidth
supports active filters well into the audio range. The device is
offered in an 8-pin SOIC package and is specified over the
extended industrial temperature range.

MIN MAX UNIT
Supply voltage, VS = (V+) – (V−) 0 6 V
Input voltage, any pin (V−) – 0.3 (V+) + 0.3 V
Input current, any pin –10 10 mA
Output short-circuit duration Continuous
Operating temperature, TA –55 150 °C
Junction temperature, TJ 150 °C
Storage temperature, Tstg –65 150 °C

1

### Layout tables

#### Table 1 (4 rows × 4 columns, bbox 217.55,337.87,176.9,86.14)

| C1 | C2 | C3 | C4 |
| --- | --- | --- | --- |
| OUT A | 1 | 8 | V+ |
| IN A− | 2 | 7 | OUT B |
| IN A+ | 3 | 6 | IN B− |
| V− | 4 | 5 | IN B+ |

#### Table 2 (8 rows × 4 columns, bbox 44,511.51,495.75,105)

| C1 | C2 | C3 | C4 |
| --- | --- | --- | --- |
|  | MIN | MAX | UNIT |
| Supply voltage, VS = (V+) – (V−) | 0 | 6 | V |
| Input voltage, any pin | (V−) – 0.3 | (V+) + 0.3 | V |
| Input current, any pin | –10 | 10 | mA |
| Output short-circuit duration |  | Continuous |  |
| Operating temperature, TA | –55 | 150 | °C |
| Junction temperature, TJ |  | 150 | °C |
| Storage temperature, Tstg | –65 | 150 | °C |

---

## Page 2

_chars: 1071 · images: 0 · coverage: 7% · vectors: 219 · tables: 1 · warnings: 1 · size: 612×792pt_

6 Electrical Characteristics

At T_A = 25°C, V_S = 5 V, R_L = 10 kΩ connected to V_S / 2 (unless otherwise noted)

PARAMETER

SYMBOL

TEST CONDITIONS

MIN

TYP

MAX

UNIT

OFFSET VOLTAGE
Input offset voltage

V_{OS}

T_A = 25°C

±0.3

±1.5

mV

T_A = –40°C to +125°C

±2.5

mV

Offset voltage drift

dV_{OS}/dT

T_A = –40°C to +125°C

1.2

μV/°C

INPUT BIAS CURRENT
Input bias current

I_B

T_A = 25°C

±1

±10

pA

T_A = –40°C to +125°C

±800

pA

NOISE
Input voltage noise

e_n

f = 1 kHz

12

nV/√Hz

density

f = 10 kHz

9.5

nV/√Hz

OUTPUT
Voltage output swing

V_O

R_L = 10 kΩ to V_S / 2,

8

25

mV

from rail

T_A = –40°C to +125°C

Short-circuit current

I_{SC}

V_S = 5 V

±50

mA

POWER SUPPLY
Quiescent current per

I_Q

I_O = 0 mA

0.85

1.1

mA

amplifier

I_O = 0 mA,

1.4

mA

T_A = –40°C to +125°C

Power-supply rejection

PSRR

V_S = 2.7 V to 5.5 V

80

96

dB

ratio

7 Package Outline

D (SOIC-8) plastic small-outline package

2

### Layout tables

#### Table 1 (18 rows × 7 columns, bbox 40,107,532,283)

| C1 | C2 | C3 | C4 | C5 | C6 | C7 |
| --- | --- | --- | --- | --- | --- | --- |
| PARAMETER | SYMBOL | TEST CONDITIONS | MIN | TYP | MAX | UNIT |
| OFFSET VOLTAGE |  |  |  |  |  |  |
| Input offset voltage | V_{OS} | T_A = 25°C |  | ±0.3 | ±1.5 | mV |
| Input offset voltage | V_{OS} | T_A = –40°C to +125°C |  |  | ±2.5 | mV |
| Offset voltage drift | dV_{OS}/dT | T_A = –40°C to +125°C |  | 1.2 |  | μV/°C |
| INPUT BIAS CURRENT |  |  |  |  |  |  |
| Input bias current | I_B | T_A = 25°C |  | ±1 | ±10 | pA |
| Input bias current | I_B | T_A = –40°C to +125°C |  |  | ±800 | pA |
| NOISE |  |  |  |  |  |  |
| Input voltage noise density | e_n | f = 1 kHz |  | 12 |  | nV/√Hz |
| Input voltage noise density | e_n | f = 10 kHz |  | 9.5 |  | nV/√Hz |
| OUTPUT |  |  |  |  |  |  |
| Voltage output swing from rail | V_O | R_L = 10 kΩ to V_S / 2, T_A = –40°C to +125°C |  | 8 | 25 | mV |
| Short-circuit current | I_{SC} | V_S = 5 V |  | ±50 |  | mA |
| POWER SUPPLY |  |  |  |  |  |  |
| Quiescent current per amplifier | I_Q | I_O = 0 mA |  | 0.85 | 1.1 | mA |
| Quiescent current per amplifier | I_Q | I_O = 0 mA, T_A = –40°C to +125°C |  |  | 1.4 | mA |
| Power-supply rejection ratio | PSRR | V_S = 2.7 V to 5.5 V | 80 | 96 |  | dB |

### Warnings

> **warning** (vector_outlined_text): vector drawing at 118,455,430,142 holds about 119 letter-shaped outlines in 14 rows with no text behind them — labels, dimensions or values drawn as outlines are missing from the text; render the region (--render-region 118,455,430,142) to read them
