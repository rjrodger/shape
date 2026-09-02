# Latest measurements

Generated 2026-09-02T09:55:26.732Z from 10 run(s). Times are median nanoseconds per operation; lower is better.

## go on github:windows-x64

Host `1fee8adaf205`: AMD EPYC 9V74 80-Core Processor, 4 cores, win32/x64. Last run 2026-09-02 (cases `c1a75d4a6878`).

| case | shape | validator | jsonschema | gojsonschema | shape / fastest |
|---|---:|---:|---:|---:|---:|
| flat | 3.1 µs | 349 ns | 2.7 µs | 7.7 µs | 8.8× |
| nested | 7.5 µs | 1.3 µs | 5.4 µs | – | 5.8× |
| array | 105.0 µs | 16.7 µs | 98.8 µs | 255.2 µs | 6.3× |
| bounds | 3.4 µs | 814 ns | 4.7 µs | 8.2 µs | 4.2× |
| invalid | – | – | 6.1 µs | 17.2 µs | – |

## go on linux-xeon-sandbox

Host `e39798b4ebbc`: Intel(R) Xeon(R) Processor @ 2.80GHz, 4 cores, linux/x64. Last run 2026-09-02 (cases `64dd85eab212`).

| case | shape | validator | jsonschema | gojsonschema | shape / fastest |
|---|---:|---:|---:|---:|---:|
| flat | 3.3 µs | 475 ns | 2.5 µs | 8.8 µs | 6.9× |
| nested | 7.5 µs | 1.4 µs | 5.7 µs | 12.7 µs | 5.2× |
| array | 112.2 µs | 20.7 µs | 92.7 µs | 263.4 µs | 5.4× |
| bounds | 2.9 µs | 930 ns | 4.3 µs | 8.1 µs | 3.2× |
| invalid | 11.4 µs | – | 4.6 µs | 16.6 µs | 2.5× |

## go on github:macos-arm64

Host `ea12b5414dd4`: Apple M1 (Virtual), 3 cores, darwin/arm64. Last run 2026-09-02 (cases `64dd85eab212`).

| case | shape | validator | jsonschema | gojsonschema | shape / fastest |
|---|---:|---:|---:|---:|---:|
| flat | 1.7 µs | 261 ns | 1.6 µs | 4.1 µs | 6.4× |
| nested | 4.0 µs | 852 ns | 3.3 µs | 7.8 µs | 4.8× |
| array | 58.9 µs | 10.6 µs | 47.8 µs | 131.6 µs | 5.6× |
| bounds | 2.2 µs | 466 ns | 2.4 µs | 4.2 µs | 4.7× |
| invalid | 7.4 µs | – | 3.2 µs | 9.0 µs | 2.3× |

## go on github:linux-x64

Host `f2c2ec319f42`: AMD EPYC 9V74 80-Core Processor, 4 cores, linux/x64. Last run 2026-09-02 (cases `64dd85eab212`).

| case | shape | validator | jsonschema | gojsonschema | shape / fastest |
|---|---:|---:|---:|---:|---:|
| flat | 1.9 µs | 285 ns | 1.7 µs | 5.4 µs | 6.6× |
| nested | 4.7 µs | 904 ns | 3.3 µs | 8.5 µs | 5.2× |
| array | 61.6 µs | 12.7 µs | 59.1 µs | 161.9 µs | 4.8× |
| bounds | 2.0 µs | 715 ns | 3.2 µs | 5.3 µs | 2.7× |
| invalid | 7.0 µs | – | 3.7 µs | 10.6 µs | 1.9× |

## ts on github:windows-x64

Host `1fee8adaf205`: AMD EPYC 9V74 80-Core Processor, 4 cores, win32/x64. Last run 2026-09-02 (cases `c1a75d4a6878`).

| case | shape | zod | ajv | joi | valibot | shape / fastest |
|---|---:|---:|---:|---:|---:|---:|
| flat | 3.0 µs | 98 ns | 26 ns | 1.9 µs | 433 ns | 114.0× |
| nested | 5.6 µs | 290 ns | 55 ns | 6.0 µs | 929 ns | 102.5× |
| array | 94.6 µs | 4.7 µs | 767 ns | 83.4 µs | 14.9 µs | 123.4× |
| bounds | 3.6 µs | 669 ns | 65 ns | 2.8 µs | 623 ns | 55.0× |
| invalid | 7.2 µs | 3.1 µs | 40 ns | 3.1 µs | 1.5 µs | 181.6× |

## ts on linux-xeon-sandbox

Host `e39798b4ebbc`: Intel(R) Xeon(R) Processor @ 2.80GHz, 4 cores, linux/x64. Last run 2026-09-02 (cases `64dd85eab212`).

| case | shape | zod | ajv | joi | valibot | shape / fastest |
|---|---:|---:|---:|---:|---:|---:|
| flat | 3.5 µs | 138 ns | 44 ns | 2.7 µs | 810 ns | 78.6× |
| nested | 6.7 µs | 438 ns | 100 ns | 8.4 µs | 1.6 µs | 67.7× |
| array | 110.0 µs | 6.6 µs | 1.4 µs | 148.1 µs | 36.4 µs | 77.1× |
| bounds | 5.1 µs | 1.4 µs | 148 ns | 4.6 µs | 1.4 µs | 34.8× |
| invalid | 10.9 µs | 4.7 µs | 93 ns | 4.0 µs | 3.3 µs | 117.3× |

