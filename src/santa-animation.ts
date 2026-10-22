/** Registered poses in the original four-column, three-row Santa sheet. */
export const santaPoses = {
  wave: [0, 1, 2, 1, 0, 1, 2, 3, 4],
  turn: [4, 5, 6, 7, 4],
  jump: [8, 9, 10, 11, 4],
} as const;
export type SantaGesture = keyof typeof santaPoses;

export function santaSheetOffset(frame: number) {
  const safe = Math.max(0, Math.min(11, Math.trunc(Number.isFinite(frame) ? frame : 4)));
  return {x: -(safe % 4) * 25, y: -Math.floor(safe / 4) * 100 / 3};
}
