# Latest measurements

Generated 2026-09-02T07:10:54.377Z from 2 run(s). Times are median nanoseconds per operation; lower is better.

## go on linux-xeon-sandbox

Host `e39798b4ebbc`: Intel(R) Xeon(R) Processor @ 2.80GHz, 4 cores, linux/x64. Last run 2026-09-02.

| case | shape | validator | jsonschema | gojsonschema | shape / fastest |
|---|---:|---:|---:|---:|---:|
| flat | 3.1 µs | 449 ns | 2.5 µs | 8.0 µs | 7.0× |
| nested | 7.7 µs | 1.5 µs | 5.3 µs | 12.4 µs | 5.2× |
| array | 112.0 µs | 21.2 µs | 94.0 µs | 293.2 µs | 5.3× |
| bounds | 3.7 µs | 935 ns | 4.4 µs | 7.9 µs | 4.0× |
| invalid | 11.6 µs | – | 4.7 µs | 17.8 µs | 2.5× |

## ts on linux-xeon-sandbox

Host `e39798b4ebbc`: Intel(R) Xeon(R) Processor @ 2.80GHz, 4 cores, linux/x64. Last run 2026-09-02.

| case | shape | zod | ajv | joi | valibot | shape / fastest |
|---|---:|---:|---:|---:|---:|---:|
| flat | 3.6 µs | 158 ns | 44 ns | 2.8 µs | 825 ns | 81.4× |
| nested | 6.7 µs | 455 ns | 103 ns | 9.2 µs | 1.9 µs | 65.7× |
| array | 112.4 µs | 7.2 µs | 1.5 µs | 121.4 µs | 29.3 µs | 73.3× |
| bounds | 4.0 µs | 1.1 µs | 116 ns | 3.7 µs | 1.1 µs | 34.9× |
| invalid | 8.3 µs | 3.6 µs | 74 ns | 3.4 µs | 2.7 µs | 112.0× |