## ts on github:macos-arm64

Host `ea12b5414dd4`: Apple M1 (Virtual), 3 cores, darwin/arm64. Last run 2026-09-02 (cases `64dd85eab212`).

| case | shape | zod | ajv | joi | valibot | shape / fastest |
|---|---:|---:|---:|---:|---:|---:|
| flat | 2.3 µs | 105 ns | 24 ns | 1.3 µs | 441 ns | 93.5× |
| nested | 3.7 µs | 223 ns | 52 ns | 3.8 µs | 827 ns | 70.4× |
| array | 59.3 µs | 3.8 µs | 693 ns | 57.2 µs | 17.0 µs | 85.6× |
| bounds | 2.2 µs | 491 ns | 70 ns | 2.0 µs | 662 ns | 31.4× |
| invalid | 4.6 µs | 1.8 µs | 44 ns | 1.5 µs | 1.4 µs | 104.6× |

## ts on github:linux-x64

Host `f2c2ec319f42`: AMD EPYC 9V74 80-Core Processor, 4 cores, linux/x64. Last run 2026-09-02 (cases `64dd85eab212`).

| case | shape | zod | ajv | joi | valibot | shape / fastest |
|---|---:|---:|---:|---:|---:|---:|
| flat | 2.5 µs | 98 ns | 26 ns | 1.7 µs | 436 ns | 95.6× |
| nested | 4.9 µs | 277 ns | 53 ns | 5.5 µs | 944 ns | 92.5× |
| array | 82.2 µs | 4.5 µs | 752 ns | 78.5 µs | 15.3 µs | 109.2× |
| bounds | 3.2 µs | 681 ns | 65 ns | 2.6 µs | 632 ns | 49.0× |
| invalid | 6.4 µs | 2.8 µs | 39 ns | 2.6 µs | 1.5 µs | 164.8× |

# History

Shape's median per case on every run, newest last; only runs against the same cases as the latest run are listed.

## go on github:windows-x64

| run | commit | shape | flat | nested | array | bounds | invalid |
|---|---|---|---:|---:|---:|---:|---:|
| 2026-09-02 08:40 | `f325abd` | 0.3.0 | 3.1 µs | 7.5 µs | 105.0 µs | 3.4 µs | – |

## go on linux-xeon-sandbox

| run | commit | shape | flat | nested | array | bounds | invalid |
|---|---|---|---:|---:|---:|---:|---:|
| 2026-09-02 08:06 | `fb2015e` | 0.2.1 | 3.0 µs | 8.6 µs | 106.6 µs | 4.3 µs | 11.6 µs |
| 2026-09-02 08:25 | `5085fc0` | 0.3.0 | 3.3 µs | 7.5 µs | 112.2 µs | 2.9 µs | 11.4 µs |

## go on github:macos-arm64

| run | commit | shape | flat | nested | array | bounds | invalid |
|---|---|---|---:|---:|---:|---:|---:|
| 2026-09-02 08:25 | `f325abd` | 0.3.0 | 1.7 µs | 4.0 µs | 58.9 µs | 2.2 µs | 7.4 µs |

## go on github:linux-x64

| run | commit | shape | flat | nested | array | bounds | invalid |
|---|---|---|---:|---:|---:|---:|---:|
| 2026-09-02 08:25 | `f325abd` | 0.3.0 | 1.9 µs | 4.7 µs | 61.6 µs | 2.0 µs | 7.0 µs |

## ts on github:windows-x64

| run | commit | shape | flat | nested | array | bounds | invalid |
|---|---|---|---:|---:|---:|---:|---:|
| 2026-09-02 08:25 | `f325abd` | 11.1.0 | 3.0 µs | 5.6 µs | 94.6 µs | 3.6 µs | 7.2 µs |

## ts on linux-xeon-sandbox

| run | commit | shape | flat | nested | array | bounds | invalid |
|---|---|---|---:|---:|---:|---:|---:|
| 2026-09-02 08:05 | `fb2015e` | 11.0.1 | 3.5 µs | 6.4 µs | 105.8 µs | 4.0 µs | 8.5 µs |
| 2026-09-02 08:24 | `5085fc0` | 11.1.0 | 3.5 µs | 6.7 µs | 110.0 µs | 5.1 µs | 10.9 µs |

## ts on github:macos-arm64

| run | commit | shape | flat | nested | array | bounds | invalid |
|---|---|---|---:|---:|---:|---:|---:|
| 2026-09-02 08:25 | `f325abd` | 11.1.0 | 2.3 µs | 3.7 µs | 59.3 µs | 2.2 µs | 4.6 µs |

## ts on github:linux-x64

| run | commit | shape | flat | nested | array | bounds | invalid |
|---|---|---|---:|---:|---:|---:|---:|
| 2026-09-02 08:24 | `f325abd` | 11.1.0 | 2.5 µs | 4.9 µs | 82.2 µs | 3.2 µs | 6.4 µs |
