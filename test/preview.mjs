// Isolated local preview/test server. Never use this fixture for production.
import { Store } from "../dist/store.js";
import { createUser } from "../dist/auth.js";
import { createApp } from "../dist/server.js";
const store = new Store(":memory:");
const business = store.createBusiness("Magic by Sam", "magic-by-sam");
await createUser(
  store,
  business.id,
  "preview@example.test",
  "Local-preview-only-42!",
  "Preview owner",
  "admin",
);
store.put(business.id, "performers", {
  id: "sam",
  name: "Sam · preview profile",
  bio: "Magic, science and bubbles. This is a sample profile for local testing; replace with approved biography and media before launch.",
  categories: ["magic", "science", "bubbles"],
  photo: "",
  video: "",
  areas: "Service areas to be confirmed",
  active: true,
  membershipVerified: false,
});
createApp(store, "http://localhost:3000").listen(3000, "127.0.0.1", () =>
  console.log(
    "Isolated preview ready at http://localhost:3000. All records are test-only and disappear when this process stops.",
  ),
);
