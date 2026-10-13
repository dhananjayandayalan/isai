import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import invalid from '../../schema/examples/invalid-out-of-range.json';
import App from './App';

describe('App', () => {
  it('shows the example song title, key, tempo and note count', () => {
    const html = renderToString(<App />);
    expect(html).toContain('Twinkle, Twinkle, Little Star');
    expect(html).toMatch(/data-stat="key">G major</);
    expect(html).toMatch(/data-stat="tempo">100 BPM</);
    expect(html).toMatch(/data-stat="notes">21</);
  });

  it('shows an error state for an invalid song', () => {
    const html = renderToString(<App source={invalid} />);
    expect(html).toContain('role="alert"');
    expect(html).toContain('couldn&#x27;t read this song');
  });
});
