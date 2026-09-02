# Latest measurements

Generated 2026-09-02T19:34:34.388Z from 54 run(s). Times are median nanoseconds per operation; lower is better.

## go on github:windows-x64

Host `1fee8adaf205`: AMD EPYC 9V74 80-Core Processor, 4 cores, win32/x64. Last run 2026-09-02 (cases `233e564a2bd4`).

| case | shape | validator | jsonschema | gojsonschema | shape / fastest |
|---|---:|---:|---:|---:|---:|
| flat | 493 ns | 355 ns | 2.7 µs | 7.5 µs | 1.4× |
| nested | 2.7 µs | 1.3 µs | 5.5 µs | 12.2 µs | 2.1× |
| array | 41.3 µs | 17.2 µs | 95.6 µs | 243.5 µs | 2.4× |
| bounds | 1.8 µs | 820 ns | 4.6 µs | 7.5 µs | 2.2× |
| invalid | 4.4 µs | – | 5.4 µs | 16.0 µs | 1.0× |
| large | 10.9 µs | 2.5 µs | 24.7 µs | 83.6 µs | 4.3× |

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

Host `ea12b5414dd4`: Apple M1 (Virtual), 3 cores, darwin/arm64. Last run 2026-09-02 (cases `233e564a2bd4`).

| case | shape | validator | jsonschema | gojsonschema | shape / fastest |
|---|---:|---:|---:|---:|---:|
| flat | 393 ns | 256 ns | 1.7 µs | 3.7 µs | 1.5× |
| nested | 1.3 µs | 867 ns | 3.2 µs | 6.4 µs | 1.5× |
| array | 27.5 µs | 13.0 µs | 47.9 µs | 146.9 µs | 2.1× |
| bounds | 1.2 µs | 455 ns | 3.2 µs | 4.1 µs | 2.7× |
| invalid | 2.2 µs | – | 2.8 µs | 8.0 µs | 1.0× |
| large | 6.6 µs | 1.7 µs | 13.2 µs | 53.6 µs | 3.9× |

## go on github:linux-x64

Host `f2c2ec319f42`: AMD EPYC 9V74 80-Core Processor, 4 cores, linux/x64. Last run 2026-09-02 (cases `233e564a2bd4`).

| case | shape | validator | jsonschema | gojsonschema | shape / fastest |
|---|---:|---:|---:|---:|---:|
| flat | 492 ns | 327 ns | 1.8 µs | 5.8 µs | 1.5× |
| nested | 1.3 µs | 1.0 µs | 3.5 µs | 9.2 µs | 1.3× |
| array | 21.2 µs | 14.6 µs | 64.4 µs | 185.6 µs | 1.4× |
| bounds | 1.4 µs | 806 ns | 3.4 µs | 5.7 µs | 1.8× |
| invalid | 2.4 µs | – | 3.3 µs | 11.6 µs | 1.0× |
| large | 7.5 µs | 2.3 µs | 17.0 µs | 64.5 µs | 3.3× |

## rs on github:windows-x64

Host `1fee8adaf205`: AMD EPYC 9V74 80-Core Processor, 4 cores, win32/x64. Last run 2026-09-02 (cases `233e564a2bd4`).

| case | shape | garde | validator | jsonschema | shape / fastest |
|---|---:|---:|---:|---:|---:|
| flat | 219 ns | 8 ns | 19 ns | 258 ns | 28.4× |
| nested | 422 ns | 28 ns | 134 ns | 460 ns | 15.2× |
| array | 5.4 µs | 244 ns | 739 ns | 5.9 µs | 22.0× |
| bounds | 424 ns | 34 ns | 38 ns | 258 ns | 12.4× |
| invalid | 3.0 µs | – | – | 153 ns | 19.9× |
| large | 1.3 µs | 39 ns | 60 ns | 2.9 µs | 33.4× |

## rs on github:macos-arm64

