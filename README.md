# csv-reader-entry

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/alchemn/csv-reader-entry/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/alchemn/csv-reader-entry/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)

A faster drop-in for csv-reader 1.0.0: `solve.js` answers every case with
exactly the `{columns, rows, errors}` csv-reader returns — same broken-row
policy, same error records — but reads the text in bulk jumps instead of one
character at a time, so it runs faster on large, messy CSV files.

`main.ts` is the harness driver: it reads every case from
`/input/cases.json`, answers each with `run`, and writes
`/output/answers.json`.
