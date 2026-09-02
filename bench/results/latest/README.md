# Latest measurements

Generated 2026-09-02T13:40:52.234Z from 16 run(s). Times are median nanoseconds per operation; lower is better.

## go on github:windows-x64

Host `1fee8adaf205`: AMD EPYC 9V74 80-Core Processor, 4 cores, win32/x64. Last run 2026-09-02 (cases `c1a75d4a6878`).

| case | shape | validator | jsonschema | gojsonschema | shape / fastest |
|---|---:|---:|---:|---:|---:|
| flat | 3.2 µs | 347 ns | 2.8 µs | 7.7 µs | 9.1× |
| nested | 7.7 µs | 1.3 µs | 5.6 µs | 12.3 µs | 6.0× |
| array | 112.9 µs | 17.5 µs | 102.9 µs | 241.5 µs | 6.5× |
| bounds | 3.4 µs | 823 ns | 4.9 µs | 8.7 µs | 4.1× |
| invalid | 13.7 µs | – | 6.6 µs | 17.9 µs | 2.1× |

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
| flat | 2.0 µs | 230 ns | 1.3 µs | 3.7 µs | 8.5× |
| nested | 4.4 µs | 768 ns | 2.4 µs | 6.3 µs | 5.7× |
| array | 53.8 µs | 9.7 µs | 47.2 µs | 128.7 µs | 5.5× |
| bounds | 1.9 µs | 434 ns | 2.3 µs | 4.3 µs | 4.5× |
| invalid | 5.3 µs | – | 3.9 µs | 12.0 µs | 1.4× |

## go on github:linux-x64

Host `f2c2ec319f42`: AMD EPYC 9V74 80-Core Processor, 4 cores, linux/x64. Last run 2026-09-02 (cases `64dd85eab212`).

| case | shape | validator | jsonschema | gojsonschema | shape / fastest |
|---|---:|---:|---:|---:|---:|
| flat | 1.8 µs | 272 ns | 1.6 µs | 4.5 µs | 6.7× |
| nested | 5.2 µs | 867 ns | 3.0 µs | 7.8 µs | 6.0× |
| array | 59.3 µs | 11.7 µs | 53.9 µs | 159.0 µs | 5.1× |
| bounds | 2.0 µs | 534 ns | 2.7 µs | 4.9 µs | 3.7× |
| invalid | 7.1 µs | – | 3.7 µs | 9.6 µs | 2.0× |

## ts on github:windows-x64

Host `1fee8adaf205`: AMD EPYC 9V74 80-Core Processor, 4 cores, win32/x64. Last run 2026-09-02 (cases `c1a75d4a6878`).

| case | shape | zod | ajv | joi | valibot | shape / fastest |
|---|---:|---:|---:|---:|---:|---:|
| flat | 3.3 µs | 110 ns | 29 ns | 1.9 µs | 492 ns | 113.4× |
| nested | 5.7 µs | 298 ns | 52 ns | 5.9 µs | 1.0 µs | 109.9× |
| array | 97.6 µs | 4.5 µs | 739 ns | 84.3 µs | 17.9 µs | 132.0× |
| bounds | 3.5 µs | 638 ns | 65 ns | 2.7 µs | 686 ns | 53.9× |
| invalid | 7.2 µs | 3.1 µs | 36 ns | 2.7 µs | 1.7 µs | 199.9× |

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
| flat | 2.0 µs | 102 ns | 25 ns | 1.3 µs | 403 ns | 77.6× |
| nested | 3.3 µs | 227 ns | 54 ns | 4.0 µs | 822 ns | 61.6× |
| array | 54.3 µs | 3.6 µs | 645 ns | 52.1 µs | 14.1 µs | 84.2× |
| bounds | 2.0 µs | 495 ns | 66 ns | 1.9 µs | 551 ns | 30.9× |
| invalid | 4.0 µs | 1.6 µs | 37 ns | 1.4 µs | 1.2 µs | 109.6× |

## ts on github:linux-x64

Host `f2c2ec319f42`: AMD EPYC 9V74 80-Core Processor, 4 cores, linux/x64. Last run 2026-09-02 (cases `64dd85eab212`).

| case | shape | zod | ajv | joi | valibot | shape / fastest |
|---|---:|---:|---:|---:|---:|---:|
| flat | 2.0 µs | 72 ns | 23 ns | 1.3 µs | 392 ns | 87.6× |
| nested | 4.0 µs | 200 ns | 49 ns | 4.5 µs | 865 ns | 80.8× |
| array | 71.8 µs | 3.3 µs | 718 ns | 60.3 µs | 14.9 µs | 100.0× |
| bounds | 2.8 µs | 451 ns | 62 ns | 2.0 µs | 559 ns | 45.5× |
| invalid | 5.6 µs | 2.1 µs | 28 ns | 2.0 µs | 1.4 µs | 198.8× |

