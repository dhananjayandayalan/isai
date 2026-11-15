# Piano samples don't load

**Signs:** the piano sounds like a simple synth (Isai falls back when samples fail), and the
Admin page shows `audio` errors.

Production serves the samples itself, from `/samples/piano/v1/` and `/samples/epiano/v1/`
(`pnpm build:site`), so "the host" is the site.

1. **Open `<site>/samples/piano/v1/C4.mp3`.** If it 404s, the last deploy skipped the
   samples. Redeploy (re-run the `web` job), and check its log shows "30 files checked".
2. **The deploy failed with "doesn't match samples.lock.json":** an upstream file changed.
   Don't deploy an unchecked file. Compare it, and if the change is fine, run
   `pnpm samples:lock` in `web/`, commit the new lock, and deploy.
3. **The upstream host is down at deploy time:** the deploy fails before anything changes,
   and the site keeps the previous build. Retry later.
4. **A browser blocks them:** a CSP violation in the console means `_headers` and the sample
   path disagree. The headers allow `'self'`; check `VITE_PIANO_SAMPLES_URL` wasn't
   overridden.
