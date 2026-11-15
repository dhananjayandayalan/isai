// What the upload page checks before sending a file (the server checks again).

export const MAX_BYTES = 100 * 1024 * 1024;
export const MAX_SECONDS = 12 * 60;
export const EXTENSIONS = ['mp3', 'wav', 'flac', 'm4a', 'aac', 'ogg', 'oga', 'opus', 'webm'];

/** How long a recording is, from its metadata; null when the browser can't tell. */
export type DurationProbe = (file: File) => Promise<number | null>;

/** The browser's own reading of the file's length (no decoding, no upload). */
export const probeDuration: DurationProbe = (file) =>
  new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = document.createElement('audio');
    const done = (seconds: number | null) => {
      URL.revokeObjectURL(url);
      resolve(seconds);
    };
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => done(Number.isFinite(audio.duration) ? audio.duration : null);
    audio.onerror = () => done(null); // the server checks again
    audio.src = url;
  });
