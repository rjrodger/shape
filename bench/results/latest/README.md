# Latest measurements

Generated 2026-09-03T10:03:08.159Z from 73 run(s). Times are median nanoseconds per operation; lower is better.

## go on github:windows-x64

Host `1fee8adaf205`: AMD EPYC 9V74 80-Core Processor, 4 cores, win32/x64. Last run 2026-09-03 (cases `233e564a2bd4`).

| case | shape | validator | jsonschema | gojsonschema | shape / fastest |
|---|---:|---:|---:|---:|---:|
| flat | 497 ns | 363 ns | 2.8 µs | 7.9 µs | 1.4× |
| nested | 2.8 µs | 1.3 µs | 5.5 µs | 12.7 µs | 2.1× |
| array | 41.4 µs | 17.8 µs | 96.6 µs | 250.3 µs | 2.3× |
| bounds | 1.9 µs | 831 ns | 4.7 µs | 7.7 µs | 2.2× |
| invalid | 4.5 µs | – | 5.7 µs | 15.8 µs | 1.0× |
| large | 10.7 µs | 2.6 µs | 25.5 µs | 84.5 µs | 4.1× |

## go on linux-xeon-sandbox

Host `80bb4b189998`: Intel(R) Xeon(R) Processor @ 2.10GHz, 4 cores, linux/x64. Last run 2026-09-02 (cases `233e564a2bd4`). Measured from a worktree with uncommitted changes.

| case | shape | validator | jsonschema | gojsonschema | shape / fastest |
|---|---:|---:|---:|---:|---:|
| flat | 453 ns | 323 ns | 1.9 µs | 6.0 µs | 1.4× |
| nested | 1.9 µs | 1.1 µs | 4.6 µs | 9.4 µs | 1.7× |
| array | 34.9 µs | 14.5 µs | 66.6 µs | 196.9 µs | 2.4× |
| bounds | 2.1 µs | 682 ns | 3.4 µs | 6.1 µs | 3.1× |
| invalid | 3.0 µs | – | 4.6 µs | 11.8 µs | 1.0× |
| large | 5.5 µs | – | 17.3 µs | 68.9 µs | 1.0× |

## go on linux-xeon-sandbox

Host `e39798b4ebbc`: Intel(R) Xeon(R) Processor @ 2.80GHz, 4 cores, linux/x64. Last run 2026-09-02 (cases `64dd85eab212`).

| case | shape | validator | jsonschema | gojsonschema | shape / fastest |
|---|---:|---:|---:|---:|---:|
| flat | 3.3 µs | 475 ns | 2.5 µs | 8.8 µs | 6.9× |
| nested | 7.5 µs | 1.4 µs | 5.7 µs | 12.7 µs | 5.2× |
| array | 112.2 µs | 20.7 µs | 92.7 µs | 263.4 µs | 5.4× |
| bounds | 2.9 µs | 930 ns | 4.3 µs | 8.1 µs | 3.2× |
| invalid | 11.4 µs | – | 4.6 µs | 16.6 µs | 2.5× |
| large | – | – | – | – | – |

## go on github:macos-arm64

Host `ea12b5414dd4`: Apple M1 (Virtual), 3 cores, darwin/arm64. Last run 2026-09-03 (cases `233e564a2bd4`).

| case | shape | validator | jsonschema | gojsonschema | shape / fastest |
|---|---:|---:|---:|---:|---:|
| flat | 358 ns | 256 ns | 1.3 µs | 4.0 µs | 1.4× |
| nested | 1.0 µs | 804 ns | 3.7 µs | 8.4 µs | 1.3× |
| array | 34.7 µs | 10.5 µs | 43.3 µs | 133.2 µs | 3.3× |
| bounds | 1.7 µs | 427 ns | 2.9 µs | 4.8 µs | 3.9× |
| invalid | 1.9 µs | – | 2.7 µs | 10.2 µs | 1.0× |
| large | 7.5 µs | 1.7 µs | 14.4 µs | 55.3 µs | 4.5× |

## go on github:linux-x64

Host `f2c2ec319f42`: AMD EPYC 9V74 80-Core Processor, 4 cores, linux/x64. Last run 2026-09-03 (cases `233e564a2bd4`).

