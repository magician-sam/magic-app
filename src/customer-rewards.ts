import { h, copy, t } from './customer-i18n.js';

/** Keep discovery compact; reward terms stay one tap away. */
export function mountHeaderRewards(root: HTMLElement, open: () => void, signal: AbortSignal) {
  root.querySelector('#rewards')?.remove();
  const header = root.querySelector('.site-header');
  if (!header) return;
  const menu = header.querySelector('.mobile-menu-toggle');
  menu?.setAttribute('aria-label', t('Explore'));
  menu?.setAttribute('data-customer-aria-label', 'Explore');
  const button = document.createElement('button');
  button.type = 'button';
  button.id = 'rewards';
  button.className = 'header-rewards';
  button.setAttribute('aria-haspopup', 'dialog');
  button.setAttribute('aria-label', t('Invite friends. Earn a free magic show.'));
  button.setAttribute('data-customer-aria-label', 'Invite friends. Earn a free magic show.');
  button.innerHTML = h('<span class="rewards-gift" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11h16v10H4zM3 7h18v4H3zM12 7v14M12 7H8a3 3 0 1 1 3-3l1 3Zm0 0h4a3 3 0 1 0-3-3l-1 3Z"/></svg></span><span class="rewards-header-label">Earn a free show</span><span class="rewards-phone-label">Free show</span>');
  const search = header.querySelector('.header-search-toggle');
  if (search) search.after(button);
  else header.append(button);
  button.addEventListener('click', open, { signal });
  root.addEventListener('click', event => {
    if (!(event.target instanceof Element)) return;
    const link = event.target.closest<HTMLAnchorElement>('a[href="#rewards"]');
    if (!link) return;
    event.preventDefault();
    if (link.closest('.mobile-site-menu')) root.querySelector<HTMLButtonElement>('.mobile-menu-close')?.click();
    open();
  }, { signal });
  window.addEventListener('hashchange', () => { if (location.hash === '#rewards') open(); }, { signal });
  if (location.hash === '#rewards') open();
}

export function rewardsDialogContent() {
  return h`<div class="rewards-details"><div class="rewards-prize"><span aria-hidden="true">✦</span><strong>${copy('5 tokens = a free magic show')}</strong></div><ol class="rewards-steps"><li><strong>Share your invitation link</strong><p>Invite friends to discover the shows.</p></li><li><strong>Celebrate. Collect a token.</strong><p>When a friend completes a fully paid Magic, Science or Bubbles show, collect a token.</p></li><li><strong>Choose your reward</strong><p>Use tokens for a discount or save five for a free magic show.</p></li></ol><div class="rewards-options" aria-label="Token rewards">${[1, 2, 3, 4, 5].map(count => h`<div><span>${count} <span aria-hidden="true">✦</span></span><strong>${count === 5 ? copy('Free magic show') : `${count * 10}%`}</strong></div>`).join('')}</div><button type="button" id="referral-account">Get my invitation link ↗</button><small>Your invitation link and earned tokens are in My account.</small></div>`;
}
