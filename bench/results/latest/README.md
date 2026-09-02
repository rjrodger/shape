# Latest measurements

Generated 2026-09-02T16:31:05.714Z from 45 run(s). Times are median nanoseconds per operation; lower is better.

## go on github:windows-x64

Host `1fee8adaf205`: AMD EPYC 9V74 80-Core Processor, 4 cores, win32/x64. Last run 2026-09-02 (cases `233e564a2bd4`).

| case | shape | validator | jsonschema | gojsonschema | shape / fastest |
|---|---:|---:|---:|---:|---:|
| flat | 483 ns | 324 ns | 2.6 µs | 7.3 µs | 1.5× |
| nested | 2.8 µs | 1.2 µs | 5.1 µs | 11.9 µs | 2.3× |
| array | 41.8 µs | 16.5 µs | 94.6 µs | 242.7 µs | 2.5× |
| bounds | 2.3 µs | 779 ns | 4.6 µs | 7.5 µs | 3.0× |
| invalid | 4.8 µs | – | 5.2 µs | 15.3 µs | 1.0× |
| large | 11.0 µs | 2.5 µs | 23.9 µs | 77.8 µs | 4.3× |

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
| flat | 404 ns | 269 ns | 1.7 µs | 4.1 µs | 1.5× |
| nested | 1.5 µs | 807 ns | 2.9 µs | 8.6 µs | 1.9× |
| array | 27.4 µs | 11.1 µs | 53.3 µs | 166.1 µs | 2.5× |
| bounds | 1.3 µs | 482 ns | 3.0 µs | 4.0 µs | 2.7× |
| invalid | 2.8 µs | – | 3.9 µs | 11.8 µs | 1.0× |
| large | 6.5 µs | 1.9 µs | 21.4 µs | 60.7 µs | 3.5× |

## go on github:linux-x64

Host `f2c2ec319f42`: AMD EPYC 9V74 80-Core Processor, 4 cores, linux/x64. Last run 2026-09-02 (cases `233e564a2bd4`).

| case | shape | validator | jsonschema | gojsonschema | shape / fastest |
|---|---:|---:|---:|---:|---:|
| flat | 355 ns | 241 ns | 1.3 µs | 4.4 µs | 1.5× |
| nested | 1.3 µs | 773 ns | 2.7 µs | 7.1 µs | 1.7× |
| array | 21.4 µs | 10.8 µs | 48.5 µs | 141.4 µs | 2.0× |
| bounds | 1.2 µs | 519 ns | 2.4 µs | 4.4 µs | 2.3× |
| invalid | 2.6 µs | – | 2.6 µs | 8.9 µs | 1.0× |
| large | 5.1 µs | 1.6 µs | 12.4 µs | 49.0 µs | 3.2× |

## ts on github:windows-x64

Host `1fee8adaf205`: AMD EPYC 9V74 80-Core Processor, 4 cores, win32/x64. Last run 2026-09-02 (cases `233e564a2bd4`).

| case | shape | zod | ajv | joi | valibot | shape / fastest |
|---|---:|---:|---:|---:|---:|---:|
| flat | 679 ns | 103 ns | 26 ns | 1.9 µs | 479 ns | 26.0× |
| nested | 1.5 µs | 273 ns | 53 ns | 5.9 µs | 938 ns | 29.1× |
| array | 23.3 µs | 4.6 µs | 751 ns | 82.4 µs | 15.2 µs | 31.0× |
| bounds | 1.5 µs | 655 ns | 63 ns | 2.7 µs | 611 ns | 23.9× |
| invalid | 2.8 µs | 3.1 µs | 40 ns | 2.9 µs | 1.7 µs | 69.2× |
| large | 7.2 µs | 4.8 µs | 3.1 µs | 31.2 µs | 8.6 µs | 2.4× |

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
| flat | 556 ns | 101 ns | 28 ns | 1.6 µs | 433 ns | 19.7× |
| nested | 1.5 µs | 276 ns | 58 ns | 4.6 µs | 895 ns | 25.1× |
| array | 18.9 µs | 4.2 µs | 668 ns | 53.6 µs | 14.1 µs | 28.3× |
| bounds | 1.2 µs | 488 ns | 73 ns | 2.1 µs | 598 ns | 15.9× |
| invalid | 1.8 µs | 1.6 µs | 42 ns | 1.6 µs | 1.5 µs | 42.4× |
| large | 5.5 µs | 3.5 µs | 2.7 µs | 29.0 µs | 8.6 µs | 2.0× |

## ts on github:linux-x64

Host `f2c2ec319f42`: AMD EPYC 9V74 80-Core Processor, 4 cores, linux/x64. Last run 2026-09-02 (cases `233e564a2bd4`).