| case | shape | validator | jsonschema | gojsonschema | shape / fastest |
|---|---:|---:|---:|---:|---:|
| flat | 369 ns | 237 ns | 1.4 µs | 4.4 µs | 1.6× |
| nested | 1.4 µs | 747 ns | 2.5 µs | 7.0 µs | 1.9× |
| array | 21.9 µs | 10.6 µs | 47.7 µs | 140.3 µs | 2.1× |
| bounds | 1.2 µs | 517 ns | 2.4 µs | 4.3 µs | 2.4× |
| invalid | 2.6 µs | – | 3.5 µs | 8.7 µs | 1.0× |
| large | 5.1 µs | 1.6 µs | 12.8 µs | 48.6 µs | 3.2× |

## rs on github:windows-x64

Host `1fee8adaf205`: AMD EPYC 9V74 80-Core Processor, 4 cores, win32/x64. Last run 2026-09-03 (cases `233e564a2bd4`).

| case | shape | garde | validator | jsonschema | shape / fastest |
|---|---:|---:|---:|---:|---:|
| flat | 137 ns | 8 ns | 18 ns | 198 ns | 17.8× |
| nested | 207 ns | 28 ns | 135 ns | 389 ns | 7.4× |
| array | 1.6 µs | 244 ns | 743 ns | 5.9 µs | 6.4× |
| bounds | 435 ns | 33 ns | 35 ns | 220 ns | 13.1× |
| invalid | 2.7 µs | – | – | 156 ns | 17.1× |
| large | 462 ns | 39 ns | 56 ns | 2.0 µs | 12.0× |

## rs on linux-xeon-sandbox

Host `e39798b4ebbc`: Intel(R) Xeon(R) Processor @ 2.80GHz, 4 cores, linux/x64. Last run 2026-09-03 (cases `233e564a2bd4`).

| case | shape | garde | validator | jsonschema | shape / fastest |
|---|---:|---:|---:|---:|---:|
| flat | 115 ns | 10 ns | 23 ns | 186 ns | 11.6× |
| nested | 187 ns | 40 ns | 126 ns | 393 ns | 4.6× |
| array | 1.8 µs | 258 ns | 745 ns | 6.1 µs | 6.8× |
| bounds | 409 ns | 40 ns | 44 ns | 238 ns | 10.3× |
| invalid | 2.4 µs | – | – | 157 ns | 15.3× |
| large | 462 ns | 57 ns | 80 ns | 2.2 µs | 8.1× |

## rs on github:macos-arm64

Host `ea12b5414dd4`: Apple M1 (Virtual), 3 cores, darwin/arm64. Last run 2026-09-03 (cases `233e564a2bd4`).

| case | shape | garde | validator | jsonschema | shape / fastest |
|---|---:|---:|---:|---:|---:|
| flat | 77 ns | 8 ns | 16 ns | 135 ns | 10.2× |
| nested | 132 ns | 27 ns | 96 ns | 273 ns | 4.9× |
| array | 1.5 µs | 205 ns | 471 ns | 4.4 µs | 7.2× |
| bounds | 231 ns | 23 ns | 28 ns | 159 ns | 10.1× |
| invalid | 1.7 µs | – | – | 95 ns | 17.4× |
| large | 428 ns | 38 ns | 75 ns | 1.5 µs | 11.4× |

## rs on github:linux-x64

Host `f2c2ec319f42`: AMD EPYC 9V74 80-Core Processor, 4 cores, linux/x64. Last run 2026-09-03 (cases `233e564a2bd4`).

| case | shape | garde | validator | jsonschema | shape / fastest |
|---|---:|---:|---:|---:|---:|
| flat | 64 ns | 9 ns | 16 ns | 113 ns | 6.9× |
| nested | 107 ns | 32 ns | 79 ns | 241 ns | 3.3× |
| array | 1.1 µs | 168 ns | 421 ns | 3.2 µs | 6.5× |
| bounds | 233 ns | 23 ns | 24 ns | 136 ns | 10.0× |
| invalid | 1.5 µs | – | – | 92 ns | 16.3× |
| large | 287 ns | 48 ns | 56 ns | 1.2 µs | 6.0× |

## ts on github:windows-x64

Host `1fee8adaf205`: AMD EPYC 9V74 80-Core Processor, 4 cores, win32/x64. Last run 2026-09-03 (cases `233e564a2bd4`).

