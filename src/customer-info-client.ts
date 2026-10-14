import { h, installCustomerLanguageSelector } from './customer-i18n.js';

// These documents contain only source-owned information, never record data.
installCustomerLanguageSelector();
document.body.classList.add('customer-surface');
for (const root of document.querySelectorAll('main, header, footer, a.guide-skip')) root.innerHTML = h(root.innerHTML);

export { setCopy } from './customer-i18n.js';
