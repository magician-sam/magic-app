import { z } from "zod";
import { requireThat, short } from "./domain.js";
export const customFieldSchema = z
  .object({
    id: z.string().regex(/^[a-zA-Z0-9-]{1,64}$/),
    label: short.min(1),
    type: z.enum(["text", "textarea", "number", "select"]),
    required: z.boolean(),
    active: z.boolean(),
    position: z.number().int().min(0).optional(),
    options: z.array(short.min(1)).max(30),
  })
  .refine(
    (x) =>
      x.type !== "select" ||
      (x.options.length > 0 && new Set(x.options).size === x.options.length),
    "Choice questions need unique options.",
  );
export type CustomField = z.infer<typeof customFieldSchema>;
export function orderedFields(fields: CustomField[]): CustomField[] {
  return fields.slice().sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
}
export type CustomAnswer = {
  id: string;
  label: string;
  value: string | number;
};
export function customAnswers(
  fields: CustomField[],
  input: unknown,
): CustomAnswer[] {
  const values = z
    .record(z.string(), z.union([z.string().max(3000), z.number().finite()]))
    .parse(input ?? {});
  const active = orderedFields(fields).filter((f) => f.active);
  requireThat(
    Object.keys(values).every((key) => active.some((f) => f.id === key)),
    "Booking questions changed. Refresh and review your answers.",
  );
  return active.map((f) => {
    const value = Object.hasOwn(values, f.id) ? values[f.id] : "";
    requireThat(
      !f.required || String(value).trim().length > 0,
      `Please answer: ${f.label}`,
    );
    if (String(value).trim() !== "") {
      requireThat(
        f.type !== "number" || typeof value === "number",
        `Enter a number for: ${f.label}`,
      );
      requireThat(
        f.type !== "select" || f.options.includes(String(value)),
        `Choose a listed option for: ${f.label}`,
      );
    }
    return { id: f.id, label: f.label, value };
  });
}
