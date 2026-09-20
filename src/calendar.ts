export function monthDays(month: string): (string | null)[] {
  if (!/^(19|20|21|22)\d{2}-(0[1-9]|1[0-2])$/.test(month))
    throw new Error("Choose a month between 1900 and 2299.");
  const [year, number] = month.split("-").map(Number);
  const start = (new Date(Date.UTC(year, number - 1, 1)).getUTCDay() + 6) % 7;
  const count = new Date(Date.UTC(year, number, 0)).getUTCDate();
  return Array.from({ length: Math.ceil((start + count) / 7) * 7 }, (_, i) =>
    i < start || i >= start + count
      ? null
      : `${month}-${String(i - start + 1).padStart(2, "0")}`,
  );
}

export function shiftMonth(month: string, amount: number) {
  monthDays(month);
  const [year, number] = month.split("-").map(Number);
  const next = new Date(Date.UTC(year, number - 1 + amount, 1))
    .toISOString()
    .slice(0, 7);
  monthDays(next);
  return next;
}
