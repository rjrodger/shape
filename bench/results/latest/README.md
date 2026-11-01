# Latest measurements

Generated 2026-11-01T04:29:29.696Z from 115 run(s). Times are median nanoseconds per operation; lower is better.

## go on github:windows-x64

Host `1fee8adaf205`: AMD EPYC 9V74 80-Core Processor, 4 cores, win32/x64. Last run 2026-11-01 (cases `233e564a2bd4`).

| case | shape | validator | jsonschema | gojsonschema | shape / fastest |
|---|---:|---:|---:|---:|---:|
| flat | 167 ns | 344 ns | 2.6 µs | 7.0 µs | 1.0× |
| nested | 352 ns | 1.1 µs | 5.2 µs | 11.2 µs | 1.0× |
| array | 4.1 µs | 16.0 µs | 89.0 µs | 227.2 µs | 1.0× |
| bounds | 422 ns | 697 ns | 4.2 µs | 7.7 µs | 1.0× |
| invalid | 2.0 µs | – | 5.2 µs | 15.0 µs | 1.0× |
| large | 930 ns | 2.3 µs | 23.4 µs | 75.8 µs | 1.0× |

## go on linux-xeon-sandbox

Host `80bb4b189998`: Intel(R) Xeon(R) Processor @ 2.10GHz, 4 cores, linux/x64. Last run 2026-09-03 (cases `233e564a2bd4`).

| case | shape | validator | jsonschema | gojsonschema | shape / fastest |
|---|---:|---:|---:|---:|---:|
| flat | 172 ns | 300 ns | 1.6 µs | 5.7 µs | 1.0× |
| nested | 334 ns | 947 ns | 4.2 µs | 9.5 µs | 1.0× |
| array | 3.8 µs | 13.8 µs | 64.0 µs | 190.7 µs | 1.0× |
| bounds | 405 ns | 656 ns | 3.0 µs | 5.8 µs | 1.0× |
| invalid | 1.5 µs | – | 4.9 µs | 11.2 µs | 1.0× |
| large | 858 ns | 2.1 µs | 17.5 µs | 64.7 µs | 1.0× |

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

Host `ea12b5414dd4`: Apple M1 (Virtual), 3 cores, darwin/arm64. Last run 2026-11-01 (cases `233e564a2bd4`).

| case | shape | validator | jsonschema | gojsonschema | shape / fastest |
|---|---:|---:|---:|---:|---:|
| flat | 129 ns | 252 ns | 1.3 µs | 3.9 µs | 1.0× |
| nested | 258 ns | 827 ns | 3.9 µs | 8.9 µs | 1.0× |
| array | 3.1 µs | 11.0 µs | 58.5 µs | 140.7 µs | 1.0× |
| bounds | 309 ns | 442 ns | 2.3 µs | 4.4 µs | 1.0× |
| invalid | 1.0 µs | – | 2.7 µs | 9.5 µs | 1.0× |
| large | 904 ns | 2.1 µs | 12.7 µs | 52.3 µs | 1.0× |

## go on github:linux-x64

Host `f2c2ec319f42`: AMD EPYC 9V74 80-Core Processor, 4 cores, linux/x64. Last run 2026-11-01 (cases `233e564a2bd4`).

| case | shape | validator | jsonschema | gojsonschema | shape / fastest |
|---|---:|---:|---:|---:|---:|
| flat | 127 ns | 226 ns | 1.4 µs | 4.1 µs | 1.0× |
| nested | 265 ns | 712 ns | 2.5 µs | 6.6 µs | 1.0× |
| array | 3.2 µs | 9.9 µs | 46.3 µs | 128.4 µs | 1.0× |
| bounds | 314 ns | 539 ns | 2.5 µs | 4.2 µs | 1.0× |
| invalid | 1.0 µs | – | 3.1 µs | 8.5 µs | 1.0× |
| large | 787 ns | 1.6 µs | 12.3 µs | 46.4 µs | 1.0× |

## rs on github:windows-x64

Host `1fee8adaf205`: AMD EPYC 9V74 80-Core Processor, 4 cores, win32/x64. Last run 2026-11-01 (cases `233e564a2bd4`).

