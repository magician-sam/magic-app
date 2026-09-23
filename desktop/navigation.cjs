const APP_ORIGIN = 'https://magic-app-gray.vercel.app';
const HOME_URL = `${APP_ORIGIN}/manage`;

function navigationKind(raw) {
  try {
    const url = new URL(raw);
    if (url.origin === APP_ORIGIN) return 'app';
    if (url.protocol === 'https:') return 'external';
  } catch {
    // An invalid URL is never a permitted navigation target.
  }
  return 'blocked';
}

module.exports = { APP_ORIGIN, HOME_URL, navigationKind };
