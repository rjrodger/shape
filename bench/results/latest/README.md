# Latest measurements

Generated 2026-09-02T08:25:21.321Z from 4 run(s). Times are median nanoseconds per operation; lower is better.

## go on linux-xeon-sandbox

Host `e39798b4ebbc`: Intel(R) Xeon(R) Processor @ 2.80GHz, 4 cores, linux/x64. Last run 2026-09-02 (cases `64dd85eab212`).

| case | shape | validator | jsonschema | gojsonschema | shape / fastest |
|---|---:|---:|---:|---:|---:|
| flat | 3.3 µs | 475 ns | 2.5 µs | 8.8 µs | 6.9× |
| nested | 7.5 µs | 1.4 µs | 5.7 µs | 12.7 µs | 5.2× |
| array | 112.2 µs | 20.7 µs | 92.7 µs | 263.4 µs | 5.4× |
| bounds | 2.9 µs | 930 ns | 4.3 µs | 8.1 µs | 3.2× |
| invalid | 11.4 µs | – | 4.6 µs | 16.6 µs | 2.5× |

## ts on linux-xeon-sandbox

Host `e39798b4ebbc`: Intel(R) Xeon(R) Processor @ 2.80GHz, 4 cores, linux/x64. Last run 2026-09-02 (cases `64dd85eab212`).

| case | shape | zod | ajv | joi | valibot | shape / fastest |
|---|---:|---:|---:|---:|---:|---:|
| flat | 3.5 µs | 138 ns | 44 ns | 2.7 µs | 810 ns | 78.6× |
| nested | 6.7 µs | 438 ns | 100 ns | 8.4 µs | 1.6 µs | 67.7× |
| array | 110.0 µs | 6.6 µs | 1.4 µs | 148.1 µs | 36.4 µs | 77.1× |
| bounds | 5.1 µs | 1.4 µs | 148 ns | 4.6 µs | 1.4 µs | 34.8× |
| invalid | 10.9 µs | 4.7 µs | 93 ns | 4.0 µs | 3.3 µs | 117.3× |