| case | shape | garde | validator | jsonschema | shape / fastest |
|---|---:|---:|---:|---:|---:|
| flat | 72 ns | 6 ns | 19 ns | 176 ns | 11.5× |
| nested | 139 ns | 28 ns | 145 ns | 356 ns | 5.0× |
| array | 1.6 µs | 189 ns | 670 ns | 5.1 µs | 8.2× |
| bounds | 360 ns | 31 ns | 30 ns | 196 ns | 11.8× |
| invalid | 1.4 µs | – | – | 128 ns | 11.2× |
| large | 396 ns | 43 ns | 71 ns | 1.7 µs | 9.2× |

## rs on linux-xeon-sandbox

Host `80bb4b189998`: Intel(R) Xeon(R) Processor @ 2.10GHz, 4 cores, linux/x64. Last run 2026-09-03 (cases `233e564a2bd4`).

| case | shape | garde | validator | jsonschema | shape / fastest |
|---|---:|---:|---:|---:|---:|
| flat | 49 ns | 11 ns | 20 ns | 142 ns | 4.3× |
| nested | 101 ns | 42 ns | 106 ns | 299 ns | 2.4× |
| array | 1.2 µs | 211 ns | 585 ns | 4.3 µs | 5.8× |
| bounds | 237 ns | 29 ns | 29 ns | 176 ns | 8.3× |
| invalid | 885 ns | – | – | 106 ns | 8.4× |
| large | 285 ns | 63 ns | 97 ns | 1.5 µs | 4.5× |

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

Host `ea12b5414dd4`: Apple M1 (Virtual), 3 cores, darwin/arm64. Last run 2026-11-01 (cases `233e564a2bd4`).

| case | shape | garde | validator | jsonschema | shape / fastest |
|---|---:|---:|---:|---:|---:|
| flat | 59 ns | 13 ns | 15 ns | 205 ns | 4.6× |
| nested | 120 ns | 29 ns | 109 ns | 310 ns | 4.1× |
| array | 1.5 µs | 226 ns | 529 ns | 4.9 µs | 6.4× |
| bounds | 210 ns | 24 ns | 24 ns | 159 ns | 8.9× |
| invalid | 758 ns | – | – | 103 ns | 7.4× |
| large | 461 ns | 43 ns | 69 ns | 1.7 µs | 10.8× |

## rs on github:linux-x64

Host `f2c2ec319f42`: AMD EPYC 9V74 80-Core Processor, 4 cores, linux/x64. Last run 2026-11-01 (cases `233e564a2bd4`).

| case | shape | garde | validator | jsonschema | shape / fastest |
|---|---:|---:|---:|---:|---:|
| flat | 45 ns | 8 ns | 14 ns | 137 ns | 5.9× |
| nested | 84 ns | 28 ns | 84 ns | 290 ns | 3.0× |
| array | 1.1 µs | 197 ns | 466 ns | 4.2 µs | 5.5× |
| bounds | 224 ns | 27 ns | 25 ns | 150 ns | 8.9× |
| invalid | 627 ns | – | – | 110 ns | 5.7× |
| large | 296 ns | 38 ns | 46 ns | 1.4 µs | 7.8× |

## ts on github:windows-x64

Host `1fee8adaf205`: AMD EPYC 9V74 80-Core Processor, 4 cores, win32/x64. Last run 2026-11-01 (cases `233e564a2bd4`).

| case | shape | zod | ajv | joi | valibot | shape / fastest |
|---|---:|---:|---:|---:|---:|---:|
| flat | 260 ns | 111 ns | 25 ns | 2.0 µs | 460 ns | 10.5× |
| nested | 966 ns | 298 ns | 54 ns | 6.5 µs | 1.2 µs | 18.1× |
| array | 8.7 µs | 4.7 µs | 745 ns | 91.3 µs | 15.7 µs | 11.7× |
| bounds | 1.2 µs | 625 ns | 63 ns | 2.8 µs | 683 ns | 18.4× |
| invalid | 2.2 µs | 3.2 µs | 54 ns | 2.9 µs | 2.0 µs | 40.6× |
| large | 1.4 µs | 2.4 µs | 457 ns | 22.8 µs | 8.6 µs | 3.1× |

