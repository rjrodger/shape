# Latest measurements

Generated 2026-09-02T15:10:24.173Z from 30 run(s). Times are median nanoseconds per operation; lower is better.

## go on github:windows-x64

Host `1fee8adaf205`: AMD EPYC 9V74 80-Core Processor, 4 cores, win32/x64. Last run 2026-09-02 (cases `c1a75d4a6878`).

| case | shape | validator | jsonschema | gojsonschema | shape / fastest |
|---|---:|---:|---:|---:|---:|
| flat | 1.7 µs | 367 ns | 2.9 µs | 8.2 µs | 4.7× |
| nested | 3.8 µs | 1.3 µs | 5.9 µs | 13.2 µs | 3.0× |
| array | 48.4 µs | 18.2 µs | 105.4 µs | 255.4 µs | 2.7× |
| bounds | 2.3 µs | 849 ns | 4.9 µs | 8.2 µs | 2.7× |
| invalid | 7.5 µs | – | 6.0 µs | 17.0 µs | 1.3× |
| large | – | – | – | – | – |

## go on linux-xeon-sandbox

Host `80bb4b189998`: Intel(R) Xeon(R) Processor @ 2.10GHz, 4 cores, linux/x64. Last run 2026-09-02 (cases `233e564a2bd4`).

| case | shape | validator | jsonschema | gojsonschema | shape / fastest |
|---|---:|---:|---:|---:|---:|
| flat | 457 ns | 361 ns | 2.3 µs | 7.0 µs | 1.3× |
| nested | 2.4 µs | 1.1 µs | 4.7 µs | 11.0 µs | 2.1× |
| array | 38.4 µs | 14.2 µs | 65.9 µs | 203.5 µs | 2.7× |
| bounds | 1.7 µs | 711 ns | 3.6 µs | 6.0 µs | 2.4× |
| invalid | 3.5 µs | – | 3.7 µs | 12.6 µs | 1.0× |
| large | 8.7 µs | – | 18.0 µs | 67.6 µs | 1.0× |

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

Host `ea12b5414dd4`: Apple M1 (Virtual), 3 cores, darwin/arm64. Last run 2026-09-02 (cases `64dd85eab212`).

| case | shape | validator | jsonschema | gojsonschema | shape / fastest |
|---|---:|---:|---:|---:|---:|
| flat | 1.0 µs | 245 ns | 1.5 µs | 4.0 µs | 4.2× |
| nested | 2.2 µs | 790 ns | 3.3 µs | 6.0 µs | 2.8× |
| array | 17.2 µs | 10.2 µs | 41.3 µs | 132.8 µs | 1.7× |
| bounds | 1.1 µs | 458 ns | 2.1 µs | 3.6 µs | 2.5× |
| invalid | 3.3 µs | – | 2.8 µs | 7.9 µs | 1.2× |
| large | – | – | – | – | – |

## go on github:linux-x64

Host `f2c2ec319f42`: AMD EPYC 9V74 80-Core Processor, 4 cores, linux/x64. Last run 2026-09-02 (cases `64dd85eab212`).

| case | shape | validator | jsonschema | gojsonschema | shape / fastest |
|---|---:|---:|---:|---:|---:|
| flat | 1.1 µs | 336 ns | 1.8 µs | 6.0 µs | 3.3× |
| nested | 1.9 µs | 1.0 µs | 3.6 µs | 9.6 µs | 1.9× |
| array | 33.7 µs | 14.7 µs | 69.7 µs | 193.5 µs | 2.3× |
| bounds | 1.1 µs | 797 ns | 3.4 µs | 5.9 µs | 1.4× |
| invalid | 5.6 µs | – | 3.9 µs | 11.9 µs | 1.4× |
| large | – | – | – | – | – |

## ts on github:windows-x64

Host `1fee8adaf205`: AMD EPYC 9V74 80-Core Processor, 4 cores, win32/x64. Last run 2026-09-02 (cases `c1a75d4a6878`).

