# Isai — clickable design prototype

Grey-theme mockups of the Isai web app (Library, Analyse a song, Song overview,
Practice in training/performance mode, Results, MIDI & keyboard). This is a design
prototype only — it is not part of `web/` and uses no app code.

## Run it

```
cd design/prototype
node serve.mjs
```

Then open http://localhost:5180/ (pass another port as `node serve.mjs 5190` if 5180 is taken).
Stop the server with Ctrl+C.

## Files

- `*.dc.html` — one file per screen, exported from the Isai App Screens design canvas.
- `support.js` — small local runtime that renders those screens outside the canvas.
- `serve.mjs` — dependency-free static server (Node 18+).
- `index.html` — screen list.

Tip: `Practice.dc.html?startMode=performance` opens the practice screen in performance mode.
