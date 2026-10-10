import { describe, expect, it } from "vitest";
import { ASPECT_RATIOS, nearestAspect, planCrop, ratioValue, targetSize } from "./crop";

describe("crop math", () => {
  it("picks the nearest supported aspect ratio", () => {
    expect(nearestAspect(4000, 3000)).toBe("4:3");
    expect(nearestAspect(3000, 4000)).toBe("3:4");
    expect(nearestAspect(1920, 1080)).toBe("16:9");
    expect(nearestAspect(1080, 1920)).toBe("9:16");
    expect(nearestAspect(1000, 1000)).toBe("1:1");
    expect(nearestAspect(6000, 4000)).toBe("3:2");
    expect(nearestAspect(5000, 1000)).toBe("21:9");
    expect(nearestAspect(1000, 5000)).toBe("9:16");
  });

  it("produces target sizes with a 1024 px long edge", () => {
    expect(targetSize("4:3")).toEqual({ width: 1024, height: 768 });
    expect(targetSize("3:4")).toEqual({ width: 768, height: 1024 });
    expect(targetSize("1:1")).toEqual({ width: 1024, height: 1024 });
    expect(targetSize("16:9")).toEqual({ width: 1024, height: 576 });
    expect(targetSize("21:9")).toEqual({ width: 1024, height: 439 });
  });

  it("keeps the full frame when the ratio already matches", () => {
    expect(planCrop(4000, 3000)).toEqual({
      aspectRatio: "4:3",
      sx: 0,
      sy: 0,
      sw: 4000,
      sh: 3000,
      width: 1024,
      height: 768,
    });
  });

  it("center-crops the longer side", () => {
    const wide = planCrop(4100, 3000);
    expect(wide.aspectRatio).toBe("4:3");
    expect(wide.sw).toBe(4000);
    expect(wide.sh).toBe(3000);
    expect(wide.sx).toBe(50);
    expect(wide.sy).toBe(0);

    const tall = planCrop(3000, 4200);
    expect(tall.aspectRatio).toBe("3:4");
    expect(tall.sw).toBe(3000);
    expect(tall.sh).toBe(4000);
    expect(tall.sy).toBe(100);
  });

  it("never plans a crop outside the source for any size", () => {
    for (const [w, h] of [[1, 1], [7, 3], [333, 1000], [1023, 1025], [9999, 17], [640, 427]]) {
      const plan = planCrop(w, h);
      expect(plan.sx).toBeGreaterThanOrEqual(0);
      expect(plan.sy).toBeGreaterThanOrEqual(0);
      expect(plan.sx + plan.sw).toBeLessThanOrEqual(w);
      expect(plan.sy + plan.sh).toBeLessThanOrEqual(h);
      expect(plan.sw).toBeGreaterThan(0);
      expect(plan.sh).toBeGreaterThan(0);
      expect(Math.max(plan.width, plan.height)).toBe(1024);
    }
  });

  it("rejects empty images", () => {
    expect(() => planCrop(0, 100)).toThrow();
  });

  it("lists ten ratios with positive values", () => {
    expect(ASPECT_RATIOS).toHaveLength(10);
    expect(ASPECT_RATIOS.every((a) => ratioValue(a) > 0)).toBe(true);
  });
});
