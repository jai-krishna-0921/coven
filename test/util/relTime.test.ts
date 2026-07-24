import { describe, expect, test } from "bun:test";
import { relTime } from "../../src/util/relTime.ts";

describe("relTime bucket boundaries", () => {
  test("sub-second → 'now'", () => {
    expect(relTime(0)).toBe("now");
    expect(relTime(999)).toBe("now");
  });
  test("negative or non-finite → 'now' (no negative buckets)", () => {
    expect(relTime(-5_000)).toBe("now");
    expect(relTime(Number.NaN)).toBe("now");
  });
  test("seconds bucket 1s..59s", () => {
    expect(relTime(1_000)).toBe("1s");
    expect(relTime(59_000)).toBe("59s");
  });
  test("60s → '1m' (bucket flip)", () => {
    expect(relTime(60_000)).toBe("1m");
  });
  test("59m59s → '59m'; 60m → '1h'", () => {
    expect(relTime(59 * 60_000 + 59_000)).toBe("59m");
    expect(relTime(60 * 60_000)).toBe("1h");
  });
  test("23h59m → '23h'; 24h → '1d'", () => {
    expect(relTime(23 * 3_600_000 + 59 * 60_000)).toBe("23h");
    expect(relTime(24 * 3_600_000)).toBe("1d");
  });
  test("6d → '6d'; 7d → '1w'", () => {
    expect(relTime(6 * 86_400_000)).toBe("6d");
    expect(relTime(7 * 86_400_000)).toBe("1w");
  });
});