## ts on linux-xeon-sandbox

Host `80bb4b189998`: Intel(R) Xeon(R) Processor @ 2.10GHz, 4 cores, linux/x64. Last run 2026-09-03 (cases `233e564a2bd4`).

| case | shape | zod | ajv | joi | valibot | shape / fastest |
|---|---:|---:|---:|---:|---:|---:|
| flat | 209 ns | 81 ns | 28 ns | 1.7 µs | 636 ns | 7.6× |
| nested | 814 ns | 244 ns | 60 ns | 6.2 µs | 1.3 µs | 13.6× |
| array | 8.3 µs | 4.5 µs | 833 ns | 92.6 µs | 20.9 µs | 10.0× |
| bounds | 1.0 µs | 584 ns | 76 ns | 2.7 µs | 740 ns | 13.4× |
| invalid | 1.8 µs | 2.6 µs | 36 ns | 2.5 µs | 1.9 µs | 49.9× |
| large | 1.5 µs | 2.5 µs | 446 ns | 22.3 µs | 9.1 µs | 3.3× |

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

Host `ea12b5414dd4`: Apple M1 (Virtual), 3 cores, darwin/arm64. Last run 2026-11-01 (cases `233e564a2bd4`).

| case | shape | zod | ajv | joi | valibot | shape / fastest |
|---|---:|---:|---:|---:|---:|---:|
| flat | 212 ns | 101 ns | 26 ns | 1.3 µs | 460 ns | 8.1× |
| nested | 725 ns | 252 ns | 56 ns | 4.7 µs | 923 ns | 12.8× |
| array | 6.8 µs | 4.9 µs | 852 ns | 58.4 µs | 16.9 µs | 7.9× |
| bounds | 634 ns | 561 ns | 71 ns | 1.8 µs | 620 ns | 8.9× |
| invalid | 1.3 µs | 1.8 µs | 43 ns | 1.6 µs | 1.5 µs | 29.9× |
| large | 1.2 µs | 1.9 µs | 518 ns | 16.7 µs | 8.0 µs | 2.4× |

## ts on github:linux-x64

Host `f2c2ec319f42`: AMD EPYC 9V74 80-Core Processor, 4 cores, linux/x64. Last run 2026-11-01 (cases `233e564a2bd4`).

| case | shape | zod | ajv | joi | valibot | shape / fastest |
|---|---:|---:|---:|---:|---:|---:|
| flat | 182 ns | 84 ns | 20 ns | 1.3 µs | 349 ns | 8.9× |
| nested | 549 ns | 207 ns | 42 ns | 4.3 µs | 777 ns | 13.2× |
| array | 5.9 µs | 3.6 µs | 585 ns | 60.4 µs | 12.3 µs | 10.1× |
| bounds | 603 ns | 593 ns | 51 ns | 2.1 µs | 521 ns | 11.8× |
| invalid | 1.4 µs | 2.2 µs | 31 ns | 2.0 µs | 1.4 µs | 44.5× |
| large | 1.1 µs | 1.6 µs | 361 ns | 14.5 µs | 6.5 µs | 3.1× |

# History

Shape's median per case on every run, with the 95th percentile after it, newest last; a cell is filled only when the run measured the case as it is defined now.

## go on github:windows-x64

