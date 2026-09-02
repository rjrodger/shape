# Latest measurements

Generated 2026-09-02T08:06:39.697Z from 2 run(s). Times are median nanoseconds per operation; lower is better.

## go on linux-xeon-sandbox

Host `e39798b4ebbc`: Intel(R) Xeon(R) Processor @ 2.80GHz, 4 cores, linux/x64. Last run 2026-09-02 (cases `64dd85eab212`).

| case | shape | validator | jsonschema | gojsonschema | shape / fastest |
|---|---:|---:|---:|---:|---:|
| flat | 3.0 µs | 470 ns | 2.8 µs | 8.8 µs | 6.4× |
| nested | 8.6 µs | 1.5 µs | 6.2 µs | 13.5 µs | 5.7× |
| array | 106.6 µs | 21.1 µs | 101.9 µs | 307.7 µs | 5.1× |
| bounds | 4.3 µs | 946 ns | 4.7 µs | 9.1 µs | 4.5× |
| invalid | 11.6 µs | – | 5.4 µs | 17.1 µs | 2.1× |

## ts on linux-xeon-sandbox

Host `e39798b4ebbc`: Intel(R) Xeon(R) Processor @ 2.80GHz, 4 cores, linux/x64. Last run 2026-09-02 (cases `64dd85eab212`).

| case | shape | zod | ajv | joi | valibot | shape / fastest |
|---|---:|---:|---:|---:|---:|---:|
| flat | 3.5 µs | 146 ns | 43 ns | 2.6 µs | 835 ns | 79.6× |
| nested | 6.4 µs | 429 ns | 102 ns | 8.4 µs | 1.8 µs | 63.3× |
| array | 105.8 µs | 6.7 µs | 1.4 µs | 118.5 µs | 28.3 µs | 74.8× |
| bounds | 4.0 µs | 1.1 µs | 117 ns | 3.8 µs | 1.1 µs | 34.1× |
| invalid | 8.5 µs | 3.9 µs | 79 ns | 3.4 µs | 2.6 µs | 108.1× |