Host `ea12b5414dd4`: Apple M1 (Virtual), 3 cores, darwin/arm64. Last run 2026-09-02 (cases `233e564a2bd4`).

| case | shape | garde | validator | jsonschema | shape / fastest |
|---|---:|---:|---:|---:|---:|
| flat | 126 ns | 8 ns | 15 ns | 145 ns | 16.7× |
| nested | 282 ns | 26 ns | 89 ns | 275 ns | 10.8× |
| array | 3.5 µs | 204 ns | 483 ns | 4.6 µs | 17.2× |
| bounds | 242 ns | 23 ns | 24 ns | 150 ns | 10.3× |
| invalid | 1.8 µs | – | – | 104 ns | 17.1× |
| large | 881 ns | 35 ns | 59 ns | 1.8 µs | 24.9× |

## rs on github:linux-x64

Host `f2c2ec319f42`: AMD EPYC 9V74 80-Core Processor, 4 cores, linux/x64. Last run 2026-09-02 (cases `233e564a2bd4`).

| case | shape | garde | validator | jsonschema | shape / fastest |
|---|---:|---:|---:|---:|---:|
| flat | 144 ns | 12 ns | 16 ns | 167 ns | 11.7× |
| nested | 313 ns | 38 ns | 104 ns | 337 ns | 8.1× |
| array | 4.3 µs | 291 ns | 577 ns | 5.4 µs | 14.8× |
| bounds | 314 ns | 33 ns | 33 ns | 194 ns | 9.6× |
| invalid | 2.0 µs | – | – | 136 ns | 15.0× |
| large | 1.1 µs | 53 ns | 65 ns | 2.0 µs | 19.9× |

## ts on github:windows-x64

Host `1fee8adaf205`: AMD EPYC 9V74 80-Core Processor, 4 cores, win32/x64. Last run 2026-09-02 (cases `233e564a2bd4`).

| case | shape | zod | ajv | joi | valibot | shape / fastest |
|---|---:|---:|---:|---:|---:|---:|
| flat | 777 ns | 109 ns | 26 ns | 1.8 µs | 458 ns | 29.8× |
| nested | 1.7 µs | 268 ns | 52 ns | 5.8 µs | 958 ns | 32.4× |
| array | 23.8 µs | 4.8 µs | 752 ns | 81.3 µs | 15.6 µs | 31.7× |
| bounds | 1.6 µs | 605 ns | 65 ns | 2.8 µs | 619 ns | 24.3× |
| invalid | 2.7 µs | 3.2 µs | 36 ns | 2.7 µs | 1.7 µs | 75.5× |
| large | 7.0 µs | 4.7 µs | 3.2 µs | 34.1 µs | 9.0 µs | 2.2× |

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

Host `ea12b5414dd4`: Apple M1 (Virtual), 3 cores, darwin/arm64. Last run 2026-09-02 (cases `233e564a2bd4`).

| case | shape | zod | ajv | joi | valibot | shape / fastest |
|---|---:|---:|---:|---:|---:|---:|
| flat | 617 ns | 119 ns | 25 ns | 1.3 µs | 429 ns | 24.7× |
| nested | 1.4 µs | 273 ns | 59 ns | 4.4 µs | 924 ns | 23.7× |
| array | 19.2 µs | 4.3 µs | 677 ns | 59.8 µs | 15.5 µs | 28.3× |
| bounds | 1.2 µs | 532 ns | 72 ns | 2.0 µs | 647 ns | 16.4× |
| invalid | 1.7 µs | 1.6 µs | 39 ns | 1.6 µs | 1.4 µs | 45.0× |
| large | 5.6 µs | 3.5 µs | 2.3 µs | 26.6 µs | 7.9 µs | 2.4× |

## ts on github:linux-x64

Host `f2c2ec319f42`: AMD EPYC 9V74 80-Core Processor, 4 cores, linux/x64. Last run 2026-09-02 (cases `233e564a2bd4`).