| run | commit | shape | flat | nested | array | bounds | invalid | large |
|---|---|---|---:|---:|---:|---:|---:|---:|
| 2026-09-02 16:30 | `04f0ddd` | 0.4.0 | 483 ns · 530 ns | 2.8 µs · 3.4 µs | 41.8 µs · 53.4 µs | 2.3 µs · 2.7 µs | 4.8 µs · 5.7 µs | 11.0 µs · 14.5 µs |
| 2026-09-02 19:31 | `0b07d91` | 0.5.0 | 493 ns · 535 ns | 2.7 µs · 3.3 µs | 41.3 µs · 51.2 µs | 1.8 µs · 2.3 µs | 4.4 µs · 5.5 µs | 10.9 µs · 13.2 µs |
| 2026-09-03 09:22 | `e07fe77` | 0.5.0 | 483 ns · 512 ns | 2.6 µs · 3.1 µs | 41.1 µs · 51.6 µs | 1.8 µs · 2.4 µs | 4.2 µs · 5.7 µs | 10.5 µs · 13.3 µs |
| 2026-09-03 09:59 | `f82adf1` | 0.5.1 | 497 ns · 600 ns | 2.8 µs · 3.4 µs | 41.4 µs · 48.8 µs | 1.9 µs · 2.4 µs | 4.5 µs · 5.6 µs | 10.7 µs · 13.1 µs |
| 2026-09-03 15:53 | `85f9747` | 0.5.2 | 158 ns · 170 ns | 365 ns · 393 ns | 4.1 µs · 4.5 µs | 434 ns · 503 ns | 2.1 µs · 2.9 µs | 1.0 µs · 1.1 µs |
| 2026-09-03 16:53 | `7e8ad9d` | 0.5.2 | 176 ns · 195 ns | 374 ns · 410 ns | 4.7 µs · 5.1 µs | 438 ns · 473 ns | 2.3 µs · 2.8 µs | 1.1 µs · 1.1 µs |
| 2026-10-01 04:39 | `2826b78` | 0.5.3 | 161 ns · 201 ns | 338 ns · 363 ns | 4.1 µs · 4.2 µs | 408 ns · 433 ns | 2.4 µs · 3.4 µs | 1.0 µs · 1.1 µs |
| 2026-11-01 04:26 | `7d1e8c2` | 0.5.3 | 167 ns · 186 ns | 352 ns · 387 ns | 4.1 µs · 4.4 µs | 422 ns · 450 ns | 2.0 µs · 2.6 µs | 930 ns · 1.0 µs |

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
| 2026-09-03 15:31 | `a4f13a2` | 0.5.1 | 180 ns · 208 ns | 337 ns · 367 ns | 3.9 µs · 4.4 µs | 415 ns · 457 ns | 1.5 µs · 2.6 µs | 922 ns · 1.0 µs |
| 2026-09-03 15:48 | `ca16e3c` | 0.5.2 | 172 ns · 186 ns | 334 ns · 373 ns | 3.8 µs · 4.1 µs | 405 ns · 448 ns | 1.5 µs · 3.0 µs | 858 ns · 956 ns |

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
| 2026-09-03 15:52 | `85f9747` | 0.5.2 | 155 ns · 353 ns | 291 ns · 717 ns | 3.6 µs · 9.0 µs | 319 ns · 764 ns | 1.6 µs · 3.5 µs | 903 ns · 2.4 µs |
| 2026-09-03 16:52 | `7e8ad9d` | 0.5.2 | 132 ns · 322 ns | 273 ns · 679 ns | 3.3 µs · 8.0 µs | 319 ns · 728 ns | 1.1 µs · 2.2 µs | 917 ns · 2.3 µs |
| 2026-10-01 04:38 | `2826b78` | 0.5.3 | 130 ns · 184 ns | 273 ns · 355 ns | 3.3 µs · 5.4 µs | 289 ns · 395 ns | 948 ns · 4.0 µs | 833 ns · 1.3 µs |
| 2026-11-01 04:25 | `7d1e8c2` | 0.5.3 | 129 ns · 335 ns | 258 ns · 676 ns | 3.1 µs · 8.5 µs | 309 ns · 779 ns | 1.0 µs · 2.3 µs | 904 ns · 2.4 µs |

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
| 2026-09-03 15:52 | `85f9747` | 0.5.2 | 186 ns · 189 ns | 361 ns · 378 ns | 4.5 µs · 4.7 µs | 420 ns · 435 ns | 1.4 µs · 2.7 µs | 1.1 µs · 1.1 µs |
| 2026-09-03 16:52 | `7e8ad9d` | 0.5.2 | 185 ns · 191 ns | 365 ns · 380 ns | 4.6 µs · 4.8 µs | 420 ns · 436 ns | 1.4 µs · 2.6 µs | 1.1 µs · 1.1 µs |
| 2026-10-01 04:38 | `2826b78` | 0.5.3 | 170 ns · 173 ns | 349 ns · 362 ns | 4.1 µs · 4.2 µs | 418 ns · 429 ns | 1.5 µs · 2.4 µs | 958 ns · 988 ns |
| 2026-11-01 04:25 | `7d1e8c2` | 0.5.3 | 127 ns · 130 ns | 265 ns · 273 ns | 3.2 µs · 3.3 µs | 314 ns · 323 ns | 1.0 µs · 1.5 µs | 787 ns · 806 ns |

