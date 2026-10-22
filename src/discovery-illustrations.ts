// Original decorative vectors. No external icon font, image request or licence dependency.
const symbols:Record<string,string>={
 places:'<path d="M3 21V10l5-5 5 5v11M2 10h12M6 21v-6h4v6M15 7h4v4c0 5 1 7 4 10h-7c-2-3-3-5-3-8"/><path d="M4 4h3M5.5 2.5v3"/>',
 teams:'<rect x="5" y="4" width="14" height="18" rx="2"/><path d="M9 4V2h6v2M9 8h6M9 18h6"/><circle cx="10" cy="12" r="1.8"/><path d="M7.5 16a2.5 2.5 0 0 1 5 0M15 11l1 1 2-2"/>',
 shows:'<path d="M2 3h20v18H2zM2 4c0 6 4 8 7 9L2 18M22 4c0 6-4 8-7 9l7 5M2 19h20"/><path d="m11 9 1-3 1 3 3 1-3 1-1 3-1-3-3-1z"/>',
 offers:'<path d="M3 3h9l10 10-9 9L3 12V3Z"/><circle cx="7" cy="7" r="1"/><path d="m10 16 6-6"/><circle cx="11" cy="10.5" r="1"/><circle cx="15.5" cy="15" r="1"/>',
 styling:'<circle cx="12" cy="7" r="2"/><path d="M10 5C5 0 3 8 8 9c-3 5 4 7 5 2 5 2 8-4 3-6 1-5-6-5-6 0ZM12 12v5M12 17c-4 0-6-2-6-4 3 0 5 1 6 4Zm0-1c2-3 4-3 6-3-1 3-3 4-6 4M8 18h8l-1 4H9Z"/>',
 capture:'<rect x="2" y="7" width="14" height="13" rx="2"/><path d="m5 7 2-3h5l2 3M18 10l4-3v13l-4-3"/><circle cx="9" cy="13" r="3"/>',
 music:'<rect x="8" y="2" width="7" height="12" rx="3.5"/><path d="M5 9v2a6.5 6.5 0 0 0 13 0V9M11.5 18v4M8 22h7M10 6h3M10 9h3M20 3v4m-1-2h2"/>',
 food:'<path d="M3 12h18v9H3ZM2 16h20M6 12V8h12v4M6 8c2-3 4-3 6 0 2-3 4-3 6 0M12 2v3M8 3v2M16 3v2"/>',
 inflatables:'<path d="M2 22V7h5v5h10V7h5v15H2ZM2 7l2.5-4L7 7m10 0 2.5-4L22 7M7 16h10v6H7ZM4.5 3V1m15 2V1M2 13h5m10 0h5"/>',
 'food-stations':'<path d="m5 9 2 13h10l2-13H5ZM8 10l1 10m3-10v10m4-10-1 10"/><path d="M5 9C1 6 4 2 7 5c0-5 6-5 6-1 4-3 7 1 5 3 3 0 3 3 1 3M8 5c2-1 4 0 4 2m3-2 1 2"/>',
 schools:'<path d="m2 8 10-5 10 5-10 5-10-5ZM6 10v6c4 3 8 3 12 0v-6M22 8v8M3 21c3-2 6-2 9 0 3-2 6-2 9 0M12 17v5"/>',
};
export function categorySymbol(theme:string){const path=symbols[theme];return path?`<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`:undefined;}