| case | shape | zod | ajv | joi | valibot | shape / fastest |
|---|---:|---:|---:|---:|---:|---:|
| flat | 767 ns | 101 ns | 26 ns | 1.9 µs | 481 ns | 29.3× |
| nested | 1.7 µs | 271 ns | 52 ns | 5.9 µs | 989 ns | 33.3× |
| array | 24.2 µs | 4.6 µs | 751 ns | 82.4 µs | 16.7 µs | 32.2× |
| bounds | 1.5 µs | 618 ns | 66 ns | 2.7 µs | 668 ns | 23.1× |
| invalid | 2.7 µs | 3.2 µs | 36 ns | 2.7 µs | 1.7 µs | 75.6× |
| large | 6.9 µs | 4.5 µs | 3.1 µs | 34.1 µs | 8.7 µs | 2.2× |

## ts on linux-xeon-sandbox

Host `80bb4b189998`: Intel(R) Xeon(R) Processor @ 2.10GHz, 4 cores, linux/x64. Last run 2026-09-02 (cases `233e564a2bd4`).

| case | shape | zod | ajv | joi | valibot | shape / fastest |
|---|---:|---:|---:|---:|---:|---:|
| flat | 642 ns | 79 ns | 27 ns | 1.8 µs | 543 ns | 23.6× |
| nested | 1.5 µs | 232 ns | 57 ns | 5.7 µs | 1.1 µs | 26.8× |
| array | 25.1 µs | 3.6 µs | 843 ns | 75.9 µs | 20.4 µs | 29.8× |
| bounds | 1.5 µs | 572 ns | 78 ns | 2.5 µs | 760 ns | 19.9× |
| invalid | 3.0 µs | 3.2 µs | 39 ns | 2.5 µs | 1.9 µs | 76.7× |
| large | 7.6 µs | 5.6 µs | 3.4 µs | 42.1 µs | 10.1 µs | 2.3× |

## ts on linux-xeon-sandbox

Host `e39798b4ebbc`: Intel(R) Xeon(R) Processor @ 2.80GHz, 4 cores, linux/x64. Last run 2026-09-02 (cases `64dd85eab212`).

| case | shape | zod | ajv | joi | valibot | shape / fastest |
|---|---:|---:|---:|---:|---:|---:|
| flat | 3.5 µs | 138 ns | 44 ns | 2.7 µs | 810 ns | 78.6× |
| nested | 6.7 µs | 438 ns | 100 ns | 8.4 µs | 1.6 µs | 67.7× |
| array | 110.0 µs | 6.6 µs | 1.4 µs | 148.1 µs | 36.4 µs | 77.1× |
| bounds | 5.1 µs | 1.4 µs | 148 ns | 4.6 µs | 1.4 µs | 34.8× |
| invalid | 10.9 µs | 4.7 µs | 93 ns | 4.0 µs | 3.3 µs | 117.3× |
| large | – | – | – | – | – | – |

## ts on github:macos-arm64

Host `ea12b5414dd4`: Apple M1 (Virtual), 3 cores, darwin/arm64. Last run 2026-09-03 (cases `233e564a2bd4`).

| case | shape | zod | ajv | joi | valibot | shape / fastest |
|---|---:|---:|---:|---:|---:|---:|
| flat | 584 ns | 113 ns | 26 ns | 1.4 µs | 421 ns | 22.6× |
| nested | 1.4 µs | 248 ns | 53 ns | 4.3 µs | 819 ns | 25.8× |
| array | 19.2 µs | 3.8 µs | 654 ns | 59.3 µs | 14.6 µs | 29.4× |
| bounds | 1.1 µs | 465 ns | 67 ns | 2.1 µs | 634 ns | 16.7× |
| invalid | 1.7 µs | 1.5 µs | 37 ns | 1.4 µs | 1.4 µs | 46.7× |
| large | 5.3 µs | 3.0 µs | 2.2 µs | 25.9 µs | 8.0 µs | 2.5× |

## ts on github:linux-x64

Host `f2c2ec319f42`: AMD EPYC 9V74 80-Core Processor, 4 cores, linux/x64. Last run 2026-09-03 (cases `233e564a2bd4`).

| case | shape | zod | ajv | joi | valibot | shape / fastest |
|---|---:|---:|---:|---:|---:|---:|
| flat | 492 ns | 61 ns | 22 ns | 1.2 µs | 378 ns | 22.4× |
| nested | 1.2 µs | 173 ns | 44 ns | 4.1 µs | 769 ns | 28.0× |
| array | 17.3 µs | 2.9 µs | 623 ns | 54.6 µs | 13.0 µs | 27.8× |
| bounds | 1.1 µs | 403 ns | 56 ns | 1.8 µs | 511 ns | 19.7× |
| invalid | 2.0 µs | 1.8 µs | 27 ns | 1.8 µs | 1.4 µs | 72.8× |
| large | 5.1 µs | 3.3 µs | 2.3 µs | 23.4 µs | 6.6 µs | 2.2× |

