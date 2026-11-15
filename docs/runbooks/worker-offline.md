# The worker is offline

**Signs:**
- The upload and progress pages say "The analysis machine is offline".
- The Admin page shows the worker's "last seen" minutes ago.
- The alert reports `worker_silent`.

**Effect:** uploads still work and wait in the queue. Nothing is lost until an upload is a day
old; after that its job fails with `upload_expired` and the audio is deleted (rule 8).

1. **Is the PC on and signed in?** Docker Desktop only starts after sign-in. Turn it on.
2. **Is the container running?**
   `docker compose -f ops/worker/compose.yaml ps`. If it isn't, run `up -d`.
3. **Why did it stop?** Read `docker compose -f ops/worker/compose.yaml logs --tail 200 worker`:
   - `set ISAI_SUPABASE_URL and ISAI_SUPABASE_SERVICE_KEY`: `ops/worker/.env` is missing a
     value.
   - `401` / `Invalid API key`: the service key was rotated. Update `.env`
     ([rotate-keys.md](rotate-keys.md)).
   - `downloading ... failed`: a model download failed at start. It retries on the next
     start; check the network.
   - CUDA errors: update the NVIDIA driver; check `docker run --rm --gpus all
     nvidia/cuda:12.6.0-base-ubuntu24.04 nvidia-smi`.
4. **When it's back,** the Admin page shows a fresh "last seen", and queued songs start in
   order. Watch one finish.
5. **If the PC will be off for long** (travel), tell the friends, or run a cloud GPU with
   the same image and `.env` (ADR 0016's fallback).
