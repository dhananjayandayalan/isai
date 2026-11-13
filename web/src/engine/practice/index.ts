// The practice engine (ADR 0005): steps, matcher, bars and the engine that plays them.
export { barRange, barsOfSong, beatPeriodAt, buildBars, CHUNK_SECONDS, type Bar, type Bars } from './bars';
export {
  buildSteps,
  CHORD_TOLERANCE,
  firstStepAt,
  practises,
  type HandChoice,
  type PitchRange,
  type Step,
  type StepOptions,
} from './steps';
export {
  EARLY_GRACE,
  StepMatcher,
  type MatcherOptions,
  type NoteVerdict,
  type OctaveMatch,
  type Satisfied,
} from './matcher';
export {
  DEFAULT_SETTINGS,
  HOLD_LEAD,
  MAX_SPEED,
  MIN_SPEED,
  POLICIES,
  PracticeEngine,
  SPEED_STEP,
  type ExpectedKey,
  type PracticeEngineOptions,
  type PracticeMode,
  type PracticePhase,
  type PracticePolicy,
  type PracticeSettings,
  type PracticeState,
  type StepEvent,
} from './engine';
export {
  FLASH_CORRECT,
  FLASH_SECONDS,
  FLASH_WRONG,
  KEY_EXPECT_LEFT,
  KEY_EXPECT_RIGHT,
  KEY_NEXT_LEFT,
  KEY_NEXT_RIGHT,
  type PracticeView,
} from './view';
