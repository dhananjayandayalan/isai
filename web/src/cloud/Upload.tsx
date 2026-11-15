import { useRef, useState, type DragEvent, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import {
  LEVELS,
  SOURCE_TYPES,
  UploadError,
  type Level,
  type SourceType,
  type UploadClient,
  type UploadHandle,
  type UploadProblem,
  type OpsClient,
} from '../api/types';
import { OfflineNotice } from './OfflineNotice';
import { SOURCE_HINT, SOURCE_LABEL, formatDuration } from './format';
import { EXTENSIONS, MAX_BYTES, MAX_SECONDS, type DurationProbe } from './media';


type FileProblem = 'many' | 'type' | 'big' | 'long';

const FILE_PROBLEM: Record<FileProblem, string> = {
  many: 'One song at a time. Pick a single file.',
  type: "That isn't an audio file Isai can read. Use MP3, WAV, FLAC, M4A, AAC or OGG.",
  big: 'That file is over 100 MB. Export it as MP3, then try again.',
  long: 'That recording is longer than 12 minutes. Trim it, then try again.',
};

const UPLOAD_PROBLEM: Record<UploadProblem, string> = {
  'daily-cap': "You've analysed 10 songs in the last day. Try again tomorrow.",
  unsupported: "Isai can't take that kind of file. Use MP3, WAV, FLAC, M4A, AAC or OGG.",
  'too-big': 'That file is over 100 MB. Export it as MP3, then try again.',
  network: 'The connection dropped during the upload. Check it, then try again.',
  cancelled: 'Upload cancelled.',
  unknown: "Isai couldn't start the analysis. Try again in a moment.",
};

const LEVEL_LABEL: Record<Level, string> = { easy: 'Easy', medium: 'Medium', full: 'Full' };

function titleFrom(name: string): string {
  const base = name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim();
  return base || 'Untitled';
}

interface Picked {
  file: File;
  seconds: number | null;
}

export function Upload({ uploads, probe, ops }: { uploads: UploadClient; probe: DurationProbe; ops: OpsClient }) {
  const navigate = useNavigate();
  const [picked, setPicked] = useState<Picked | null>(null);
  const [fileProblem, setFileProblem] = useState<FileProblem | null>(null);
  const [title, setTitle] = useState('');
  const [sourceType, setSourceType] = useState<SourceType>('full-mix');
  const [level, setLevel] = useState<Level>('medium');
  const [progress, setProgress] = useState<number | null>(null);
  const [problem, setProblem] = useState<UploadProblem | null>(null);
  const handle = useRef<UploadHandle | null>(null);

  async function choose(files: FileList | File[]) {
    const list = [...files];
    setProblem(null);
    if (list.length === 0) return;
    if (list.length > 1) return setFileProblem('many');
    const file = list[0] as File;
    const ext = file.name.includes('.') ? (file.name.split('.').pop() ?? '').toLowerCase() : '';
    if (!EXTENSIONS.includes(ext)) return setFileProblem('type');
    if (file.size > MAX_BYTES) return setFileProblem('big');
    const seconds = await probe(file);
    if (seconds !== null && seconds > MAX_SECONDS) return setFileProblem('long');
    setFileProblem(null);
    setPicked({ file, seconds });
    setTitle((t) => t || titleFrom(file.name));
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    void choose(event.dataTransfer.files);
  }

  async function start(event: FormEvent) {
    event.preventDefault();
    if (!picked || !title.trim()) return;
    setProblem(null);
    setProgress(0);
    const h = uploads.start({ file: picked.file, title: title.trim(), sourceType, level }, setProgress);
    handle.current = h;
    try {
      const { jobId } = await h.done;
      navigate(`/jobs/${jobId}`);
    } catch (error) {
      setProblem(error instanceof UploadError ? error.problem : 'unknown');
      setProgress(null);
    } finally {
      handle.current = null;
    }
  }

  const uploading = progress !== null;

  return (
    <main className="app-main">
      <div className="app-content stack-6">
        <header className="stack-2">
          <h1 className="t-page-title">Analyse a song</h1>
          <p className="t-secondary">
            Isai finds the key, tempo and chords, then writes a two-hand arrangement you can practise.
          </p>
        </header>
        <OfflineNotice ops={ops} />

        <form className="stack-6" onSubmit={(e) => void start(e)} aria-label="Analyse a song">
          {!picked ? (
            <label className="dropzone stack-2" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
              <span className="t-card-title">Drop an audio file, or browse</span>
              <span className="t-muted">MP3, WAV, FLAC, M4A, AAC, OGG · up to 12 minutes</span>
              <input
                type="file"
                accept="audio/*,.mp3,.wav,.flac,.m4a,.aac,.ogg,.opus,.webm"
                className="sr-only"
                aria-label="Audio file"
                onChange={(e) => {
                  const files = e.target.files;
                  if (files) void choose(files);
                  e.target.value = '';
                }}
              />
            </label>
          ) : (
            <div className="card-row row-between">
              <div className="stack-1">
                <span className="t-card-title">{picked.file.name}</span>
                <span className="t-muted t-mono">
                  {`${(picked.file.size / 1e6).toFixed(1)} MB`}
                  {picked.seconds !== null && ` · ${formatDuration(picked.seconds)}`}
                </span>
              </div>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={uploading}
                onClick={() => {
                  setPicked(null);
                  setTitle('');
                }}
              >
                Choose another file
              </button>
            </div>
          )}
          {fileProblem && (
            <p className="alert" role="alert">
              {FILE_PROBLEM[fileProblem]}
            </p>
          )}

          <div className="field">
            <label className="label" htmlFor="song-title">
              Title
            </label>
            <input
              id="song-title"
              className="input"
              required
              maxLength={200}
              value={title}
              disabled={uploading}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <fieldset className="stack-3" disabled={uploading} style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="label">What kind of recording is it?</legend>
            <div className="grid-cards">
              {SOURCE_TYPES.map((t) => (
                <label key={t} className="choice">
                  <input
                    type="radio"
                    name="source"
                    value={t}
                    checked={sourceType === t}
                    onChange={() => setSourceType(t)}
                  />
                  <span className="stack-1">
                    <b>{SOURCE_LABEL[t]}</b>
                    <span className="t-muted">{SOURCE_HINT[t]}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="stack-2">
            <span className="label" id="level-label">
              Arrangement
            </span>
            <div className="seg" role="group" aria-labelledby="level-label">
              {LEVELS.map((l) => (
                <button
                  key={l}
                  type="button"
                  className="seg-btn"
                  aria-pressed={level === l}
                  disabled={uploading}
                  onClick={() => setLevel(l)}
                >
                  {LEVEL_LABEL[l]}
                </button>
              ))}
            </div>
          </div>

          <p className="t-muted">The audio is deleted as soon as analysis finishes. Only the Song JSON and MIDI are kept.</p>

          {problem && problem !== 'cancelled' && (
            <p className="alert" role="alert">
              {UPLOAD_PROBLEM[problem]}
            </p>
          )}
          {problem === 'cancelled' && (
            <p className="t-muted" role="status">
              {UPLOAD_PROBLEM.cancelled}
            </p>
          )}

          {uploading ? (
            <div className="stack-3">
              <div
                className="progress progress-lg progress-striped"
                role="progressbar"
                aria-label="Uploading"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round((progress ?? 0) * 100)}
              >
                <span style={{ width: `${Math.round((progress ?? 0) * 100)}%` }} />
              </div>
              <div className="row-between">
                <span className="t-muted">Uploading… {Math.round((progress ?? 0) * 100)}%</span>
                <button type="button" className="btn btn-secondary" onClick={() => handle.current?.cancel()}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div>
              <button type="submit" className="btn btn-primary btn-lg" disabled={!picked || !title.trim()}>
                {problem && problem !== 'cancelled' ? 'Try again' : 'Start analysis'}
              </button>
            </div>
          )}
        </form>
      </div>
    </main>
  );
}