# History

Shape's median per case on every run, with the 95th percentile after it, newest last; a cell is filled only when the run measured the case as it is defined now.

## go on github:windows-x64

| run | commit | shape | flat | nested | array | bounds | invalid | large |
|---|---|---|---:|---:|---:|---:|---:|---:|
| 2026-09-02 16:30 | `04f0ddd` | 0.4.0 | 483 ns · 530 ns | 2.8 µs · 3.4 µs | 41.8 µs · 53.4 µs | 2.3 µs · 2.7 µs | 4.8 µs · 5.7 µs | 11.0 µs · 14.5 µs |
| 2026-09-02 19:31 | `0b07d91` | 0.5.0 | 493 ns · 535 ns | 2.7 µs · 3.3 µs | 41.3 µs · 51.2 µs | 1.8 µs · 2.3 µs | 4.4 µs · 5.5 µs | 10.9 µs · 13.2 µs |
| 2026-09-03 09:22 | `e07fe77` | 0.5.0 | 483 ns · 512 ns | 2.6 µs · 3.1 µs | 41.1 µs · 51.6 µs | 1.8 µs · 2.4 µs | 4.2 µs · 5.7 µs | 10.5 µs · 13.3 µs |
| 2026-09-03 09:59 | `f82adf1` | 0.5.1 | 497 ns · 600 ns | 2.8 µs · 3.4 µs | 41.4 µs · 48.8 µs | 1.9 µs · 2.4 µs | 4.5 µs · 5.6 µs | 10.7 µs · 13.1 µs |

## go on linux-xeon-sandbox

| run | commit | shape | flat | nested | array | bounds | invalid | large |
|---|---|---|---:|---:|---:|---:|---:|---:|
| 2026-09-02 13:57 | `9ddbbe9` | 0.3.0 | 1.4 µs · 1.6 µs | 2.9 µs · 3.4 µs | 24.3 µs · 88.0 µs | 2.0 µs · 2.7 µs | 8.3 µs · 10.5 µs | – |
| 2026-09-02 14:06 | `e67ecc6` | 0.3.0 | 898 ns · 4.7 µs | 3.1 µs · 4.0 µs | 38.3 µs · 44.4 µs | 1.3 µs · 5.2 µs | 6.6 µs · 8.4 µs | – |
| 2026-09-02 14:07 | `e67ecc6` (dirty) | 0.3.0 | 915 ns · 3.9 µs | 1.9 µs · 8.0 µs | 26.4 µs · 103.2 µs | 1.4 µs · 5.1 µs | 7.0 µs · 9.0 µs | – |
| 2026-09-02 14:08 | `e67ecc6` (dirty) | 0.3.0 | 1.3 µs · 2.6 µs | 3.1 µs · 3.8 µs | 39.9 µs · 50.1 µs | 1.5 µs · 4.0 µs | 6.0 µs · 9.3 µs | – |
| 2026-09-02 14:09 | `e67ecc6` (dirty) | 0.3.0 | 1.5 µs · 2.0 µs | 3.1 µs · 4.0 µs | 27.1 µs · 87.9 µs | 2.0 µs · 2.6 µs | 6.8 µs · 8.8 µs | – |
| 2026-09-02 15:10 | `15de96a` | 0.3.0 | 457 ns · 619 ns | 2.4 µs · 4.7 µs | 38.4 µs · 48.9 µs | 1.7 µs · 4.5 µs | 3.5 µs · 5.8 µs | 8.7 µs · 11.5 µs |
| 2026-09-02 15:13 | `424ec5a` | 0.3.0 | 451 ns · 677 ns | 1.7 µs · 2.9 µs | 39.2 µs · 50.7 µs | 1.3 µs · 5.6 µs | 3.0 µs · 6.7 µs | 5.8 µs · 20.7 µs |
| 2026-09-02 15:13 | `424ec5a` (dirty) | 0.3.0 | 448 ns · 530 ns | 1.9 µs · 3.2 µs | 40.2 µs · 49.5 µs | 1.5 µs · 4.4 µs | 2.6 µs · 9.8 µs | 8.7 µs · 10.6 µs |
| 2026-09-02 15:14 | `424ec5a` (dirty) | 0.3.0 | 453 ns · 544 ns | 1.9 µs · 3.2 µs | 34.9 µs · 61.4 µs | 2.1 µs · 3.0 µs | 3.0 µs · 6.1 µs | 5.5 µs · 23.0 µs |