| case | shape | zod | ajv | joi | valibot | shape / fastest |
|---|---:|---:|---:|---:|---:|---:|
| flat | 733 ns | 96 ns | 26 ns | 1.7 µs | 453 ns | 27.7× |
| nested | 1.7 µs | 282 ns | 52 ns | 5.6 µs | 943 ns | 32.1× |
| array | 24.3 µs | 4.4 µs | 746 ns | 79.9 µs | 15.9 µs | 32.6× |
| bounds | 1.5 µs | 621 ns | 66 ns | 2.6 µs | 676 ns | 23.0× |
| invalid | 2.7 µs | 2.7 µs | 37 ns | 2.4 µs | 1.8 µs | 71.7× |
| large | 6.9 µs | 4.5 µs | 2.9 µs | 33.0 µs | 9.0 µs | 2.3× |

# History

Shape's median per case on every run, with the 95th percentile after it, newest last; a cell is filled only when the run measured the case as it is defined now.

## go on github:windows-x64

| run | commit | shape | flat | nested | array | bounds | invalid | large |
|---|---|---|---:|---:|---:|---:|---:|---:|
| 2026-09-02 16:30 | `04f0ddd` | 0.4.0 | 483 ns · 530 ns | 2.8 µs · 3.4 µs | 41.8 µs · 53.4 µs | 2.3 µs · 2.7 µs | 4.8 µs · 5.7 µs | 11.0 µs · 14.5 µs |
| 2026-09-02 19:31 | `0b07d91` | 0.5.0 | 493 ns · 535 ns | 2.7 µs · 3.3 µs | 41.3 µs · 51.2 µs | 1.8 µs · 2.3 µs | 4.4 µs · 5.5 µs | 10.9 µs · 13.2 µs |

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

## go on github:linux-x64

| run | commit | shape | flat | nested | array | bounds | invalid | large |
|---|---|---|---:|---:|---:|---:|---:|---:|
| 2026-09-02 08:25 | `f325abd` | 0.3.0 | 1.9 µs · 2.7 µs | 4.7 µs · 6.8 µs | 61.6 µs · 112.5 µs | 2.0 µs · 5.5 µs | 7.0 µs · 10.2 µs | – |
| 2026-09-02 13:39 | `ab6b663` | 0.3.0 | 1.8 µs · 2.6 µs | 5.2 µs · 6.5 µs | 59.3 µs · 105.3 µs | 2.0 µs · 2.8 µs | 7.1 µs · 9.4 µs | – |
| 2026-09-02 14:20 | `8dc65e2` | 0.3.0 | 1.1 µs · 1.2 µs | 1.9 µs · 3.7 µs | 33.7 µs · 39.4 µs | 1.1 µs · 3.5 µs | 5.6 µs · 7.1 µs | – |
| 2026-09-02 15:37 | `d1228fb` | 0.3.0 | 413 ns · 440 ns | 1.5 µs · 2.0 µs | 26.2 µs · 28.2 µs | 1.4 µs · 1.8 µs | 2.6 µs · 3.7 µs | 6.6 µs · 8.4 µs |
| 2026-09-02 16:29 | `04f0ddd` | 0.4.0 | 355 ns · 364 ns | 1.3 µs · 1.4 µs | 21.4 µs · 24.8 µs | 1.2 µs · 1.5 µs | 2.6 µs · 2.8 µs | 5.1 µs · 5.7 µs |
| 2026-09-02 19:30 | `0b07d91` | 0.5.0 | 492 ns · 499 ns | 1.3 µs · 2.7 µs | 21.2 µs · 39.2 µs | 1.4 µs · 1.8 µs | 2.4 µs · 8.9 µs | 7.5 µs · 8.4 µs |

## rs on github:windows-x64

