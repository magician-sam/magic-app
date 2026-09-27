self.addEventListener("push", (event) => {
  let message = {};
  try { message = event.data?.json() ?? {}; } catch { /* Ignore malformed payloads. */ }
  const title = typeof message.title === "string" ? message.title : "Magic by Sam";
  const body = typeof message.body === "string" ? message.body : "You have a new update.";
  const url = typeof message.url === "string" && message.url.startsWith("/") && !message.url.startsWith("//") ? message.url : "/";
  event.waitUntil(self.registration.showNotification(title, {
    body,
    icon: "/icons/apple-touch-icon.png",
    badge: "/icons/apple-touch-icon.png",
    data: { url },
    tag: `magic-update-${Date.now()}`,
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = windows.find((client) => client.url.startsWith(self.location.origin));
    if (existing) { await existing.navigate(url); return existing.focus(); }
    return self.clients.openWindow(url);
  })());
});