## go on linux-xeon-sandbox

| run | commit | shape | flat | nested | array | bounds | invalid | large |
|---|---|---|---:|---:|---:|---:|---:|---:|
| 2026-09-02 08:06 | `fb2015e` | 0.2.1 | 3.0 µs · 11.5 µs | 8.6 µs · 21.4 µs | 106.6 µs · 308.8 µs | 4.3 µs · 8.1 µs | 11.6 µs · 34.3 µs | – |
| 2026-09-02 08:25 | `5085fc0` | 0.3.0 | 3.3 µs · 12.0 µs | 7.5 µs · 24.6 µs | 112.2 µs · 234.1 µs | 2.9 µs · 11.9 µs | 11.4 µs · 22.9 µs | – |

## go on github:macos-arm64

| run | commit | shape | flat | nested | array | bounds | invalid | large |
|---|---|---|---:|---:|---:|---:|---:|---:|
| 2026-09-02 08:25 | `f325abd` | 0.3.0 | 1.7 µs · 2.6 µs | 4.0 µs · 8.1 µs | 58.9 µs · 151.7 µs | 2.2 µs · 4.2 µs | 7.4 µs · 12.9 µs | – |
| 2026-09-02 13:39 | `ab6b663` | 0.3.0 | 2.0 µs · 3.3 µs | 4.4 µs · 5.8 µs | 53.8 µs · 96.1 µs | 1.9 µs · 3.4 µs | 5.3 µs · 18.5 µs | – |
| 2026-09-02 14:20 | `8dc65e2` | 0.3.0 | 1.0 µs · 2.2 µs | 2.2 µs · 4.0 µs | 17.2 µs · 59.4 µs | 1.1 µs · 1.9 µs | 3.3 µs · 5.3 µs | – |
| 2026-09-02 15:37 | `d1228fb` | 0.3.0 | 357 ns · 964 ns | 1.1 µs · 4.2 µs | 29.6 µs · 78.1 µs | 898 ns · 6.2 µs | 2.0 µs · 5.8 µs | 7.3 µs · 12.9 µs |
| 2026-09-02 16:30 | `04f0ddd` | 0.4.0 | 404 ns · 973 ns | 1.5 µs · 2.7 µs | 27.4 µs · 60.7 µs | 1.3 µs · 2.4 µs | 2.8 µs · 5.3 µs | 6.5 µs · 13.9 µs |
| 2026-09-02 19:30 | `0b07d91` | 0.5.0 | 393 ns · 992 ns | 1.3 µs · 2.0 µs | 27.5 µs · 53.2 µs | 1.2 µs · 2.4 µs | 2.2 µs · 6.9 µs | 6.6 µs · 11.0 µs |
| 2026-09-03 09:22 | `e07fe77` | 0.5.0 | 375 ns · 933 ns | 1.1 µs · 4.0 µs | 26.2 µs · 49.3 µs | 771 ns · 4.0 µs | 1.7 µs · 5.0 µs | 6.4 µs · 11.8 µs |
| 2026-09-03 09:58 | `f82adf1` | 0.5.1 | 358 ns · 930 ns | 1.0 µs · 5.3 µs | 34.7 µs · 72.7 µs | 1.7 µs · 3.4 µs | 1.9 µs · 9.8 µs | 7.5 µs · 14.2 µs |

## go on github:linux-x64