# History

Shape's median per case on every run, newest last; only runs against the same cases as the latest run are listed.

## go on github:windows-x64

| run | commit | shape | flat | nested | array | bounds | invalid |
|---|---|---|---:|---:|---:|---:|---:|
| 2026-09-02 08:40 | `f325abd` | 0.3.0 | 3.1 µs | 7.5 µs | 105.0 µs | 3.4 µs | – |
| 2026-09-02 13:40 | `ab6b663` | 0.3.0 | 3.2 µs | 7.7 µs | 112.9 µs | 3.4 µs | 13.7 µs |

## go on linux-xeon-sandbox

| run | commit | shape | flat | nested | array | bounds | invalid |
|---|---|---|---:|---:|---:|---:|---:|
| 2026-09-02 08:06 | `fb2015e` | 0.2.1 | 3.0 µs | 8.6 µs | 106.6 µs | 4.3 µs | 11.6 µs |
| 2026-09-02 08:25 | `5085fc0` | 0.3.0 | 3.3 µs | 7.5 µs | 112.2 µs | 2.9 µs | 11.4 µs |

## go on github:macos-arm64

| run | commit | shape | flat | nested | array | bounds | invalid |
|---|---|---|---:|---:|---:|---:|---:|
| 2026-09-02 08:25 | `f325abd` | 0.3.0 | 1.7 µs | 4.0 µs | 58.9 µs | 2.2 µs | 7.4 µs |
| 2026-09-02 13:39 | `ab6b663` | 0.3.0 | 2.0 µs | 4.4 µs | 53.8 µs | 1.9 µs | 5.3 µs |

## go on github:linux-x64

| run | commit | shape | flat | nested | array | bounds | invalid |
|---|---|---|---:|---:|---:|---:|---:|
| 2026-09-02 08:25 | `f325abd` | 0.3.0 | 1.9 µs | 4.7 µs | 61.6 µs | 2.0 µs | 7.0 µs |
| 2026-09-02 13:39 | `ab6b663` | 0.3.0 | 1.8 µs | 5.2 µs | 59.3 µs | 2.0 µs | 7.1 µs |

## ts on github:windows-x64

| run | commit | shape | flat | nested | array | bounds | invalid |
|---|---|---|---:|---:|---:|---:|---:|
| 2026-09-02 08:25 | `f325abd` | 11.1.0 | 3.0 µs | 5.6 µs | 94.6 µs | 3.6 µs | 7.2 µs |
| 2026-09-02 13:39 | `ab6b663` | 11.1.0 | 3.3 µs | 5.7 µs | 97.6 µs | 3.5 µs | 7.2 µs |

## ts on linux-xeon-sandbox

| run | commit | shape | flat | nested | array | bounds | invalid |
|---|---|---|---:|---:|---:|---:|---:|
| 2026-09-02 08:05 | `fb2015e` | 11.0.1 | 3.5 µs | 6.4 µs | 105.8 µs | 4.0 µs | 8.5 µs |
| 2026-09-02 08:24 | `5085fc0` | 11.1.0 | 3.5 µs | 6.7 µs | 110.0 µs | 5.1 µs | 10.9 µs |

## ts on github:macos-arm64

| run | commit | shape | flat | nested | array | bounds | invalid |
|---|---|---|---:|---:|---:|---:|---:|
| 2026-09-02 08:25 | `f325abd` | 11.1.0 | 2.3 µs | 3.7 µs | 59.3 µs | 2.2 µs | 4.6 µs |
| 2026-09-02 13:38 | `ab6b663` | 11.1.0 | 2.0 µs | 3.3 µs | 54.3 µs | 2.0 µs | 4.0 µs |

## ts on github:linux-x64

| run | commit | shape | flat | nested | array | bounds | invalid |
|---|---|---|---:|---:|---:|---:|---:|
| 2026-09-02 08:24 | `f325abd` | 11.1.0 | 2.5 µs | 4.9 µs | 82.2 µs | 3.2 µs | 6.4 µs |
| 2026-09-02 13:38 | `ab6b663` | 11.1.0 | 2.0 µs | 4.0 µs | 71.8 µs | 2.8 µs | 5.6 µs |
