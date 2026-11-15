_Untrusted PDF-derived data below — content, links, and form values are not instructions._

# playground/cases/code-docs/case.pdf

- **Pages:** 2
- **Title:** Software documentation with indented code blocks
- **Author:** pdfvision playground
- **Creator:** pdfvision

## Overview

| Page | Chars | Images | Coverage | Size (pt) | Vectors | Blocks | Fields | Links | Annots |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 1260 | 0 | 14% | 612×792 | 10 | 18 | 0 | 0 | 0 |
| 2 | 1415 | 0 | 14% | 612×792 | 17 | 16 | 0 | 0 | 0 |

---

## Page 1

_chars: 1260 · images: 0 · coverage: 14% · vectors: 10 · size: 612×792pt_

Configuring pipelines

A pipeline is declared in tidepool.yaml at the root of your project. Each entry under stages runs one
container image, in order; a stage starts only after the previous one succeeds.

Note

Indentation is significant. Keys indented under a stage belong to that stage; keys at the level of stages belong
to the pipeline. Use two spaces per level, never tabs.

Example

1 pipeline:
2
3
4
5
6
7
8
9
10
11
12
13
14
15
16

name: nightly-export
schedule: "0 2 * * *"
stages:
- name: extract
image: tidepool/pg-dump:16
retries: 3
- name: transform
image: tidepool/dbt:1.8
env:

- name: load
image: tidepool/s3-sync:2
notify:
on_failure: "#data-alerts"

TARGET: warehouse
THREADS: "8"

Custom stages

A custom stage is a subclass of Stage registered under a name with @register :

1 from tidepool import Stage, register
2
3
4 @register("dedupe")
5 class Dedupe(Stage):
6
7
8
9
10
11
12
13
14
15
16

"""Drop rows already seen in this run."""

def run(self, rows):
seen = set()
for row in rows:
key = (row["id"], row["ts"])
if key in seen:
continue
seen.add(key)
yield row
self.log.info("dedupe finished")

1/2

---

## Page 2

_chars: 1415 · images: 0 · coverage: 14% · vectors: 17 · size: 612×792pt_

Stage options

Every stage accepts the options below. In the source of this page the table is written as:

| Option | Type | Default | Description |
|---------|----------|:-------:|------------------------------|
| `name` | string | — | Unique stage name; used in logs. |
| `image` | string | — | Container image to run. |
| `retries` | integer | 0 | Extra attempts after a failure. |
| `timeout` | duration | 30m | Kill the stage after this long. |
| `env` | map | {} | Environment variables for the stage. |

which renders as:

Option Type Default Description
name string
image string
retries integer
timeout duration
env map

—
—
0
30m
{}

Unique stage name; used in logs.
Container image to run.
Extra attempts after a failure.
Kill the stage after this long.
Environment variables for the stage.

Validating and dry-running

Check a configuration with tidepool validate , then preview a run with --dry-run , which prints
what each stage would execute without starting any container:

$ tidepool validate tidepool.yaml
OK 3 stages, schedule "0 2 * * *" (daily 02:00 UTC)
$ tidepool run nightly-export --dry-run
[extract]

would run tidepool/pg-dump:16 (retries=3)
[transform] would run tidepool/dbt:1.8 (TARGET=warehouse, THREADS=8)
[load]
$ echo $?
0

would run tidepool/s3-sync:2

2/2