| run | commit | shape | flat | nested | array | bounds | invalid | large |
|---|---|---|---:|---:|---:|---:|---:|---:|
| 2026-09-02 08:25 | `f325abd` | 0.3.0 | 1.9 µs · 2.7 µs | 4.7 µs · 6.8 µs | 61.6 µs · 112.5 µs | 2.0 µs · 5.5 µs | 7.0 µs · 10.2 µs | – |
| 2026-09-02 13:39 | `ab6b663` | 0.3.0 | 1.8 µs · 2.6 µs | 5.2 µs · 6.5 µs | 59.3 µs · 105.3 µs | 2.0 µs · 2.8 µs | 7.1 µs · 9.4 µs | – |
| 2026-09-02 14:20 | `8dc65e2` | 0.3.0 | 1.1 µs · 1.2 µs | 1.9 µs · 3.7 µs | 33.7 µs · 39.4 µs | 1.1 µs · 3.5 µs | 5.6 µs · 7.1 µs | – |
| 2026-09-02 15:37 | `d1228fb` | 0.3.0 | 413 ns · 440 ns | 1.5 µs · 2.0 µs | 26.2 µs · 28.2 µs | 1.4 µs · 1.8 µs | 2.6 µs · 3.7 µs | 6.6 µs · 8.4 µs |
| 2026-09-02 16:29 | `04f0ddd` | 0.4.0 | 355 ns · 364 ns | 1.3 µs · 1.4 µs | 21.4 µs · 24.8 µs | 1.2 µs · 1.5 µs | 2.6 µs · 2.8 µs | 5.1 µs · 5.7 µs |
| 2026-09-02 19:30 | `0b07d91` | 0.5.0 | 492 ns · 499 ns | 1.3 µs · 2.7 µs | 21.2 µs · 39.2 µs | 1.4 µs · 1.8 µs | 2.4 µs · 8.9 µs | 7.5 µs · 8.4 µs |
| 2026-09-03 09:22 | `e07fe77` | 0.5.0 | 491 ns · 513 ns | 1.5 µs · 2.4 µs | 28.3 µs · 31.2 µs | 954 ns · 3.5 µs | 2.7 µs · 4.0 µs | 4.9 µs · 20.1 µs |
| 2026-09-03 09:57 | `f82adf1` | 0.5.1 | 369 ns · 377 ns | 1.4 µs · 1.6 µs | 21.9 µs · 23.7 µs | 1.2 µs · 1.5 µs | 2.6 µs · 2.9 µs | 5.1 µs · 5.9 µs |

## rs on github:windows-x64

| run | commit | shape | flat | nested | array | bounds | invalid | large |
|---|---|---|---:|---:|---:|---:|---:|---:|
| 2026-09-02 19:34 | `0b07d91` | 0.1.0 | 219 ns · 232 ns | 422 ns · 450 ns | 5.4 µs · 5.5 µs | 424 ns · 440 ns | 3.0 µs · 6.5 µs | 1.3 µs · 1.4 µs |
| 2026-09-03 09:25 | `e07fe77` | 0.1.0 | 130 ns · 136 ns | 189 ns · 198 ns | 1.6 µs · 1.7 µs | 422 ns · 435 ns | 2.7 µs · 2.8 µs | 448 ns · 477 ns |
| 2026-09-03 10:02 | `f82adf1` | 0.1.1 | 137 ns · 149 ns | 207 ns · 217 ns | 1.6 µs · 1.6 µs | 435 ns · 465 ns | 2.7 µs · 3.3 µs | 462 ns · 489 ns |

## rs on linux-xeon-sandbox

| run | commit | shape | flat | nested | array | bounds | invalid | large |
|---|---|---|---:|---:|---:|---:|---:|---:|
| 2026-09-03 09:56 | `f82adf1` | 0.1.1 | 115 ns · 140 ns | 187 ns · 200 ns | 1.8 µs · 1.9 µs | 409 ns · 459 ns | 2.4 µs · 2.8 µs | 462 ns · 508 ns |

## rs on github:macos-arm64

| run | commit | shape | flat | nested | array | bounds | invalid | large |
|---|---|---|---:|---:|---:|---:|---:|---:|
| 2026-09-02 19:33 | `0b07d91` | 0.1.0 | 126 ns · 358 ns | 282 ns · 1.0 µs | 3.5 µs · 8.5 µs | 242 ns · 707 ns | 1.8 µs · 3.4 µs | 881 ns · 2.2 µs |
| 2026-09-03 09:24 | `e07fe77` | 0.1.0 | 75 ns · 86 ns | 129 ns · 146 ns | 1.4 µs · 3.2 µs | 255 ns · 722 ns | 1.6 µs · 4.3 µs | 420 ns · 862 ns |
| 2026-09-03 10:00 | `f82adf1` | 0.1.1 | 77 ns · 219 ns | 132 ns · 395 ns | 1.5 µs · 3.8 µs | 231 ns · 731 ns | 1.7 µs · 4.6 µs | 428 ns · 908 ns |

## rs on github:linux-x64

