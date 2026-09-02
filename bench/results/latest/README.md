# Latest measurements

Generated 2026-09-02T08:40:26.134Z from 8 run(s). Times are median nanoseconds per operation; lower is better.

## go on github:windows-x64

Host `1fee8adaf205`: AMD EPYC 9V74 80-Core Processor, 4 cores, win32/x64. Last run 2026-09-02 (cases `c1a75d4a6878`).

| case | shape | validator | jsonschema | gojsonschema | shape / fastest |
|---|---:|---:|---:|---:|---:|
| flat | 3.1 µs | 349 ns | 2.7 µs | 7.7 µs | 8.8× |
| nested | 7.5 µs | 1.3 µs | 5.4 µs | 0 ns | Infinity× |
| array | 105.0 µs | 16.7 µs | 98.8 µs | 255.2 µs | 6.3× |
| bounds | 3.4 µs | 814 ns | 4.7 µs | 8.2 µs | 4.2× |
| invalid | 0 ns | – | 6.1 µs | 17.2 µs | NaN× |

## go on linux-xeon-sandbox

Host `e39798b4ebbc`: Intel(R) Xeon(R) Processor @ 2.80GHz, 4 cores, linux/x64. Last run 2026-09-02 (cases `64dd85eab212`).

| case | shape | validator | jsonschema | gojsonschema | shape / fastest |
|---|---:|---:|---:|---:|---:|
| flat | 3.0 µs | 470 ns | 2.8 µs | 8.8 µs | 6.4× |
| nested | 8.6 µs | 1.5 µs | 6.2 µs | 13.5 µs | 5.7× |
| array | 106.6 µs | 21.1 µs | 101.9 µs | 307.7 µs | 5.1× |
| bounds | 4.3 µs | 946 ns | 4.7 µs | 9.1 µs | 4.5× |
| invalid | 11.6 µs | – | 5.4 µs | 17.1 µs | 2.1× |

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
| flat | 3.5 µs | 146 ns | 43 ns | 2.6 µs | 835 ns | 79.6× |
| nested | 6.4 µs | 429 ns | 102 ns | 8.4 µs | 1.8 µs | 63.3× |
| array | 105.8 µs | 6.7 µs | 1.4 µs | 118.5 µs | 28.3 µs | 74.8× |
| bounds | 4.0 µs | 1.1 µs | 117 ns | 3.8 µs | 1.1 µs | 34.1× |
| invalid | 8.5 µs | 3.9 µs | 79 ns | 3.4 µs | 2.6 µs | 108.1× |

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