| case | shape | zod | ajv | joi | valibot | shape / fastest |
|---|---:|---:|---:|---:|---:|---:|
| flat | 501 ns | 60 ns | 22 ns | 1.3 µs | 358 ns | 23.0× |
| nested | 1.2 µs | 176 ns | 44 ns | 4.1 µs | 718 ns | 27.5× |
| array | 17.6 µs | 2.9 µs | 644 ns | 53.7 µs | 12.4 µs | 27.4× |
| bounds | 1.1 µs | 407 ns | 57 ns | 1.8 µs | 491 ns | 20.0× |
| invalid | 2.0 µs | 2.0 µs | 27 ns | 1.8 µs | 1.3 µs | 74.3× |
| large | 5.2 µs | 3.4 µs | 2.4 µs | 23.3 µs | 6.7 µs | 2.2× |

# History

Shape's median per case on every run, with the 95th percentile after it, newest last; a cell is filled only when the run measured the case as it is defined now.

## go on github:windows-x64

| run | commit | shape | flat | nested | array | bounds | invalid | large |
|---|---|---|---:|---:|---:|---:|---:|---:|
| 2026-09-02 16:30 | `04f0ddd` | 0.4.0 | 483 ns · 530 ns | 2.8 µs · 3.4 µs | 41.8 µs · 53.4 µs | 2.3 µs · 2.7 µs | 4.8 µs · 5.7 µs | 11.0 µs · 14.5 µs |

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

## go on github:linux-x64

| run | commit | shape | flat | nested | array | bounds | invalid | large |
|---|---|---|---:|---:|---:|---:|---:|---:|
| 2026-09-02 08:25 | `f325abd` | 0.3.0 | 1.9 µs · 2.7 µs | 4.7 µs · 6.8 µs | 61.6 µs · 112.5 µs | 2.0 µs · 5.5 µs | 7.0 µs · 10.2 µs | – |
| 2026-09-02 13:39 | `ab6b663` | 0.3.0 | 1.8 µs · 2.6 µs | 5.2 µs · 6.5 µs | 59.3 µs · 105.3 µs | 2.0 µs · 2.8 µs | 7.1 µs · 9.4 µs | – |
| 2026-09-02 14:20 | `8dc65e2` | 0.3.0 | 1.1 µs · 1.2 µs | 1.9 µs · 3.7 µs | 33.7 µs · 39.4 µs | 1.1 µs · 3.5 µs | 5.6 µs · 7.1 µs | – |
| 2026-09-02 15:37 | `d1228fb` | 0.3.0 | 413 ns · 440 ns | 1.5 µs · 2.0 µs | 26.2 µs · 28.2 µs | 1.4 µs · 1.8 µs | 2.6 µs · 3.7 µs | 6.6 µs · 8.4 µs |
| 2026-09-02 16:29 | `04f0ddd` | 0.4.0 | 355 ns · 364 ns | 1.3 µs · 1.4 µs | 21.4 µs · 24.8 µs | 1.2 µs · 1.5 µs | 2.6 µs · 2.8 µs | 5.1 µs · 5.7 µs |

## ts on github:windows-x64

| run | commit | shape | flat | nested | array | bounds | invalid | large |
|---|---|---|---:|---:|---:|---:|---:|---:|
| 2026-09-02 16:29 | `04f0ddd` | 11.2.0 | 679 ns · 766 ns | 1.5 µs · 3.1 µs | 23.3 µs · 26.3 µs | 1.5 µs · 1.8 µs | 2.8 µs · 4.9 µs | 7.2 µs · 8.0 µs |

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

## ts on github:linux-x64

| run | commit | shape | flat | nested | array | bounds | invalid | large |
|---|---|---|---:|---:|---:|---:|---:|---:|
| 2026-09-02 08:24 | `f325abd` | 11.1.0 | 2.5 µs · 2.9 µs | 4.9 µs · 5.4 µs | 82.2 µs · 88.5 µs | 3.2 µs · 3.3 µs | 6.4 µs · 7.0 µs | – |
| 2026-09-02 13:38 | `ab6b663` | 11.1.0 | 2.0 µs · 2.2 µs | 4.0 µs · 4.3 µs | 71.8 µs · 78.9 µs | 2.8 µs · 3.0 µs | 5.6 µs · 5.9 µs | – |
| 2026-09-02 14:19 | `8dc65e2` | 11.1.0 | 864 ns · 1.0 µs | 1.7 µs · 2.0 µs | 29.4 µs · 34.8 µs | 1.5 µs · 1.9 µs | 3.0 µs · 3.6 µs | – |
| 2026-09-02 15:36 | `d1228fb` | 11.1.0 | 586 ns · 665 ns | 1.5 µs · 1.8 µs | 22.1 µs · 25.6 µs | 1.5 µs · 1.8 µs | 2.4 µs · 2.8 µs | 6.3 µs · 7.2 µs |
| 2026-09-02 16:28 | `04f0ddd` | 11.2.0 | 501 ns · 564 ns | 1.2 µs · 1.5 µs | 17.6 µs · 19.2 µs | 1.1 µs · 1.2 µs | 2.0 µs · 2.2 µs | 5.2 µs · 5.6 µs |
