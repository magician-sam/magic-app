import test from "node:test";
import assert from "node:assert/strict";
import { preparationChecklist } from "../dist/preparation.js";

test("confirmation keeps manual work, adds shared and show preparation, and is idempotent", () => {
  const booking = { checklist: [{ text: "Arrange transport", done: true }, { text: "Birthday cake cue", done: false }] };
  const shows = [{ checklist: ["Prepare costumes", "Test microphone"] }, { checklist: ["test microphone"] }];
  const result = preparationChecklist(booking, shows);
  assert.deepEqual(result[0], { text: "Arrange transport", done: true });
  assert.ok(result.some((item) => item.text === "Birthday cake cue"));
  assert.ok(result.some((item) => item.text === "Pack props and equipment"));
  assert.equal(result.filter((item) => item.text.toLowerCase() === "test microphone").length, 1);
  assert.deepEqual(preparationChecklist({ checklist: result }, shows), result);
  assert.equal(booking.checklist.length, 2);
});

test("a full manual checklist is preserved within the editable limit", () => {
  const checklist = Array.from({ length: 100 }, (_, i) => ({ text: "Manual task " + i, done: false }));
  assert.deepEqual(preparationChecklist({ checklist }, []), checklist);
});
