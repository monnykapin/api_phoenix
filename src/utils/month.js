/**
 * Parse a "YYYY-MM" string into an inclusive [start, end) range using local
 * time, matching the day-granularity convention used elsewhere in the app.
 *
 * Returns null when the input is not a valid month (bad format or month out
 * of 1..12 range).
 */
const monthRange = (month) => {
  if (typeof month !== "string") return null;

  const match = /^(\d{4})-(\d{2})$/.exec(month.trim());
  if (!match) return null;

  const year = Number(match[1]);
  const monthIndex = Number(match[2]);
  if (monthIndex < 1 || monthIndex > 12) return null;

  return {
    start: new Date(year, monthIndex - 1, 1),
    end: new Date(year, monthIndex, 1),
  };
};

/**
 * Add one month to a date, keeping the day of month. When the target month is
 * shorter than the source day (e.g. Jan 31 -> Feb), the day is clamped to the
 * last day of the target month.
 */
const addOneMonth = (value) => {
  const d = new Date(value);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 2, 0).getDate();
  const day = Math.min(d.getDate(), lastDay);
  return new Date(
    d.getFullYear(),
    d.getMonth() + 1,
    day,
    d.getHours(),
    d.getMinutes(),
    d.getSeconds(),
    d.getMilliseconds()
  );
};

module.exports = { monthRange, addOneMonth };