## rs on github:windows-x64

| run | commit | shape | flat | nested | array | bounds | invalid | large |
|---|---|---|---:|---:|---:|---:|---:|---:|
| 2026-09-02 19:34 | `0b07d91` | 0.1.0 | 219 ns · 232 ns | 422 ns · 450 ns | 5.4 µs · 5.5 µs | 424 ns · 440 ns | 3.0 µs · 6.5 µs | 1.3 µs · 1.4 µs |
| 2026-09-03 09:25 | `e07fe77` | 0.1.0 | 130 ns · 136 ns | 189 ns · 198 ns | 1.6 µs · 1.7 µs | 422 ns · 435 ns | 2.7 µs · 2.8 µs | 448 ns · 477 ns |
| 2026-09-03 10:02 | `f82adf1` | 0.1.1 | 137 ns · 149 ns | 207 ns · 217 ns | 1.6 µs · 1.6 µs | 435 ns · 465 ns | 2.7 µs · 3.3 µs | 462 ns · 489 ns |
| 2026-09-03 15:55 | `85f9747` | 0.2.0 | 80 ns · 85 ns | 141 ns · 150 ns | 1.6 µs · 1.6 µs | 353 ns · 367 ns | 1.2 µs · 1.4 µs | 402 ns · 452 ns |
| 2026-09-03 16:56 | `7e8ad9d` | 0.2.0 | 82 ns · 87 ns | 149 ns · 162 ns | 1.5 µs · 1.6 µs | 385 ns · 400 ns | 1.3 µs · 1.3 µs | 404 ns · 432 ns |
| 2026-10-01 04:42 | `2826b78` | 0.2.1 | 87 ns · 92 ns | 142 ns · 251 ns | 1.6 µs · 2.9 µs | 357 ns · 1.0 µs | 1.2 µs · 2.1 µs | 401 ns · 1.2 µs |
| 2026-11-01 04:29 | `7d1e8c2` | 0.2.1 | 72 ns · 79 ns | 139 ns · 147 ns | 1.6 µs · 1.6 µs | 360 ns · 373 ns | 1.4 µs · 2.8 µs | 396 ns · 596 ns |

## rs on linux-xeon-sandbox

| run | commit | shape | flat | nested | array | bounds | invalid | large |
|---|---|---|---:|---:|---:|---:|---:|---:|
| 2026-09-03 15:32 | `a4f13a2` | 0.1.1 | 50 ns · 53 ns | 102 ns · 108 ns | 1.2 µs · 1.3 µs | 239 ns · 263 ns | 797 ns · 869 ns | 278 ns · 298 ns |
| 2026-09-03 15:49 | `ca16e3c` | 0.2.0 | 49 ns · 53 ns | 101 ns · 119 ns | 1.2 µs · 1.4 µs | 237 ns · 260 ns | 885 ns · 1.0 µs | 285 ns · 300 ns |

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
| 2026-09-03 15:55 | `85f9747` | 0.2.0 | 62 ns · 147 ns | 114 ns · 350 ns | 1.5 µs · 3.8 µs | 201 ns · 641 ns | 739 ns · 2.0 µs | 455 ns · 855 ns |
| 2026-09-03 16:54 | `7e8ad9d` | 0.2.0 | 55 ns · 135 ns | 119 ns · 270 ns | 1.4 µs · 3.4 µs | 233 ns · 870 ns | 751 ns · 2.1 µs | 461 ns · 1.1 µs |
| 2026-10-01 04:41 | `2826b78` | 0.2.1 | 53 ns · 112 ns | 111 ns · 206 ns | 1.5 µs · 2.4 µs | 220 ns · 467 ns | 784 ns · 1.3 µs | 498 ns · 850 ns |
| 2026-11-01 04:28 | `7d1e8c2` | 0.2.1 | 59 ns · 142 ns | 120 ns · 279 ns | 1.5 µs · 4.1 µs | 210 ns · 612 ns | 758 ns · 2.1 µs | 461 ns · 1.0 µs |