| case | shape | zod | ajv | joi | valibot | shape / fastest |
|---|---:|---:|---:|---:|---:|---:|
| flat | 903 ns | 103 ns | 26 ns | 1.9 µs | 518 ns | 34.6× |
| nested | 1.8 µs | 287 ns | 52 ns | 6.3 µs | 1.0 µs | 34.4× |
| array | 29.5 µs | 4.6 µs | 749 ns | 89.1 µs | 16.4 µs | 39.5× |
| bounds | 1.5 µs | 642 ns | 68 ns | 2.8 µs | 677 ns | 22.0× |
| invalid | 3.1 µs | 3.3 µs | 37 ns | 2.7 µs | 1.7 µs | 85.1× |
| large | – | – | – | – | – | – |

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

Host `ea12b5414dd4`: Apple M1 (Virtual), 3 cores, darwin/arm64. Last run 2026-09-02 (cases `64dd85eab212`).

| case | shape | zod | ajv | joi | valibot | shape / fastest |
|---|---:|---:|---:|---:|---:|---:|
| flat | 747 ns | 97 ns | 25 ns | 1.2 µs | 408 ns | 29.9× |
| nested | 1.2 µs | 233 ns | 56 ns | 4.2 µs | 845 ns | 22.0× |
| array | 20.9 µs | 3.9 µs | 643 ns | 53.3 µs | 15.0 µs | 32.5× |
| bounds | 1.2 µs | 540 ns | 69 ns | 1.8 µs | 644 ns | 17.2× |
| invalid | 2.0 µs | 1.9 µs | 46 ns | 1.7 µs | 1.4 µs | 44.2× |
| large | – | – | – | – | – | – |

## ts on github:linux-x64

Host `f2c2ec319f42`: AMD EPYC 9V74 80-Core Processor, 4 cores, linux/x64. Last run 2026-09-02 (cases `64dd85eab212`).

| case | shape | zod | ajv | joi | valibot | shape / fastest |
|---|---:|---:|---:|---:|---:|---:|
| flat | 864 ns | 95 ns | 27 ns | 1.8 µs | 444 ns | 32.6× |
| nested | 1.7 µs | 289 ns | 52 ns | 5.7 µs | 916 ns | 32.6× |
| array | 29.4 µs | 4.4 µs | 746 ns | 81.3 µs | 15.3 µs | 39.3× |
| bounds | 1.5 µs | 624 ns | 66 ns | 2.7 µs | 636 ns | 22.9× |
| invalid | 3.0 µs | 2.6 µs | 38 ns | 2.4 µs | 1.5 µs | 79.4× |
| large | – | – | – | – | – | – |

# History

Shape's median per case on every run, with the 95th percentile after it, newest last; a cell is filled only when the run measured the case as it is defined now.

## go on github:windows-x64

| run | commit | shape | flat | nested | array | bounds | invalid | large |
|---|---|---|---:|---:|---:|---:|---:|---:|
| 2026-09-02 08:40 | `f325abd` | 0.3.0 | 3.1 µs · 3.1 µs | 7.5 µs · 8.1 µs | 105.0 µs · 173.6 µs | 3.4 µs · 3.7 µs | – · 41.2 µs | – |
| 2026-09-02 13:40 | `ab6b663` | 0.3.0 | 3.2 µs · 3.7 µs | 7.7 µs · 8.9 µs | 112.9 µs · 134.5 µs | 3.4 µs · 3.9 µs | 13.7 µs · 16.2 µs | – |
| 2026-09-02 14:21 | `8dc65e2` | 0.3.0 | 1.7 µs · 2.2 µs | 3.8 µs · 4.7 µs | 48.4 µs · 57.5 µs | 2.3 µs · 2.8 µs | 7.5 µs · 8.6 µs | – |

## go on linux-xeon-sandbox

