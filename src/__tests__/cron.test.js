const { msUntilNextHour } = require("../jobs/rental-status");

describe("msUntilNextHour", () => {
  it("returns the delay until the hour later today", () => {
    const from = new Date(2026, 7, 18, 8, 0, 0); // 08:00 local
    expect(msUntilNextHour(9, from)).toBe(60 * 60 * 1000); // 1 hour
  });

  it("rolls to the next day when the hour has already passed", () => {
    const from = new Date(2026, 7, 18, 10, 0, 0); // 10:00 local
    expect(msUntilNextHour(9, from)).toBe(23 * 60 * 60 * 1000); // 23 hours
  });

  it("rolls to the next day when it is exactly the hour", () => {
    const from = new Date(2026, 7, 18, 9, 0, 0); // 09:00 local
    expect(msUntilNextHour(9, from)).toBe(24 * 60 * 60 * 1000); // 24 hours
  });
});
