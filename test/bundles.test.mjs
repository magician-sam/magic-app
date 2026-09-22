import test from "node:test";
import assert from "node:assert/strict";
import { prepareBundle, validateBundleSelection } from "../dist/bundles.js";
const shows = [
  {
    id: "magic",
    name: "Magic",
    active: true,
    duration: 40,
    setup: 20,
    priceMode: "fixed",
    price: 20000,
    minSpace: 12,
    needsPower: false,
    indoorOnly: false,
    checklist: ["Wand"],
  },
  {
    id: "bubble",
    name: "Bubbles",
    active: true,
    duration: 30,
    setup: 30,
    priceMode: "fixed",
    price: 15000,
    minSpace: 20,
    needsPower: true,
    indoorOnly: true,
    checklist: ["Wand", "Mat"],
  },
];
const input = {
  ...shows[0],
  name: "Double fun",
  bundleIds: ["magic", "bubble"],
  bundleBreakMinutes: 10,
  price: 30000,
};
test("bundles snapshot included shows and derive time and venue requirements", () => {
  const bundle = prepareBundle(input, shows, "offer");
  assert.equal(bundle.duration, 80);
  assert.equal(bundle.setup, 30);
  assert.equal(bundle.minSpace, 20);
  assert.equal(bundle.needsPower, true);
  assert.equal(bundle.indoorOnly, true);
  assert.deepEqual(bundle.checklist, ["Wand", "Mat"]);
  assert.equal(bundle.price, 30000);
  assert.equal(bundle.bundleSnapshot[0].price, 20000);
  const changed = structuredClone(shows);
  changed[0].price = 999;
  assert.equal(bundle.bundleSnapshot[0].price, 20000);
});
test("invalid bundle components and overlapping selections are rejected", () => {
  for (const bundleIds of [
    ["magic"],
    ["magic", "magic"],
    ["offer", "bubble"],
    ["missing", "bubble"],
  ])
    assert.throws(() => prepareBundle({ ...input, bundleIds }, shows, "offer"));
  assert.throws(() =>
    prepareBundle({ ...input, priceMode: "quote" }, shows, "offer"),
  );
  assert.throws(() =>
    prepareBundle(input, [{ ...shows[0], active: false }, shows[1]], "offer"),
  );
  assert.throws(() =>
    prepareBundle(
      input,
      [{ ...shows[0], bundleIds: ["nested"] }, shows[1]],
      "offer",
    ),
  );
  const bundle = { ...prepareBundle(input, shows, "offer"), id: "offer" };
  assert.throws(() => validateBundleSelection([bundle, shows[0]]));
  assert.throws(() =>
    validateBundleSelection([bundle, { ...bundle, id: "offer2" }]),
  );
  assert.doesNotThrow(() => validateBundleSelection([bundle]));
  assert.doesNotThrow(() => validateBundleSelection(shows));
});