| run | commit | shape | flat | nested | array | bounds | invalid | large |
|---|---|---|---:|---:|---:|---:|---:|---:|
| 2026-09-02 13:57 | `9ddbbe9` | 0.3.0 | 1.4 µs · 1.6 µs | 2.9 µs · 3.4 µs | 24.3 µs · 88.0 µs | 2.0 µs · 2.7 µs | 8.3 µs · 10.5 µs | – |
| 2026-09-02 14:06 | `e67ecc6` | 0.3.0 | 898 ns · 4.7 µs | 3.1 µs · 4.0 µs | 38.3 µs · 44.4 µs | 1.3 µs · 5.2 µs | 6.6 µs · 8.4 µs | – |
| 2026-09-02 14:07 | `e67ecc6` (dirty) | 0.3.0 | 915 ns · 3.9 µs | 1.9 µs · 8.0 µs | 26.4 µs · 103.2 µs | 1.4 µs · 5.1 µs | 7.0 µs · 9.0 µs | – |
| 2026-09-02 14:08 | `e67ecc6` (dirty) | 0.3.0 | 1.3 µs · 2.6 µs | 3.1 µs · 3.8 µs | 39.9 µs · 50.1 µs | 1.5 µs · 4.0 µs | 6.0 µs · 9.3 µs | – |
| 2026-09-02 14:09 | `e67ecc6` (dirty) | 0.3.0 | 1.5 µs · 2.0 µs | 3.1 µs · 4.0 µs | 27.1 µs · 87.9 µs | 2.0 µs · 2.6 µs | 6.8 µs · 8.8 µs | – |
| 2026-09-02 15:10 | `15de96a` | 0.3.0 | 457 ns · 619 ns | 2.4 µs · 4.7 µs | 38.4 µs · 48.9 µs | 1.7 µs · 4.5 µs | 3.5 µs · 5.8 µs | 8.7 µs · 11.5 µs |

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

## go on github:linux-x64

| run | commit | shape | flat | nested | array | bounds | invalid | large |
|---|---|---|---:|---:|---:|---:|---:|---:|
| 2026-09-02 08:25 | `f325abd` | 0.3.0 | 1.9 µs · 2.7 µs | 4.7 µs · 6.8 µs | 61.6 µs · 112.5 µs | 2.0 µs · 5.5 µs | 7.0 µs · 10.2 µs | – |
| 2026-09-02 13:39 | `ab6b663` | 0.3.0 | 1.8 µs · 2.6 µs | 5.2 µs · 6.5 µs | 59.3 µs · 105.3 µs | 2.0 µs · 2.8 µs | 7.1 µs · 9.4 µs | – |
| 2026-09-02 14:20 | `8dc65e2` | 0.3.0 | 1.1 µs · 1.2 µs | 1.9 µs · 3.7 µs | 33.7 µs · 39.4 µs | 1.1 µs · 3.5 µs | 5.6 µs · 7.1 µs | – |

## ts on github:windows-x64

| run | commit | shape | flat | nested | array | bounds | invalid | large |
|---|---|---|---:|---:|---:|---:|---:|---:|
| 2026-09-02 08:25 | `f325abd` | 11.1.0 | 3.0 µs · 3.4 µs | 5.6 µs · 9.7 µs | 94.6 µs · 183.6 µs | 3.6 µs · 7.1 µs | 7.2 µs · 13.1 µs | – |
| 2026-09-02 13:39 | `ab6b663` | 11.1.0 | 3.3 µs · 5.7 µs | 5.7 µs · 8.9 µs | 97.6 µs · 111.6 µs | 3.5 µs · 3.9 µs | 7.2 µs · 9.5 µs | – |
| 2026-09-02 14:20 | `8dc65e2` | 11.1.0 | 903 ns · 1.0 µs | 1.8 µs · 2.1 µs | 29.5 µs · 55.9 µs | 1.5 µs · 1.8 µs | 3.1 µs · 3.6 µs | – |

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

## ts on github:linux-x64

| run | commit | shape | flat | nested | array | bounds | invalid | large |
|---|---|---|---:|---:|---:|---:|---:|---:|
| 2026-09-02 08:24 | `f325abd` | 11.1.0 | 2.5 µs · 2.9 µs | 4.9 µs · 5.4 µs | 82.2 µs · 88.5 µs | 3.2 µs · 3.3 µs | 6.4 µs · 7.0 µs | – |
| 2026-09-02 13:38 | `ab6b663` | 11.1.0 | 2.0 µs · 2.2 µs | 4.0 µs · 4.3 µs | 71.8 µs · 78.9 µs | 2.8 µs · 3.0 µs | 5.6 µs · 5.9 µs | – |
| 2026-09-02 14:19 | `8dc65e2` | 11.1.0 | 864 ns · 1.0 µs | 1.7 µs · 2.0 µs | 29.4 µs · 34.8 µs | 1.5 µs · 1.9 µs | 3.0 µs · 3.6 µs | – |
