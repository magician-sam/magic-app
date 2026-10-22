import { DateTime } from "luxon";
import type { DataOf, FinanceRecord } from "./finance-model.js";
import { checkedMoney, FinanceValidationError } from "./finance-math.js";
const need = (condition: unknown, message: string) => {
  if (!condition) throw new FinanceValidationError(message);
};
export function hourlyBasic(hours: number, rate: number) {
  need(
    Number.isFinite(hours) && hours >= 0 && hours <= 10000,
    "Choose valid paid hours.",
  );
  checkedMoney(rate);
  need(rate >= 0, "Choose a positive hourly rate.");
  return checkedMoney(
    Number(
      (BigInt(rate) * BigInt(Math.round(hours * 1_000_000)) + 500_000n) /
        1_000_000n,
    ),
  );
}
export function attendanceClockHours(
  work: Pick<
    DataOf<"work">,
    "date" | "toDate" | "startTime" | "endTime" | "breakMinutes"
  >,
  zone: string,
) {
  if (!work.startTime && !work.endTime) return null;
  need(
    work.startTime && work.endTime,
    "Enter both clock-in and clock-out times, or leave both blank for manual hours.",
  );
  const start = DateTime.fromISO(work.date + "T" + work.startTime, { zone }),
    end = DateTime.fromISO((work.toDate || work.date) + "T" + work.endTime, {
      zone,
    });
  need(
    start.isValid &&
      end.isValid &&
      start.toFormat("HH:mm") === work.startTime &&
      end.toFormat("HH:mm") === work.endTime,
    "Check clock times and the business time zone.",
  );
  need(
    start.getPossibleOffsets().length === 1 &&
      end.getPossibleOffsets().length === 1,
    "These clock times are ambiguous during a daylight-saving change. Enter reviewed manual hours instead.",
  );
  const minutes = end.diff(start, "minutes").minutes;
  need(
    minutes > 0 && minutes <= 24 * 60,
    "Clock-out must follow clock-in within 24 hours. Set the end date for an overnight shift.",
  );
  need(work.breakMinutes <= minutes, "Break time cannot exceed the shift.");
  return Number(((minutes - work.breakMinutes) / 60).toFixed(6));
}
export function approvedAttendance(
  records: readonly FinanceRecord[],
  employeeId: string,
  period: string,
) {
  const rows = records.filter(
    (r): r is FinanceRecord & { data: DataOf<"work"> } =>
      r.data.type === "work" &&
      !r.archived &&
      r.data.employeeId === employeeId &&
      r.data.kind === "attendance" &&
      r.data.approved &&
      r.data.date.startsWith(period),
  );
  need(
    rows.every((r) => !r.data.toDate || r.data.toDate.startsWith(period)),
    "Split attendance that crosses salary months before loading approved hours.",
  );
  return {
    hours: Number(rows.reduce((sum, r) => sum + r.data.hours, 0).toFixed(6)),
    ids: rows.map((r) => r.id),
  };
}
export function attendanceLocked(
  records: readonly FinanceRecord[],
  id: string,
) {
  return records.some(
    (r) =>
      r.data.type === "payroll" &&
      r.status === "posted" &&
      (r.data.workIds ?? []).includes(id),
  );
}
export function validatePayrollHours(
  pay: DataOf<"payroll">,
  records: readonly FinanceRecord[],
) {
  if (pay.payBasis === "hourly") {
    const calculated = hourlyBasic(pay.paidHours, pay.hourlyRate);
    need(
      calculated === pay.basic || !!pay.calculationNotes?.trim(),
      "Explain the hourly basic-pay adjustment before saving.",
    );
    if (pay.paidHours > 0 && !(pay.workIds ?? []).length)
      need(
        pay.calculationNotes?.trim(),
        "Explain manually entered hours, or load approved attendance.",
      );
  }
  const ids = pay.workIds ?? [];
  need(
    new Set(ids).size === ids.length,
    "Use each attendance entry only once.",
  );
  if (ids.length) {
    const source = approvedAttendance(records, pay.employeeId, pay.period);
    need(
      ids.every((id) => source.ids.includes(id)),
      "A linked attendance entry changed or is not approved for this employee and month. Reload approved hours.",
    );
    const hours = records
      .filter((r) => ids.includes(r.id) && r.data.type === "work")
      .reduce((sum, r) => sum + (r.data as DataOf<"work">).hours, 0);
    need(
      Math.abs(hours - pay.paidHours) < 0.00001 ||
        !!pay.calculationNotes?.trim(),
      "Approved attendance hours changed. Reload them or explain the adjustment.",
    );
  }
}