## rs on github:linux-x64

| run | commit | shape | flat | nested | array | bounds | invalid | large |
|---|---|---|---:|---:|---:|---:|---:|---:|
| 2026-09-02 19:32 | `0b07d91` | 0.1.0 | 144 ns · 149 ns | 313 ns · 318 ns | 4.3 µs · 4.4 µs | 314 ns · 330 ns | 2.0 µs · 2.1 µs | 1.1 µs · 1.1 µs |
| 2026-09-03 09:24 | `e07fe77` | 0.1.0 | 78 ns · 78 ns | 133 ns · 134 ns | 1.5 µs · 1.5 µs | 299 ns · 304 ns | 1.9 µs · 1.9 µs | 401 ns · 423 ns |
| 2026-09-03 09:59 | `f82adf1` | 0.1.1 | 64 ns · 65 ns | 107 ns · 110 ns | 1.1 µs · 1.1 µs | 233 ns · 238 ns | 1.5 µs · 1.5 µs | 287 ns · 290 ns |
| 2026-09-03 15:54 | `85f9747` | 0.2.0 | 60 ns · 61 ns | 111 ns · 114 ns | 1.4 µs · 1.5 µs | 268 ns · 272 ns | 833 ns · 846 ns | 383 ns · 384 ns |
| 2026-09-03 16:54 | `7e8ad9d` | 0.2.0 | 59 ns · 60 ns | 115 ns · 118 ns | 1.4 µs · 1.4 µs | 262 ns · 267 ns | 808 ns · 822 ns | 366 ns · 368 ns |
| 2026-10-01 04:40 | `2826b78` | 0.2.1 | 47 ns · 48 ns | 95 ns · 96 ns | 1.1 µs · 1.1 µs | 254 ns · 256 ns | 868 ns · 873 ns | 243 ns · 252 ns |
| 2026-11-01 04:26 | `7d1e8c2` | 0.2.1 | 45 ns · 45 ns | 84 ns · 85 ns | 1.1 µs · 1.1 µs | 224 ns · 227 ns | 627 ns · 636 ns | 296 ns · 299 ns |

## ts on github:windows-x64

| run | commit | shape | flat | nested | array | bounds | invalid | large |
|---|---|---|---:|---:|---:|---:|---:|---:|
| 2026-09-03 15:51 | `85f9747` | 11.3.2 | 217 ns · 288 ns | 716 ns · 790 ns | 7.6 µs · 8.5 µs | 782 ns · 916 ns | 1.8 µs · 2.1 µs | 1.5 µs · 1.7 µs |
| 2026-09-03 16:51 | `7e8ad9d` | 11.3.2 | 265 ns · 308 ns | 814 ns · 903 ns | 8.5 µs · 9.5 µs | 860 ns · 968 ns | 1.9 µs · 2.1 µs | 1.4 µs · 1.6 µs |
| 2026-10-01 04:38 | `2826b78` | 11.4.1 | 244 ns · 419 ns | 712 ns · 1.3 µs | 7.7 µs · 14.3 µs | 787 ns · 1.5 µs | 1.7 µs · 3.2 µs | 1.5 µs · 2.3 µs |
| 2026-11-01 04:24 | `7d1e8c2` | 11.4.1 | 260 ns · 338 ns | 966 ns · 1.2 µs | 8.7 µs · 10.7 µs | 1.2 µs · 1.4 µs | 2.2 µs · 2.6 µs | 1.4 µs · 1.8 µs |

## ts on linux-xeon-sandbox

