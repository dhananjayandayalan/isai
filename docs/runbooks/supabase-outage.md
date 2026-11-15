# Supabase is down or the project is paused

**Signs:**
- Everyone sees "We couldn't fetch your songs".
- Sign-in links don't arrive.
- The watch run fails at `isai admin check` with a connection error.

1. **Check the status page:** https://status.supabase.com. If Supabase has an incident,
   wait. Practice of songs already open keeps working (it runs in the browser), but nothing
   saves until it's back.
2. **Paused project:** free projects pause after a week without activity. The dashboard
   shows "Paused"; press Restore. The 15-minute watch normally keeps it awake; if it
   paused, check that the watch workflow is running.
3. **Over a limit** (storage, egress, database size on the free plan): the dashboard says
   which. Delete old test songs, or move to Pro (ADR 0016).
4. **Afterwards:**
   - Jobs whose lease ran out during the outage go back to the queue on their own.
   - Uploads made just before the outage may have failed; members upload again.
   - Run `isai admin check` to confirm all clear.
