// Velocity curves for the learner's own notes ("play my notes"). Pure.

export type VelocityCurve = 'soft' | 'normal' | 'hard';

/** The exponent of each curve: below 1 a light touch plays louder, above 1 it plays softer. */
export const CURVE_GAMMA: Readonly<Record<VelocityCurve, number>> = { soft: 0.6, normal: 1, hard: 1.6 };

/** `127 × (v / 127)^γ`, rounded and kept in 1–127. */
export function applyVelocityCurve(velocity: number, curve: VelocityCurve): number {
  const v = Math.min(127, Math.max(1, velocity));
  if (curve === 'normal') return Math.round(v);
  return Math.min(127, Math.max(1, Math.round(127 * (v / 127) ** CURVE_GAMMA[curve])));
}
