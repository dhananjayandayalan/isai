# Capacity planning

Formulas for sizing analysis workers, storage, bandwidth and cost for a given user count,
with a worked example. **The example inputs are illustrative.** Replace them with
measured values from the `jobs` table (P8 records per-stage timings) before using any
result for a decision.

## Inputs

| Symbol | Meaning                                              | Illustrative               | Where the real number comes from                              |
| ------ | ---------------------------------------------------- | -------------------------- | ------------------------------------------------------------- |
| `U`    | monthly active users                                 | 10 / 100 / 1k / 10k / 100k | `sessions` and auth tables                                    |
| `r`    | uploads per active user per month                    | 3                          | `songs` rows per user per month                               |
| `L`    | average audio length (minutes)                       | 4                          | `songs.duration_sec`                                          |
| `g`    | GPU-seconds of work per audio minute, whole pipeline | 30                         | `jobs.timings`, GPU stages only (P4 measures the first value) |
| `c`    | CPU-seconds per audio minute, non-GPU stages         | 15                         | `jobs.timings`, CPU stages                                    |
| `w`    | worker cold start (load image and weights), seconds  | 60                         | worker logs                                                   |
| `p`    | share of a day's uploads in the busiest hour         | 0.15                       | `jobs.queued_at` histogram                                    |
| `ρ`    | target worker utilisation at peak                    | 0.6                        | a policy choice (lower means shorter queues)                  |
| `s`    | sessions per active user per month                   | 20                         | `sessions` table                                              |

## Analysis compute

**Monthly GPU hours**

```
H = U × r × L × g / 3600
```

**Workers needed in the peak hour**

```
peak uploads per hour  = U × r / 30 × p
GPU seconds needed     = peak uploads per hour × L × g
workers                = ceil( GPU seconds needed / (3600 × ρ) )
```

**Turnaround for one job with an idle warm worker**

```
T = L × (g + c) + upload time + overhead          (≈ 4 × 45 s = 3 min in the example)
```

**Burst on a single worker** (T0): the k-th of k simultaneous uploads waits about
`(k − 1) × L × (g + c)`. Five friends uploading at once means the last waits about 12 minutes.

### Worked example (illustrative inputs)

