import { describe, expect, it } from "vitest";
import { formatPages } from "./pageCount";

describe("formatPages", () => {
  it("rounds to one decimal", () => {
    expect(formatPages(3.44)).toBe("≈ 3.4 pages");
  });

  it("uses the singular for one page", () => {
    expect(formatPages(1.02)).toBe("≈ 1 page");
  });

  it("never reports an empty page count", () => {
    expect(formatPages(0)).toBe("≈ 0.1 pages");
  });
});