| run | commit | shape | flat | nested | array | bounds | invalid | large |
|---|---|---|---:|---:|---:|---:|---:|---:|
| 2026-09-03 15:31 | `a4f13a2` | 11.3.1 | 219 ns · 275 ns | 726 ns · 857 ns | 8.1 µs · 10.1 µs | 894 ns · 1.2 µs | 1.9 µs · 2.4 µs | 1.5 µs · 1.9 µs |
| 2026-09-03 15:47 | `ca16e3c` | 11.3.2 | 209 ns · 261 ns | 814 ns · 1.0 µs | 8.3 µs · 11.4 µs | 1.0 µs · 1.3 µs | 1.8 µs · 2.2 µs | 1.5 µs · 1.9 µs |

## ts on linux-xeon-sandbox

| run | commit | shape | flat | nested | array | bounds | invalid | large |
|---|---|---|---:|---:|---:|---:|---:|---:|
| 2026-09-02 08:05 | `fb2015e` | 11.0.1 | 3.5 µs · 5.4 µs | 6.4 µs · 8.7 µs | 105.8 µs · 142.5 µs | 4.0 µs · 6.6 µs | 8.5 µs · 13.8 µs | – |
| 2026-09-02 08:24 | `5085fc0` | 11.1.0 | 3.5 µs · 5.0 µs | 6.7 µs · 10.5 µs | 110.0 µs · 154.6 µs | 5.1 µs · 6.6 µs | 10.9 µs · 14.1 µs | – |

## ts on github:macos-arm64

| run | commit | shape | flat | nested | array | bounds | invalid | large |
|---|---|---|---:|---:|---:|---:|---:|---:|
| 2026-09-03 15:51 | `85f9747` | 11.3.2 | 243 ns · 644 ns | 612 ns · 1.5 µs | 7.0 µs · 18.4 µs | 719 ns · 2.1 µs | 1.4 µs · 3.4 µs | 1.3 µs · 3.7 µs |
| 2026-09-03 16:51 | `7e8ad9d` | 11.3.2 | 220 ns · 519 ns | 652 ns · 1.6 µs | 7.8 µs · 17.4 µs | 646 ns · 998 ns | 1.2 µs · 3.0 µs | 1.2 µs · 1.8 µs |
| 2026-10-01 04:37 | `2826b78` | 11.4.1 | 234 ns · 565 ns | 607 ns · 1.2 µs | 6.9 µs · 14.5 µs | 666 ns · 1.1 µs | 1.3 µs · 2.2 µs | 1.3 µs · 2.5 µs |
| 2026-11-01 04:24 | `7d1e8c2` | 11.4.1 | 212 ns · 671 ns | 725 ns · 2.0 µs | 6.8 µs · 18.7 µs | 634 ns · 2.0 µs | 1.3 µs · 3.8 µs | 1.2 µs · 3.7 µs |

## ts on github:linux-x64

| run | commit | shape | flat | nested | array | bounds | invalid | large |
|---|---|---|---:|---:|---:|---:|---:|---:|
| 2026-09-03 15:51 | `85f9747` | 11.3.2 | 249 ns · 279 ns | 817 ns · 909 ns | 7.6 µs · 8.4 µs | 867 ns · 961 ns | 1.9 µs · 2.1 µs | 1.4 µs · 1.6 µs |
| 2026-09-03 16:51 | `7e8ad9d` | 11.3.2 | 251 ns · 285 ns | 809 ns · 898 ns | 8.0 µs · 9.0 µs | 859 ns · 963 ns | 1.9 µs · 2.1 µs | 1.4 µs · 1.6 µs |
| 2026-10-01 04:37 | `2826b78` | 11.4.1 | 248 ns · 289 ns | 885 ns · 986 ns | 8.2 µs · 9.6 µs | 1.0 µs · 1.2 µs | 2.1 µs · 2.5 µs | 1.4 µs · 1.6 µs |
| 2026-11-01 04:24 | `7d1e8c2` | 11.4.1 | 182 ns · 188 ns | 549 ns · 596 ns | 5.9 µs · 6.5 µs | 603 ns · 659 ns | 1.4 µs · 1.5 µs | 1.1 µs · 1.2 µs |