| run | commit | shape | flat | nested | array | bounds | invalid | large |
|---|---|---|---:|---:|---:|---:|---:|---:|
| 2026-09-02 19:34 | `0b07d91` | 0.1.0 | 219 ns · 232 ns | 422 ns · 450 ns | 5.4 µs · 5.5 µs | 424 ns · 440 ns | 3.0 µs · 6.5 µs | 1.3 µs · 1.4 µs |

## rs on github:macos-arm64

| run | commit | shape | flat | nested | array | bounds | invalid | large |
|---|---|---|---:|---:|---:|---:|---:|---:|
| 2026-09-02 19:33 | `0b07d91` | 0.1.0 | 126 ns · 358 ns | 282 ns · 1.0 µs | 3.5 µs · 8.5 µs | 242 ns · 707 ns | 1.8 µs · 3.4 µs | 881 ns · 2.2 µs |

## rs on github:linux-x64

| run | commit | shape | flat | nested | array | bounds | invalid | large |
|---|---|---|---:|---:|---:|---:|---:|---:|
| 2026-09-02 19:32 | `0b07d91` | 0.1.0 | 144 ns · 149 ns | 313 ns · 318 ns | 4.3 µs · 4.4 µs | 314 ns · 330 ns | 2.0 µs · 2.1 µs | 1.1 µs · 1.1 µs |

## ts on github:windows-x64

| run | commit | shape | flat | nested | array | bounds | invalid | large |
|---|---|---|---:|---:|---:|---:|---:|---:|
| 2026-09-02 16:29 | `04f0ddd` | 11.2.0 | 679 ns · 766 ns | 1.5 µs · 3.1 µs | 23.3 µs · 26.3 µs | 1.5 µs · 1.8 µs | 2.8 µs · 4.9 µs | 7.2 µs · 8.0 µs |
| 2026-09-02 19:29 | `0b07d91` | 11.3.0 | 777 ns · 915 ns | 1.7 µs · 2.1 µs | 23.8 µs · 26.4 µs | 1.6 µs · 1.8 µs | 2.7 µs · 3.1 µs | 7.0 µs · 7.7 µs |

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

## ts on github:linux-x64

| run | commit | shape | flat | nested | array | bounds | invalid | large |
|---|---|---|---:|---:|---:|---:|---:|---:|
| 2026-09-02 08:24 | `f325abd` | 11.1.0 | 2.5 µs · 2.9 µs | 4.9 µs · 5.4 µs | 82.2 µs · 88.5 µs | 3.2 µs · 3.3 µs | 6.4 µs · 7.0 µs | – |
| 2026-09-02 13:38 | `ab6b663` | 11.1.0 | 2.0 µs · 2.2 µs | 4.0 µs · 4.3 µs | 71.8 µs · 78.9 µs | 2.8 µs · 3.0 µs | 5.6 µs · 5.9 µs | – |
| 2026-09-02 14:19 | `8dc65e2` | 11.1.0 | 864 ns · 1.0 µs | 1.7 µs · 2.0 µs | 29.4 µs · 34.8 µs | 1.5 µs · 1.9 µs | 3.0 µs · 3.6 µs | – |
| 2026-09-02 15:36 | `d1228fb` | 11.1.0 | 586 ns · 665 ns | 1.5 µs · 1.8 µs | 22.1 µs · 25.6 µs | 1.5 µs · 1.8 µs | 2.4 µs · 2.8 µs | 6.3 µs · 7.2 µs |
| 2026-09-02 16:28 | `04f0ddd` | 11.2.0 | 501 ns · 564 ns | 1.2 µs · 1.5 µs | 17.6 µs · 19.2 µs | 1.1 µs · 1.2 µs | 2.0 µs · 2.2 µs | 5.2 µs · 5.6 µs |
| 2026-09-02 19:29 | `0b07d91` | 11.3.0 | 733 ns · 821 ns | 1.7 µs · 1.9 µs | 24.3 µs · 27.9 µs | 1.5 µs · 1.8 µs | 2.7 µs · 3.1 µs | 6.9 µs · 7.6 µs |
