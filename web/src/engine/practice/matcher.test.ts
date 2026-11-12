import { describe, expect, it } from 'vitest';
import { EARLY_GRACE, StepMatcher } from './matcher';
import type { Step } from './steps';

function step(pitches: number[], start = 0): Step {
  return { index: 0, start, pitches, hands: pitches.map(() => 'right' as const) };
}

/** A matcher whose target step playback has already reached at `time`. */
function waitingFor(pitches: number[], time = 10, options = {}) {
  const matcher = new StepMatcher(options);
  matcher.setTarget(step(pitches));
  matcher.arm(time);
  return matcher;
}

describe('StepMatcher', () => {
  it('is done when the one expected pitch is played', () => {
    const m = waitingFor([60]);
    expect(m.done).toBe(false);
    expect(m.waiting).toBe(true);
    expect(m.noteOn(60, 10.5)).toBe('matched');
    expect(m.done).toBe(true);
    expect(m.waiting).toBe(false);
  });

  it('needs every pitch of a chord, in any order', () => {
    const m = waitingFor([60, 64, 67]);
    expect(m.noteOn(67, 10.1)).toBe('matched');
    expect(m.noteOn(60, 10.2)).toBe('matched');
    expect(m.done).toBe(false);
    expect(m.remaining).toEqual([64]); // missing one pitch
    expect(m.noteOn(64, 10.3)).toBe('matched');
    expect(m.done).toBe(true);
  });

  it('records wrong notes without blocking', () => {
    const m = waitingFor([60, 64]);
    expect(m.noteOn(61, 10.1)).toBe('wrong');
    expect(m.noteOn(72, 10.2)).toBe('wrong'); // right name, wrong octave
    expect(m.wrong).toBe(2);
    expect(m.noteOn(60, 10.3)).toBe('matched');
    expect(m.noteOn(64, 10.4)).toBe('matched');
    expect(m.done).toBe(true);
    expect(m.wrong).toBe(2);
  });

  it('calls a second press of a pitch already played a repeat, not a wrong note', () => {
    const m = waitingFor([60, 64]);
    m.noteOn(60, 10.1);
    m.noteOff(60);
    expect(m.noteOn(60, 10.2)).toBe('repeat');
    expect(m.wrong).toBe(0);
    expect(m.done).toBe(false);
  });

  it('is idle with no target, and never done', () => {
    const m = new StepMatcher();
    expect(m.noteOn(60, 1)).toBe('idle');
    expect(m.done).toBe(false);
    expect(m.arm(1)).toEqual([]);
    m.setTarget(step([60]));
    m.setTarget(null);
    expect(m.noteOn(60, 2)).toBe('idle');
    expect(m.remaining).toEqual([]);
  });

  it('ignores key numbers that are not MIDI notes', () => {
    const m = waitingFor([60]);
    expect(m.noteOn(128, 10.1)).toBe('idle');
    expect(m.noteOn(-1, 10.1)).toBe('idle');
    m.noteOff(200);
    expect(m.wrong).toBe(0);
  });

  describe('early grace', () => {
    it('counts a key pressed just before playback reached the step', () => {
      const m = new StepMatcher();
      m.setTarget(step([60]));
      expect(m.noteOn(60, 9.9)).toBe('early');
      m.noteOff(60);
      expect(m.arm(10)).toEqual([{ pitch: 60, key: 60 }]);
      expect(m.done).toBe(true);
    });

    it('counts a press exactly at the edge of the grace, and not one just beyond it', () => {
      expect(EARLY_GRACE).toBe(0.15);
      const atEdge = new StepMatcher();
      atEdge.setTarget(step([60]));
      atEdge.noteOn(60, 10 - EARLY_GRACE);
      atEdge.noteOff(60);
      expect(atEdge.arm(10)).toHaveLength(1);

      const beyond = new StepMatcher();
      beyond.setTarget(step([60]));
      beyond.noteOn(60, 10 - EARLY_GRACE - 0.001);
      beyond.noteOff(60);
      expect(beyond.arm(10)).toEqual([]);
      expect(beyond.done).toBe(false);
      // ...so it has to be played again.
      expect(beyond.noteOn(60, 10.2)).toBe('matched');
    });

    it('takes a custom grace', () => {
      const m = new StepMatcher({ earlyGrace: 0.5 });
      m.setTarget(step([60]));
      m.noteOn(60, 9.6);
      m.noteOff(60);
      expect(m.arm(10)).toHaveLength(1);
    });

    it('counts part of a chord early and waits for the rest', () => {
      const m = new StepMatcher();
      m.setTarget(step([60, 64]));
      m.noteOn(60, 9.95);
      expect(m.arm(10)).toEqual([{ pitch: 60, key: 60 }]);
      expect(m.remaining).toEqual([64]);
      expect(m.waiting).toBe(true);
    });

    it('counts a wrong note played before the step as wrong', () => {
      const m = new StepMatcher();
      m.setTarget(step([60]));
      expect(m.noteOn(61, 9.9)).toBe('wrong');
      expect(m.wrong).toBe(1);
    });

    it('does not reuse an early press for the step after', () => {
      const m = new StepMatcher();
      m.setTarget(step([60]));
      m.noteOn(60, 9.95);
      m.noteOff(60);
      m.arm(10);
      expect(m.done).toBe(true);
      // The same pitch again 100 ms later: the earlier press is spent.
      m.setTarget(step([60]));
      expect(m.arm(10.1)).toEqual([]);
      expect(m.done).toBe(false);
    });
  });

  describe('a note held from before', () => {
    it('counts a key that is still down when the step expects it again', () => {
      const m = waitingFor([60]);
      m.noteOn(60, 10.1); // played for this step, and kept down
      m.setTarget(step([60]));
      expect(m.arm(11)).toEqual([{ pitch: 60, key: 60 }]);
      expect(m.done).toBe(true);
    });

    it('does not count it once the key has come up', () => {
      const m = waitingFor([60]);
      m.noteOn(60, 10.1);
      m.noteOff(60);
      m.setTarget(step([60]));
      expect(m.arm(11)).toEqual([]);
      expect(m.isDown(60)).toBe(false);
    });

    it('remembers keys pressed while there was no target', () => {
      const m = new StepMatcher();
      m.noteOn(60, 1);
      m.setTarget(step([60, 64]));
      expect(m.arm(5)).toEqual([{ pitch: 60, key: 60 }]);
    });

    it('forgets held keys when told the keyboard went away', () => {
      const m = new StepMatcher();
      m.noteOn(60, 1);
      m.releaseKeys();
      m.setTarget(step([60]));
      expect(m.arm(5)).toEqual([]);
    });
  });

  it('treats a note-off (velocity 0 arrives as one) as the key coming up, never as a press', () => {
    const m = waitingFor([60]);
    m.noteOff(60);
    expect(m.done).toBe(false);
    expect(m.wrong).toBe(0);
    expect(m.isDown(60)).toBe(false);
  });

  it('resets the wrong count for each new target', () => {
    const m = waitingFor([60]);
    m.noteOn(61, 10.1);
    expect(m.wrong).toBe(1);
    m.setTarget(step([62]));
    expect(m.wrong).toBe(0);
  });

  describe('any octave', () => {
    it('accepts the right note name in any octave', () => {
      const m = waitingFor([60], 10, { octave: 'any' });
      expect(m.noteOn(61, 10.1)).toBe('wrong');
      expect(m.noteOn(84, 10.2)).toBe('matched');
      expect(m.done).toBe(true);
    });

    it('needs two keys for two pitches of the same name', () => {
      const m = waitingFor([48, 60], 10, { octave: 'any' });
      expect(m.noteOn(72, 10.1)).toBe('matched');
      expect(m.done).toBe(false);
      expect(m.noteOn(36, 10.2)).toBe('matched');
      expect(m.done).toBe(true);
    });

    it('counts held and early keys of the right name, each for one pitch', () => {
      const m = new StepMatcher({ octave: 'any' });
      m.noteOn(72, 1); // held
      m.setTarget(step([48, 60, 64]));
      m.noteOn(88, 9.95); // an E, early
      m.noteOff(88);
      const satisfied = m.arm(10);
      expect(satisfied).toEqual([
        { pitch: 48, key: 72 },
        { pitch: 64, key: 88 },
      ]);
      expect(m.remaining).toEqual([60]);
    });

    it('can be switched on later', () => {
      const m = waitingFor([60]);
      expect(m.noteOn(72, 10.1)).toBe('wrong');
      m.setOctave('any');
      m.noteOff(72);
      expect(m.noteOn(72, 10.2)).toBe('matched');
    });
  });
});