| run | commit | shape | flat | nested | array | bounds | invalid | large |
|---|---|---|---:|---:|---:|---:|---:|---:|
| 2026-09-02 19:32 | `0b07d91` | 0.1.0 | 144 ns · 149 ns | 313 ns · 318 ns | 4.3 µs · 4.4 µs | 314 ns · 330 ns | 2.0 µs · 2.1 µs | 1.1 µs · 1.1 µs |
| 2026-09-03 09:24 | `e07fe77` | 0.1.0 | 78 ns · 78 ns | 133 ns · 134 ns | 1.5 µs · 1.5 µs | 299 ns · 304 ns | 1.9 µs · 1.9 µs | 401 ns · 423 ns |
| 2026-09-03 09:59 | `f82adf1` | 0.1.1 | 64 ns · 65 ns | 107 ns · 110 ns | 1.1 µs · 1.1 µs | 233 ns · 238 ns | 1.5 µs · 1.5 µs | 287 ns · 290 ns |

## ts on github:windows-x64

| run | commit | shape | flat | nested | array | bounds | invalid | large |
|---|---|---|---:|---:|---:|---:|---:|---:|
| 2026-09-02 16:29 | `04f0ddd` | 11.2.0 | 679 ns · 766 ns | 1.5 µs · 3.1 µs | 23.3 µs · 26.3 µs | 1.5 µs · 1.8 µs | 2.8 µs · 4.9 µs | 7.2 µs · 8.0 µs |
| 2026-09-02 19:29 | `0b07d91` | 11.3.0 | 777 ns · 915 ns | 1.7 µs · 2.1 µs | 23.8 µs · 26.4 µs | 1.6 µs · 1.8 µs | 2.7 µs · 3.1 µs | 7.0 µs · 7.7 µs |
| 2026-09-03 09:21 | `e07fe77` | 11.3.0 | 687 ns · 890 ns | 1.6 µs · 1.8 µs | 23.7 µs · 27.4 µs | 1.4 µs · 1.6 µs | 2.8 µs · 3.1 µs | 7.4 µs · 8.3 µs |
| 2026-09-03 09:57 | `f82adf1` | 11.3.1 | 767 ns · 1.4 µs | 1.7 µs · 1.9 µs | 24.2 µs · 27.7 µs | 1.5 µs · 1.8 µs | 2.7 µs · 3.2 µs | 6.9 µs · 8.0 µs |

## ts on linux-xeon-sandbox

| run | commit | shape | flat | nested | array | bounds | invalid | large |
|---|---|---|---:|---:|---:|---:|---:|---:|
| 2026-09-02 13:56 | `9ddbbe9` | 11.1.0 | 852 ns · 1.0 µs | 1.7 µs · 2.0 µs | 27.4 µs · 34.6 µs | 1.4 µs · 1.6 µs | 3.3 µs · 4.6 µs | – |
| 2026-09-02 15:09 | `15de96a` | 11.1.0 | 642 ns · 790 ns | 1.5 µs · 1.8 µs | 25.1 µs · 29.6 µs | 1.5 µs · 2.0 µs | 3.0 µs · 4.1 µs | 7.6 µs · 9.1 µs |

## ts on linux-xeon-sandbox

| run | commit | shape | flat | nested | array | bounds | invalid | large |
|---|---|---|---:|---:|---:|---:|---:|---:|
| 2026-09-02 08:05 | `fb2015e` | 11.0.1 | 3.5 µs · 5.4 µs | 6.4 µs · 8.7 µs | 105.8 µs · 142.5 µs | 4.0 µs · 6.6 µs | 8.5 µs · 13.8 µs | – |
| 2026-09-02 08:24 | `5085fc0` | 11.1.0 | 3.5 µs · 5.0 µs | 6.7 µs · 10.5 µs | 110.0 µs · 154.6 µs | 5.1 µs · 6.6 µs | 10.9 µs · 14.1 µs | – |

## ts on github:macos-arm64