| `U`     | Uploads / month | GPU hours / month `H` | Peak uploads / hour | Workers at peak (ρ = 0.6) |
| ------- | --------------- | --------------------- | ------------------- | ------------------------- |
| 10      | 30              | 1                     | 0.15                | 1 (the owner's PC)        |
| 100     | 300             | 10                    | 1.5                 | 1                         |
| 1,000   | 3,000           | 100                   | 15                  | 1, and 2 to absorb bursts |
| 10,000  | 30,000          | 1,000                 | 150                 | 9                         |
| 100,000 | 300,000         | 10,000                | 1,500               | 84                        |

What the example shows:

- Up to about 1,000 users, **one or two GPUs** are enough. The cost question is whether
  to pay for idle time.
- At 10,000 users the pool needs autoscaling. Cutting `g` (model choice, fp16, skipping
  separation where it isn't needed) saves more than any infrastructure change.
- Halving `g` halves both `H` and the worker count. Track `g` per pipeline version like a
  golden-eval metric.

### Always-on versus on-demand GPUs

```
always-on cost per month = 730 × price_always_on_per_hour × workers
on-demand cost per month = H × price_on_demand_per_hour + cold-start hours × price_on_demand_per_hour
cold-start hours ≈ (number of scale-ups per month × w) / 3600
```

Always-on is cheaper when
`H > 730 × price_always_on / price_on_demand × workers`.
At T0–T2 the GPU is idle most of the month, so on-demand or the owner's own hardware wins.
Always-on only makes sense once utilisation is high or cold starts hurt turnaround too much.

### Cost per upload

```
cost per upload ≈ L × g / 3600 × GPU price per hour + L × c / 3600 × CPU price per hour
```

This is the number that sets quotas and any future price (see
[public-launch.md](public-launch.md)). Put it in the admin view once there are real
timings.

## Storage

| Item                                 | Size per unit (estimate; measure)         | Growth                                                                             |
| ------------------------------------ | ----------------------------------------- | ---------------------------------------------------------------------------------- |
| Song JSON (4-min song, ~2,000 notes) | 100–300 KB raw, 20–40 KB gzip             | one per upload (× 3 if P5 stores one Song per level)                               |
| MIDI                                 | 10–30 KB                                  | one per upload                                                                     |
| `songs` row                          | < 1 KB                                    | one per upload                                                                     |
| `jobs` row with timings              | 1–2 KB                                    | one per upload (more with retries)                                                 |
| `sessions` row with result           | 2–5 KB                                    | `U × s` per month                                                                  |
| `uploads` bucket                     | the audio files themselves (4–40 MB each) | **transient**: holds only in-flight jobs; peak ≈ concurrent uploads × average size |

Example at `U = 10,000`:

- songs: 30,000 uploads × ~0.3 MB ≈ 9 GB a month (about 3 GB if stored gzipped)
- sessions: 200,000 rows × ~4 KB ≈ 0.8 GB a month of database growth

Session history grows fastest. Plan a retention or roll-up policy by T2
(see [scaling-roadmap.md](scaling-roadmap.md), Database).

Measure real sizes with:

```sql
select avg(pg_column_size(s.*)) from sessions s;                    -- bytes per session row
select avg((metadata->>'size')::bigint) from storage.objects         -- bytes per stored file
  where bucket_id = 'songs';
```

## Bandwidth

| Flow                                   | Per event                                                     | Notes                                                |
| -------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------- |
| Web app (first visit)                  | ~0.3 MB gzip (main + Tone.js chunks; P1 measured 165 kB gzip) | cached by the CDN and browser                        |
| Piano samples (first visit per device) | `S` MB (measure once in P9)                                   | cached for good; the largest download per new device |
| Open a song                            | 20–40 KB gzip                                                 | signed URL; cacheable per session                    |
| Upload                                 | the audio file (4–40 MB)                                      | ingress, usually free                                |
| Practice                               | a few KB per session (one row write)                          |                                                      |

```
monthly egress ≈ new devices × (S + 0.3 MB) + song opens × 0.04 MB
```

Egress is small at every tier unless the sample set is large. Keep `S` small (fewer
velocity layers, compressed formats) before it becomes a cost line.

## Database load

- **Writes:** one session row per practice run, job updates per stage (≈ 10 per upload),
  lease renewals every 30 s per running job. At `U = 10,000` that is well under 10 writes
  a second on average. Postgres handles that without tuning.
- **Connections:** each worker holds one or two. Each browser uses the REST API, not
  direct connections. Add pooling when the worker pool passes ~20 or connection errors
  appear.
- **Realtime:** one subscription per open progress page. Check the plan's concurrent
  Realtime connection limit before T2, and close subscriptions when the job finishes.

## Measuring for real

Record these from P8 on, in `jobs.timings` or columns:

- the audio duration
- seconds per stage, and which device ran each stage (GPU model or CPU)
- cold start or warm
- queue wait (`claimed_at − queued_at`)
- retries, and the final status

Weekly queries:

```sql
-- g: GPU seconds per audio minute, per pipeline version
select s.pipeline_version,
       sum((j.timings->>'gpu_s')::float) / nullif(sum(s.duration_sec) / 60, 0) as g
from jobs j join songs s on s.id = j.song_id
where j.status = 'succeeded' and j.finished_at > now() - interval '7 days'
group by 1;

-- queue wait percentiles
select percentile_cont(array[0.5, 0.95]) within group (order by extract(epoch from claimed_at - queued_at))
from jobs where queued_at > now() - interval '7 days';
```

## Load and soak testing (before T2)

- **Queue flood on staging:** insert N jobs pointing at synthesised test audio (generated
  WAV clicks and sines, never real songs), let the pool drain them, and check the drain
  time against the worker formula, plus fairness between users.
- **Worker soak:** run 24 hours with a steady trickle of jobs. Watch memory growth (model
  reloads, CUDA leaks), temp-disk growth (the rule 8 cleanup) and lease renewals.
- **API:** a k6 script for sign-in → list songs → open song → write session at 10× the
  expected peak.
- **Client:** frame time of the practice screen (falling notes + staff + keyboard) on the
  slowest target device. Budget: 16 ms at the 95th percentile.
