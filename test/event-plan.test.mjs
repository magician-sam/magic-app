import test from "node:test";
import assert from "node:assert/strict";
import { planLink, readPlanLink } from "../dist/event-plan.js";

test("event plan links carry only permitted catalog choices and stay business scoped", () => {
  const link = planLink("https://example.test/b/sam?source=whatsapp", "sam", {
    shows: ["magic", "science", "magic"], guests: ["Juggling"], occasion: "School event",
  });
  const url = new URL(link);
  assert.equal(url.searchParams.get("source"), "whatsapp");
  assert.equal(url.searchParams.getAll("plan-show").length, 2);
  assert.equal(url.hash, "#event-box");
  assert.deepEqual(readPlanLink(url.search, "sam", ["magic", "science"], ["Juggling"], ["School event"]), {
    shows: ["magic", "science"], guests: ["Juggling"], occasion: "School event",
  });
  assert.equal(readPlanLink(url.search, "other", ["magic", "science"], ["Juggling"], ["School event"]), null);
  const tampered = url.search + "&plan-show=deleted&plan-guest=Unknown&plan-occasion=Private%20event";
  assert.deepEqual(readPlanLink(tampered, "sam", ["science"], [], ["School event"]), {
    shows: ["science"], guests: [], occasion: "School event",
  });
  assert.doesNotMatch(link, /customer|phone|venue|secret/i);
});
