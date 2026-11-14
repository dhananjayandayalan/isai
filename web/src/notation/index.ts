// What is drawn on the stage above the keyboard: falling notes, the staff, the chord lane.
export { buildLane, laneIndexAt, type LaneEntry } from './chordLane';
export { drawFallingNotes, GHOST_ALPHA, labelNotes, MIN_BAR, steppedPosition, type FallingFrame } from './FallingNotes';
export { readStageColors, type StageColors } from './stage';
export {
  BASS,
  buildStaffNotes,
  drawStaff,
  ledgerSteps,
  PLAYHEAD_AT,
  staffGeometry,
  stepY,
  TREBLE,
  type StaffFrame,
  type StaffGeometry,
  type StaffNote,
} from './StaffRenderer';
