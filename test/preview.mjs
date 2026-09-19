// Isolated local preview/test server. Never use this fixture for production.
import { Store } from "../dist/store.js";
import { createUser } from "../dist/auth.js";
import { createApp } from "../dist/server.js";
const store = new Store(":memory:");
const business = store.createBusiness("Magic by Sam", "magic-by-sam");
business.otherShowNames = [
  "Animation",
  "Dog Show",
  "Acrobat",
  "BMX",
  "Clown",
  "Juggler",
  "Breakdance",
];
business.characterNames = ["Polar Bear", "Panda", "Bunny"];
business.whatsapp = "+96171299716";
business.contactEmail = "sam.wehbi@gmail.com";
store.db
  .prepare("UPDATE businesses SET data=? WHERE id=?")
  .run(JSON.stringify(business), business.id);
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
const port = Number(process.env.PREVIEW_PORT ?? 3000);
createApp(store, `http://localhost:${port}`).listen(port, "127.0.0.1", () =>
  console.log(
    `Isolated preview ready at http://localhost:${port}. All records are test-only and disappear when this process stops.`,
  ),
);