export const occasionScenes:Record<string,{base:string;lines:string}>={
 Birthday:{base:'<path d="M5 12h22v15H5z" fill="#ffb1cd"/><path d="M5 12h22v6H5z" fill="#fff7df"/>',lines:'<path d="M5 12h22v15H5zM4 18h24M9 12V8m7 4V8m7 4V8"/><path d="M9 4v1m7-1v1m7-1v1" stroke="#cf7425" stroke-width="2.5"/>'},
 'School event':{base:'<path d="M16 8C11 4 5 5 3 6v20c4-2 9-1 13 2V8Z" fill="#a9e1bc"/><path d="M16 8c4-3 10-3 13-2v20c-4-2-9-1-13 2V8Z" fill="#fff1ae"/>',lines:'<path d="M16 8C11 4 5 5 3 6v20c4-2 9-1 13 2 4-3 9-4 13-2V6c-2-1-8-2-13 2Zm0 0v20M7 11l5 1M7 16l5 1m8-5 5-1m-5 6 5-1"/>'},
 Festival:{base:'<path d="m16 3 13 13H3L16 3Z" fill="#ffb38b"/><path d="M5 16h22v12H5Z" fill="#ffe7a0"/><path d="m16 3 5 13H11L16 3Z" fill="#fff9ed"/>',lines:'<path d="m16 3 13 13H3L16 3Zm-11 13v12h22V16M12 28V18h8v10M16 3V1m0 0h7l-3 3"/>'},
 'Corporate event':{base:'<rect x="4" y="10" width="24" height="18" rx="3" fill="#a6caff"/><path d="M4 10h24v8H4z" fill="#dfeaff"/>',lines:'<rect x="4" y="10" width="24" height="18" rx="3"/><path d="M11 10V5h10v5M4 17c8 5 16 5 24 0m-12 1v5"/><path d="m26 2 1 2 2 1-2 1-1 2-1-2-2-1 2-1z" fill="#ffce65" stroke="#b67a23"/>'},
 Wedding:{base:'<circle cx="11" cy="20" r="8" fill="#fff2bd"/><circle cx="22" cy="20" r="8" fill="#ffddad" fill-opacity=".8"/>',lines:'<g stroke="#ae6e1f" stroke-width="2"><circle cx="11" cy="20" r="8"/><circle cx="22" cy="20" r="8"/></g><path d="m8 4 3-3 3 3-3 4-3-4Zm11 1 3-3 3 3-3 4-3-4Z" fill="#f5a4b9"/>'},
 Christmas:{base:'<path d="m16 4-8 9h4l-7 8h7l-4 5h16l-4-5h7l-7-8h4L16 4Z" fill="#a8d6a1"/>',lines:'<path d="m16 4-8 9h4l-7 8h7l-4 5h16l-4-5h7l-7-8h4L16 4Zm0 22v4"/><g fill="#ed947d" stroke="#bd6857"><circle cx="14" cy="14" r="1.6"/><circle cx="19" cy="21" r="1.6"/></g><path d="m16 0 1 2 2 1-2 1-1 2-1-2-2-1 2-1Z" fill="#ffe18a" stroke="#b48030"/>'},
 Baptism:{base:'<path d="M5 17c8 0 12-6 12-12 5 3 6 8 4 11l7-1-5 5c-8 8-14 5-18-3Z" fill="#fffdf5"/>',lines:'<path d="M5 17c8 0 12-6 12-12 5 3 6 8 4 11l7-1-5 5c-8 8-14 5-18-3ZM12 19c5 1 8-2 9-3M4 28c3-2 5 2 8 0s5 2 8 0 5 2 8 0"/><circle cx="23" cy="15" r=".6" fill="currentColor"/>'},
 'First Communion':{base:'<path d="M12 13h8v15h-8z" fill="#ffdf9a"/><path d="M16 10c-5-1-4-5 0-9 4 4 5 8 0 9Z" fill="#ffc190"/>',lines:'<path d="M12 13h8v15h-8zM8 28h16M16 10c-5-1-4-5 0-9 4 4 5 8 0 9Zm-4 8h8M6 22c-3-5-3-8-1-10M5 16l-3-2m3 5 3-3M26 22c3-5 3-8 1-10m0 4 3-2m-3 5-3-3"/>'},
};
export function occasionIllustration(key:string){const scene=occasionScenes[key];return scene?`<svg class="occasion-art" aria-hidden="true" viewBox="-5 -5 42 42"><circle cx="16" cy="16" r="19" fill="#fff" fill-opacity=".66"/><g>${scene.base}</g><g fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round">${scene.lines}</g></svg>`:'';}
