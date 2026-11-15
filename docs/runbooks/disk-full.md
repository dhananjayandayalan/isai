# The worker PC's disk is full

**Signs:** jobs fail with `internal` and the worker log shows `No space left on device`, or
Docker Desktop warns about disk space.

Where the space goes:
- **Job temp files:** a tmpfs of 8 GB inside the container (`/tmp/isai`), emptied after
  every job. A crash can't leave them behind past a restart.
- **The model volume:** about 1 GB, fetched once.
- **Old images:** about 6 GB each.
- **Logs:** capped at 14 × 20 MB.
- **Docker Desktop's own disk image:** grows and never shrinks on its own.
- **Backups**, if they're on the same disk.

1. **Remove old images:** `docker image prune -a --filter "until=720h"` (keeps the last
   month), or remove specific old tags.
2. **Clear the build cache:** `docker builder prune`.
3. **Backups:** keep the last 8 and move older ones off the disk.
4. **Docker Desktop's disk image:** Settings > Resources > Disk image location shows its
   size. After pruning, use "Clean / Purge data" only as a last resort (it removes the
   model volume too, which is fetched again at the next start).
5. **Restart the worker** and run `isai admin check`. Jobs that failed during this can be
   uploaded again by the members.
