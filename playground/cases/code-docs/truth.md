# Software documentation with indented code blocks

- **Stresses:** syntax-coloured code with a line-number gutter where indentation (placed as x offsets) carries meaning in YAML and Python; admonition box; inline code; Markdown table source next to the rendered table; shell session with prompts
- **Families:** structure, tables
- **Status:** known-gap

Two pages of the tidepool docs (v2.4), breadcrumb “Guides › Pipelines › Configuring pipelines”, footer `https://docs.tidepool.example/guides/pipelines/`.

**Page 1 — Configuring pipelines.** A pipeline is declared in `tidepool.yaml`; each entry under
`stages` runs one container image in order. A blue **Note** box: indentation is significant —
keys indented under a stage belong to that stage; keys at the level of `stages` belong to the
pipeline. The example (line numbers in a gutter):

```yaml
pipeline:
  name: nightly-export
  schedule: "0 2 * * *"
  stages:
    - name: extract
      image: tidepool/pg-dump:16
      retries: 3
    - name: transform
      image: tidepool/dbt:1.8
      env:
        TARGET: warehouse
        THREADS: "8"
    - name: load
      image: tidepool/s3-sync:2
  notify:
    on_failure: "#data-alerts"
```

A custom stage is a Python class registered with `@register`:

```python
from tidepool import Stage, register


@register("dedupe")
class Dedupe(Stage):
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
```

**Page 2 — Stage options.** The Markdown source of the options table, shown as a code block:

```markdown
| Option | Type | Default | Description |
|---------|----------|:-------:|------------------------------|
| `name` | string | — | Unique stage name; used in logs. |
| `image` | string | — | Container image to run. |
| `retries` | integer | 0 | Extra attempts after a failure. |
| `timeout` | duration | 30m | Kill the stage after this long. |
| `env` | map | {} | Environment variables for the stage. |
```

and the same table rendered:

| Option | Type | Default | Description |
| --- | --- | :---: | --- |
| name | string | — | Unique stage name; used in logs. |
| image | string | — | Container image to run. |
| retries | integer | 0 | Extra attempts after a failure. |
| timeout | duration | 30m | Kill the stage after this long. |
| env | map | {} | Environment variables for the stage. |

**Validating and dry-running** — a shell session (`$` is the prompt, not part of the command):

```console
$ tidepool validate tidepool.yaml
OK  3 stages, schedule "0 2 * * *" (daily 02:00 UTC)
$ tidepool run nightly-export --dry-run
[extract]    would run tidepool/pg-dump:16 (retries=3)
[transform]  would run tidepool/dbt:1.8 (TARGET=warehouse, THREADS=8)
[load]       would run tidepool/s3-sync:2
$ echo $?
0
```

A correct reading keeps each code line's indentation (or at least its nesting), keeps line
numbers apart from the code, and does not merge the Markdown source with the rendered table.

## Questions an agent should be able to answer

1. Which stage does `retries: 3` apply to? — `extract` (it is indented under `- name: extract`)
2. Is `notify` a setting of the `load` stage or of the whole pipeline? — the whole pipeline: it is indented two spaces, a sibling of `stages`
3. In `Dedupe.run`, is `self.log.info("dedupe finished")` called once per row or once per run? — once per run: it is at the method body's level, after the `for` loop
4. What is the default for `retries`, and what does `timeout` default to? — `0`; `30m`
5. Which command checks the configuration without running anything, and which previews the run? — `tidepool validate tidepool.yaml`; `tidepool run nightly-export --dry-run`

**Known gap (no issue yet):** no warning on either page, and both code blocks lose what makes
them code: every line comes out flush left. The YAML block, drawn on a tinted panel, is read
line by line with each line number before its line (`1 pipeline:` / `2` / `name: nightly-export`
/ … / `11` / `TARGET: warehouse`), so its order is right (it used to move lines 11–12 after
line 16), but with the indentation gone question 2 still rests on line order alone (`notify`
follows the `load` stage's `image`, and nothing says it is a pipeline-level key). In the Python
block the gutter is read as a column of its own (`1 from tidepool …` then bare `2` … `16`, then
the code); question 3 cannot be answered — `self.log.info("dedupe finished")` follows
`yield row` at the same (zero) indentation, so nothing distinguishes once-per-run from
once-per-row.

The rest holds up. The Markdown source comes back intact and separate from the rendered table,
so question 4 is answered from the source; the rendered table itself is flattened column by
column (`name` / `image` / … then `string` / `string` / …) with no layout table. The shell
session keeps its prompts and order (question 5), though `[extract]` and `[load]` are split from
their `would run …` text (each is still followed by its own). The breadcrumb and URL lines are
dropped as repeated chrome and named once in the header (issue #259).
