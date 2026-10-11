import { describe, expect, it } from "vitest";
import { addTally, countHands, decide, handCentre, sideOf } from "./votes";

const hand = (x: number, y = 0.4) => [
  { x: x - 0.02, y },
  { x: x + 0.02, y: y + 0.05 },
];

describe("hand votes", () => {
  it("finds the centre of a hand", () => {
    expect(handCentre([])).toBeNull();
    const centre = handCentre(hand(0.3));
    expect(centre?.x).toBeCloseTo(0.3);
    expect(centre?.y).toBeCloseTo(0.425);
  });

  it("maps the raw camera side to the mirrored screen side", () => {
    // A left hand is on the right of the raw frame and on the left of the mirrored preview.
    expect(sideOf(0.8)).toBe("real");
    expect(sideOf(0.2)).toBe("edited");
    expect(sideOf(0.52)).toBeNull();
  });

  it("counts hands per side and ignores the middle", () => {
    expect(countHands([hand(0.9), hand(0.7), hand(0.1), hand(0.5)])).toEqual({ real: 2, edited: 1 });
    expect(countHands([])).toEqual({ real: 0, edited: 0 });
  });

  it("decides only with enough sightings and a clear majority", () => {
    expect(decide({ real: 1, edited: 1 })).toBeNull();
    expect(decide({ real: 30, edited: 4 })).toBe("real");
    expect(decide({ real: 3, edited: 40 })).toBe("edited");
    expect(decide({ real: 20, edited: 20 })).toBeNull();
    expect(decide(addTally({ real: 2, edited: 0 }, { real: 3, edited: 1 }))).toBe("real");
  });
});
