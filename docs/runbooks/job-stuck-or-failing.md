# A job is stuck or keeps failing

**Signs:**
- A song stays "Analysing" for more than 30 minutes.
- The alert reports `job_failed_twice` or `queue_old`.
- The Admin page shows failures piling up under one code.

## Stuck

- **Running but no progress:** a worker holds a lease for 2 minutes and renews it every
  30 s. If the worker died, the lease runs out and `requeue_expired()` (every minute)
  puts the job back. After two attempts it fails with `timeout`. Nothing to do but check
  the worker ([worker-offline.md](worker-offline.md)).
- **Queued for a long time:** the worker is offline or busy. One job takes a few minutes;
  the 20-minute limit stops runaways.
- **`waiting_upload`:** the browser never finished the upload. The job fails after 24 h
  (`upload_expired`); the learner can upload again.

## Failing

The code is on the job row and the Admin page. The learner sees plain words for each one
(`schema/job-errors.json`).

| Code | Usually | Do |
|---|---|---|
| `decode_failed` | Not audio, or a broken file | Nothing; the learner re-exports it |
| `too_long` / `silent` | The file itself | Nothing |
| `model_failed` | Model weights missing or failing their checksum | Restart the worker (it fetches models at start); check the logs |
| `timeout` | Over 20 minutes, or the worker died twice | Check the worker; very long songs |
| `internal` | A bug | Read the worker log for that job id (`event: job`, `outcome: failed`), reproduce locally with `isai analyse`, fix, release |

**Reproduce locally:** ask the member for the file (the server deleted it), then run
`uv run isai analyse <file> --type <type> --out out --log-json`.