| run | commit | shape | flat | nested | array | bounds | invalid | large |
|---|---|---|---:|---:|---:|---:|---:|---:|
| 2026-09-02 08:25 | `f325abd` | 11.1.0 | 2.3 µs · 5.9 µs | 3.7 µs · 5.4 µs | 59.3 µs · 90.1 µs | 2.2 µs · 4.2 µs | 4.6 µs · 12.1 µs | – |
| 2026-09-02 13:38 | `ab6b663` | 11.1.0 | 2.0 µs · 5.7 µs | 3.3 µs · 4.0 µs | 54.3 µs · 66.7 µs | 2.0 µs · 2.5 µs | 4.0 µs · 5.3 µs | – |
| 2026-09-02 14:19 | `8dc65e2` | 11.1.0 | 747 ns · 1.5 µs | 1.2 µs · 1.6 µs | 20.9 µs · 27.4 µs | 1.2 µs · 2.5 µs | 2.0 µs · 5.8 µs | – |
| 2026-09-02 15:36 | `d1228fb` | 11.1.0 | 571 ns · 1.5 µs | 1.4 µs · 4.3 µs | 29.0 µs · 65.8 µs | 1.3 µs · 3.4 µs | 1.8 µs · 5.0 µs | 5.8 µs · 11.2 µs |
| 2026-09-02 16:29 | `04f0ddd` | 11.2.0 | 556 ns · 1.5 µs | 1.5 µs · 3.5 µs | 18.9 µs · 50.5 µs | 1.2 µs · 2.2 µs | 1.8 µs · 3.0 µs | 5.5 µs · 15.1 µs |
| 2026-09-02 19:29 | `0b07d91` | 11.3.0 | 617 ns · 1.5 µs | 1.4 µs · 2.6 µs | 19.2 µs · 50.5 µs | 1.2 µs · 1.7 µs | 1.7 µs · 4.6 µs | 5.6 µs · 15.7 µs |
| 2026-09-03 09:21 | `e07fe77` | 11.3.0 | 574 ns · 1.6 µs | 1.3 µs · 2.1 µs | 18.3 µs · 39.2 µs | 1.2 µs · 3.1 µs | 1.8 µs · 5.2 µs | 5.4 µs · 9.8 µs |
| 2026-09-03 09:57 | `f82adf1` | 11.3.1 | 584 ns · 1.7 µs | 1.4 µs · 3.5 µs | 19.2 µs · 49.9 µs | 1.1 µs · 2.7 µs | 1.7 µs · 5.0 µs | 5.3 µs · 16.1 µs |

## ts on github:linux-x64

| run | commit | shape | flat | nested | array | bounds | invalid | large |
|---|---|---|---:|---:|---:|---:|---:|---:|
| 2026-09-02 08:24 | `f325abd` | 11.1.0 | 2.5 µs · 2.9 µs | 4.9 µs · 5.4 µs | 82.2 µs · 88.5 µs | 3.2 µs · 3.3 µs | 6.4 µs · 7.0 µs | – |
| 2026-09-02 13:38 | `ab6b663` | 11.1.0 | 2.0 µs · 2.2 µs | 4.0 µs · 4.3 µs | 71.8 µs · 78.9 µs | 2.8 µs · 3.0 µs | 5.6 µs · 5.9 µs | – |
| 2026-09-02 14:19 | `8dc65e2` | 11.1.0 | 864 ns · 1.0 µs | 1.7 µs · 2.0 µs | 29.4 µs · 34.8 µs | 1.5 µs · 1.9 µs | 3.0 µs · 3.6 µs | – |
| 2026-09-02 15:36 | `d1228fb` | 11.1.0 | 586 ns · 665 ns | 1.5 µs · 1.8 µs | 22.1 µs · 25.6 µs | 1.5 µs · 1.8 µs | 2.4 µs · 2.8 µs | 6.3 µs · 7.2 µs |
| 2026-09-02 16:28 | `04f0ddd` | 11.2.0 | 501 ns · 564 ns | 1.2 µs · 1.5 µs | 17.6 µs · 19.2 µs | 1.1 µs · 1.2 µs | 2.0 µs · 2.2 µs | 5.2 µs · 5.6 µs |
| 2026-09-02 19:29 | `0b07d91` | 11.3.0 | 733 ns · 821 ns | 1.7 µs · 1.9 µs | 24.3 µs · 27.9 µs | 1.5 µs · 1.8 µs | 2.7 µs · 3.1 µs | 6.9 µs · 7.6 µs |
| 2026-09-03 09:21 | `e07fe77` | 11.3.0 | 725 ns · 805 ns | 1.6 µs · 1.8 µs | 23.9 µs · 26.6 µs | 1.5 µs · 1.7 µs | 2.6 µs · 2.9 µs | 6.7 µs · 7.5 µs |
| 2026-09-03 09:56 | `f82adf1` | 11.3.1 | 492 ns · 546 ns | 1.2 µs · 1.3 µs | 17.3 µs · 20.8 µs | 1.1 µs · 1.2 µs | 2.0 µs · 2.2 µs | 5.1 µs · 5.6 µs |
