import { createSeededRandom, deriveSeed } from "./random";

describe("concept-interactive/random", () => {
  it("is deterministic with same seed", () => {
    const a = createSeededRandom(42);
    const b = createSeededRandom(42);
    const seqA = [a.next(), a.next(), a.nextInt(1, 9), a.nextInt(20, 30)];
    const seqB = [b.next(), b.next(), b.nextInt(1, 9), b.nextInt(20, 30)];
    expect(seqA).toEqual(seqB);
  });

  it("deriveSeed returns stable different values for labels", () => {
    const s1 = deriveSeed(100, "ild");
    const s2 = deriveSeed(100, "bass");
    const s3 = deriveSeed(100, "ild");
    expect(s1).toBe(s3);
    expect(s1).not.toBe(s2);
  });
});
