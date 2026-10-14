/** Media belongs to the visible gallery, never to a hidden or closed dialog. */
const frames = new WeakMap<HTMLIFrameElement, string>();
const playerSelector = 'video, audio, iframe[src*="youtube-nocookie.com/embed/"], iframe[src*="player.vimeo.com/video/"], iframe[data-gallery-player]';
function stopPlayer(player: Element) {
  if (player instanceof HTMLMediaElement) player.pause();
  else if (player instanceof HTMLIFrameElement) {
    const source = player.getAttribute('src');
    if (source) { frames.set(player, source); player.dataset.galleryPlayer = 'true'; player.removeAttribute('src'); }
  }
}
export function stopMediaWithin(root: ParentNode) {
  root.querySelectorAll(playerSelector).forEach(stopPlayer);
}
function visibleContext(player: Element) {
  if (!player.isConnected || document.hidden || player.closest('[hidden]')) return false;
  const dialog = player.closest('dialog');
  return (!dialog || dialog.open) && ![...document.querySelectorAll('dialog[open]')].some(open => open !== dialog && open.classList.contains('photo-lightbox'));
}
export function installMediaPlayback() {
  const tracked = new Set<Element>();
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      const player = entry.target;
      if (!entry.isIntersecting || !visibleContext(player)) stopPlayer(player);
      else if (player instanceof HTMLIFrameElement && !player.getAttribute('src')) {
        const source = frames.get(player); if (source) player.setAttribute('src', source);
      }
    }
  }, { threshold: 0 });
  const scan = () => {
    for (const player of tracked) {
      if (!visibleContext(player)) stopPlayer(player);
      if (!player.isConnected) { observer.unobserve(player); tracked.delete(player); }
    }
    document.querySelectorAll(playerSelector).forEach(player => {
      if (!tracked.has(player)) { tracked.add(player); observer.observe(player); }
    });
  };
  new MutationObserver(scan).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['open', 'hidden'] });
  document.addEventListener('play', event => {
    const player = event.target;
    if (!(player instanceof HTMLMediaElement)) return;
    if (!visibleContext(player)) { player.pause(); return; }
    for (const other of tracked) if (other !== player) {
      stopPlayer(other);
      // Reload a visible external embed in its paused initial state so its
      // controls remain usable after switching back from a native video.
      if(other instanceof HTMLIFrameElement&&visibleContext(other)) {
        const source=frames.get(other);if(source)other.setAttribute('src',source);
      }
    }
  }, true);
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopMediaWithin(document); });
  window.addEventListener('pagehide', () => stopMediaWithin(document));
  document.addEventListener('close', event => { if (event.target instanceof HTMLDialogElement) stopMediaWithin(event.target); }, true);
  document.addEventListener('cancel', event => { if (event.target instanceof HTMLDialogElement) stopMediaWithin(event.target); }, true);
  scan();
}
