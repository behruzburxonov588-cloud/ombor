// Umumiy yordamchilar: so'rovlar, formatlash, modal, xabarlar, ikonkalar

// Lucide ikonkalari (ISC litsenziyasi) — https://lucide.dev
export const ICONS = {
  home: '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  dashboard: '<rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>',
  cart: '<path d="m2.05 2.05 1.099-.028a1 1 0 0 1 1.008.815l2.69 14.347A1 1 0 0 0 7.83 18H18"/><path d="M4.563 5h16.435a1 1 0 0 1 .981 1.204l-1.026 6.226A2 2 0 0 1 18.962 14H6.25"/><circle cx="18" cy="20" r="2"/><circle cx="8" cy="20" r="2"/>',
  box: '<path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z"/><path d="M12 22V12"/><polyline points="3.29 7 12 12 20.71 7"/><path d="m7.5 4.27 9 5.15"/>',
  layers: '<path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z"/><path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12"/><path d="M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17"/>',
  truck: '<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><path d="M16 3.128a4 4 0 0 1 0 7.744"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><circle cx="9" cy="7" r="4"/>',
  wallet: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
  chart: '<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="m19 9-5 5-4-4-3 3"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  gear: '<path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"/><circle cx="12" cy="12" r="3"/>',
  menu: '<path d="M4 5h16"/><path d="M4 12h16"/><path d="M4 19h16"/>',
  search: '<path d="m21 21-4.34-4.34"/><circle cx="11" cy="11" r="8"/>',
  scan: '<path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M8 7v10"/><path d="M12 7v10"/><path d="M17 7v10"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  minus: '<path d="M5 12h14"/>',
  logout: '<path d="m16 17 5-5-5-5"/><path d="M21 12H9"/><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>',
  back: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
  edit: '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>',
  archive: '<rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/>',
  restore: '<rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h2"/><path d="M20 8v11a2 2 0 0 1-2 2h-2"/><path d="m9 15 3-3 3 3"/><path d="M12 12v9"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  receipt: '<path d="M12 17V7"/><path d="M16 8h-6a2 2 0 0 0 0 4h4a2 2 0 0 1 0 4H8"/><path d="M4 3a1 1 0 0 1 1-1 1.3 1.3 0 0 1 .7.2l.933.6a1.3 1.3 0 0 0 1.4 0l.934-.6a1.3 1.3 0 0 1 1.4 0l.933.6a1.3 1.3 0 0 0 1.4 0l.933-.6a1.3 1.3 0 0 1 1.4 0l.934.6a1.3 1.3 0 0 0 1.4 0l.933-.6A1.3 1.3 0 0 1 19 2a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1 1.3 1.3 0 0 1-.7-.2l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.934.6a1.3 1.3 0 0 1-1.4 0l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-1.4 0l-.934-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-.7.2 1 1 0 0 1-1-1z"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" x2="15.42" y1="13.51" y2="17.49"/><line x1="15.41" x2="8.59" y1="6.51" y2="10.49"/>',
  print: '<path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6"/><rect x="6" y="14" width="12" height="8" rx="1"/>',
  camera: '<path d="M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4z"/><circle cx="12" cy="13" r="3"/>',
  money: '<rect width="20" height="12" x="2" y="6" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/>',
  card: '<rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/><path d="M6 14h2"/>',
  transfer: '<path d="M8 3 4 7l4 4"/><path d="M4 7h16"/><path d="m16 21 4-4-4-4"/><path d="M20 17H4"/>',
  credit: '<path d="M11 15h2a2 2 0 1 0 0-4h-3c-.6 0-1.1.2-1.4.6L3 17"/><path d="m7 21 1.6-1.4c.3-.4.8-.6 1.4-.6h4c1.1 0 2.1-.4 2.8-1.2l4.6-4.4a2 2 0 0 0-2.75-2.91l-4.2 3.9"/><path d="m2 16 6 6"/><circle cx="16" cy="9" r="2.9"/><circle cx="6" cy="5" r="3"/>',
  split: '<path d="M16 3h5v5"/><path d="M8 3H3v5"/><path d="M12 22v-8.3a4 4 0 0 0-1.172-2.872L3 3"/><path d="m15 9 6-6"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  bell: '<path d="M10.268 21a2 2 0 0 0 3.464 0"/><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"/>',
  sparkles: '<path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"/><path d="M20 2v4"/><path d="M22 4h-4"/><circle cx="4" cy="20" r="2"/>',
  xlsx: '<path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="M8 13h2"/><path d="M14 13h2"/><path d="M8 17h2"/><path d="M14 17h2"/>',
  pdf: '<path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
  download: '<path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/>',
  arrowUpRight: '<path d="M7 7h10v10"/><path d="M7 17 17 7"/>',
  trendUp: '<path d="M16 7h6v6"/><path d="m22 7-8.5 8.5-5-5L2 17"/>',
  trendDown: '<path d="M16 17h6v-6"/><path d="m22 17-8.5-8.5-5 5L2 7"/>',
  up: '<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>',
  down: '<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>',
  right: '<path d="m9 18 6-6-6-6"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  calendar: '<path d="M8 2v3"/><path d="M16 2v3"/><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  bulb: '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/>',
  user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  userCog: '<path d="M10 15H6a4 4 0 0 0-4 4v2"/><path d="m14.305 16.53.923-.382"/><path d="m15.228 13.852-.923-.383"/><path d="m16.852 12.228-.383-.923"/><path d="m16.852 17.772-.383.924"/><path d="m19.148 12.228.383-.923"/><path d="m19.53 18.696-.382-.924"/><path d="m20.772 13.852.924-.383"/><path d="m20.772 16.148.924.383"/><circle cx="18" cy="15" r="3"/><circle cx="9" cy="7" r="4"/>',
  audit: '<rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>',
  expense: '<path d="M13 16H8"/><path d="M14 8H8"/><path d="M16 12H8"/><path d="M4 3a1 1 0 0 1 1-1 1.3 1.3 0 0 1 .7.2l.933.6a1.3 1.3 0 0 0 1.4 0l.934-.6a1.3 1.3 0 0 1 1.4 0l.933.6a1.3 1.3 0 0 0 1.4 0l.933-.6a1.3 1.3 0 0 1 1.4 0l.934.6a1.3 1.3 0 0 0 1.4 0l.933-.6A1.3 1.3 0 0 1 19 2a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1 1.3 1.3 0 0 1-.7-.2l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.934.6a1.3 1.3 0 0 1-1.4 0l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-1.4 0l-.934-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-.7.2 1 1 0 0 1-1-1z"/>',
  debt: '<path d="M11 15h2a2 2 0 1 0 0-4h-3c-.6 0-1.1.2-1.4.6L3 17"/><path d="m7 21 1.6-1.4c.3-.4.8-.6 1.4-.6h4c1.1 0 2.1-.4 2.8-1.2l4.6-4.4a2 2 0 0 0-2.75-2.91l-4.2 3.9"/><path d="m2 16 6 6"/><circle cx="16" cy="9" r="2.9"/><circle cx="6" cy="5" r="3"/>',
  store: '<path d="M15 21v-5a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v5"/><path d="M17.774 10.31a1.12 1.12 0 0 0-1.549 0 2.5 2.5 0 0 1-3.451 0 1.12 1.12 0 0 0-1.548 0 2.5 2.5 0 0 1-3.452 0 1.12 1.12 0 0 0-1.549 0 2.5 2.5 0 0 1-3.77-3.248l2.889-4.184A2 2 0 0 1 7 2h10a2 2 0 0 1 1.653.873l2.895 4.192a2.5 2.5 0 0 1-3.774 3.244"/><path d="M4 10.95V19a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8.05"/>',
  staff: '<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="M7 16h8"/><path d="M7 11h12"/><path d="M7 6h3"/>',
  send: '<path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"/><path d="m21.854 2.147-10.94 10.939"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  ok: '<circle cx="12" cy="12" r="10"/><path d="m16 9-5.5 5.5L8 12"/>',
  warnCircle: '<circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/>',
  critical: '<path d="M12 16h.01"/><path d="M12 8v4"/><path d="M15.312 2a2 2 0 0 1 1.414.586l4.688 4.688A2 2 0 0 1 22 8.688v6.624a2 2 0 0 1-.586 1.414l-4.688 4.688a2 2 0 0 1-1.414.586H8.688a2 2 0 0 1-1.414-.586l-4.688-4.688A2 2 0 0 1 2 15.312V8.688a2 2 0 0 1 .586-1.414l4.688-4.688A2 2 0 0 1 8.688 2z"/>',
  bellRing: '<path d="M10.268 21a2 2 0 0 0 3.464 0"/><path d="M22 8c0-2.3-.8-4.3-2-6"/><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"/><path d="M4 2C2.8 3.7 2 5.7 2 8"/>',
  filter: '<path d="M2 5h20"/><path d="M6 12h12"/><path d="M9 19h6"/>',
  sort: '<path d="m3 16 4 4 4-4"/><path d="M7 20V4"/><path d="m21 8-4-4-4 4"/><path d="M17 4v16"/>',
  history: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',
  boxes: '<path d="M2.97 12.92A2 2 0 0 0 2 14.63v3.24a2 2 0 0 0 .97 1.71l3 1.8a2 2 0 0 0 2.06 0L12 19v-5.5l-5-3-4.03 2.42Z"/><path d="m7 16.5-4.74-2.85"/><path d="m7 16.5 5-3"/><path d="M7 16.5v5.17"/><path d="M12 13.5V19l3.97 2.38a2 2 0 0 0 2.06 0l3-1.8a2 2 0 0 0 .97-1.71v-3.24a2 2 0 0 0-.97-1.71L17 10.5l-5 3Z"/><path d="m17 16.5-5-3"/><path d="m17 16.5 4.74-2.85"/><path d="M17 16.5v5.17"/><path d="M7.97 4.42A2 2 0 0 0 7 6.13v4.37l5 3 5-3V6.13a2 2 0 0 0-.97-1.71l-3-1.8a2 2 0 0 0-2.06 0l-3 1.8Z"/><path d="M12 8 7.26 5.15"/><path d="m12 8 4.74-2.85"/><path d="M12 13.5V8"/>',
  warehouse: '<path d="M18 21V10a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1v11"/><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 1.132-1.803l7.95-3.974a2 2 0 0 1 1.837 0l7.948 3.974A2 2 0 0 1 22 8z"/><path d="M6 13h12"/><path d="M6 17h12"/>',
  coins: '<path d="M13.744 17.736a6 6 0 1 1-7.48-7.48"/><path d="M15 6h1v4"/><path d="m6.134 14.768.866-.5 2 3.464"/><circle cx="16" cy="8" r="6"/>',
  target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  award: '<path d="m15.477 12.89 1.515 8.526a.5.5 0 0 1-.81.47l-3.58-2.687a1 1 0 0 0-1.197 0l-3.586 2.686a.5.5 0 0 1-.81-.469l1.514-8.526"/><circle cx="12" cy="8" r="6"/>',
  gauge: '<path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/>',
  sliders: '<path d="M10 5H3"/><path d="M12 19H3"/><path d="M14 3v4"/><path d="M16 17v4"/><path d="M21 12h-9"/><path d="M21 19h-5"/><path d="M21 5h-7"/><path d="M8 10v4"/><path d="M8 12H3"/>',
  eye: '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>',
  table: '<path d="M3 9h18"/><path d="M9 3v18"/><rect x="3" y="3" width="18" height="18" rx="2"/>',
  shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
  moon: '<path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401"/>',
  flame: '<path d="M12 3q1 4 4 6.5t3 5.5a1 1 0 0 1-14 0 5 5 0 0 1 1-3 1 1 0 0 0 5 0c0-2-1.5-3-1.5-5q0-2 2.5-4"/>',
  snail: '<path d="M2 13a6 6 0 1 0 12 0 4 4 0 1 0-8 0 2 2 0 0 0 4 0"/><circle cx="10" cy="13" r="8"/><path d="M2 21h12c4.4 0 8-3.6 8-8V7a2 2 0 1 0-4 0v6"/><path d="M18 3 19.1 5.2"/><path d="M22 3 20.9 5.2"/>',
  key: '<path d="M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z"/><circle cx="16.5" cy="7.5" r=".5" fill="currentColor"/>',
  list: '<path d="M3 5h.01"/><path d="M3 12h.01"/><path d="M3 19h.01"/><path d="M8 5h13"/><path d="M8 12h13"/><path d="M8 19h13"/>',
  phone: '<path d="M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384"/>',
  external: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  more: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
  lock: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  flat: '<path d="M5 12h14"/>',
  target2: '<circle cx="12" cy="12" r="10"/><line x1="22" x2="18" y1="12" y2="12"/><line x1="6" x2="2" y1="12" y2="12"/><line x1="12" x2="12" y1="6" y2="2"/><line x1="12" x2="12" y1="22" y2="18"/>',
  percent: '<line x1="19" x2="5" y1="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>',
  calc: '<rect width="16" height="20" x="4" y="2" rx="2"/><line x1="8" x2="16" y1="6" y2="6"/><line x1="16" x2="16" y1="14" y2="18"/><path d="M16 10h.01"/><path d="M12 10h.01"/><path d="M8 10h.01"/><path d="M12 14h.01"/><path d="M8 14h.01"/><path d="M12 18h.01"/><path d="M8 18h.01"/>',

  rocket: '<path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>',
  help: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
  image: '<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
};

export function icon(name, cls = 'ico') {
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}

export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ---------- Formatlash ----------

export function num(value, max = 2) {
  const n = Number(value || 0);
  // O'zbekcha yozuv: minglar bo'sh joy bilan, kasr vergul bilan (1 234,5)
  return n.toLocaleString('en-US', { maximumFractionDigits: max, minimumFractionDigits: 0 }).replace(/,/g, ' ').replace('.', ',');
}

export function money(value, { sign = false } = {}) {
  const n = Number(value || 0);
  // So'mda tiyin amalda ishlatilmaydi: 100 so'mdan katta summalar butun ko'rsatiladi
  const text = `${num(Math.abs(n), Math.abs(n) >= 100 ? 0 : 2)} so'm`;
  if (sign && n > 0) return `+${text}`;
  if (n < 0) return `-${text}`;
  return text;
}

export function qty(value) {
  return num(value, 4);
}

// YYYY-MM-DD -> DD.MM.YYYY
export function dateOnly(s) {
  if (!s) return '';
  const [y, m, d] = String(s).slice(0, 10).split('-');
  return `${d}.${m}.${y}`;
}

// ISO vaqt -> DD.MM.YYYY HH:MM (Toshkent vaqti)
export function dateTime(iso) {
  if (!iso) return '';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Tashkent', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date(iso));
  const get = (t) => parts.find((p) => p.type === t)?.value || '';
  return `${get('day')}.${get('month')}.${get('year')} ${get('hour')}:${get('minute')}`;
}

export function todayStr() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export function addDaysStr(s, days) {
  const d = new Date(`${s}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function monthStartStr(s = todayStr()) {
  return `${s.slice(0, 8)}01`;
}

// ---------- So'rovlar ----------

let unauthorizedHandler = () => {};
export function onUnauthorized(fn) {
  unauthorizedHandler = fn;
}

export async function api(method, path, body) {
  const opts = { method, headers: {}, credentials: 'same-origin' };
  if (body instanceof FormData) {
    opts.body = body;
  } else {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body === undefined ? {} : body);
    if (method === 'GET' || method === 'HEAD') delete opts.body;
  }
  let res;
  try {
    res = await fetch(`/api${path}`, opts);
  } catch {
    throw new Error("Internet yoki server bilan aloqa yo'q. Qayta urinib ko'ring");
  }
  const type = res.headers.get('content-type') || '';
  const data = type.includes('application/json') ? await res.json() : null;
  if (res.status === 401 && !path.startsWith('/auth/login')) {
    unauthorizedHandler();
  }
  if (!res.ok) {
    const err = new Error(data?.error || `Xatolik (${res.status})`);
    err.status = res.status;
    err.details = data?.details;
    throw err;
  }
  return data;
}

export const get = (p) => api('GET', p);
export const post = (p, b) => api('POST', p, b ?? {});
export const put = (p, b) => api('PUT', p, b ?? {});

// Forma maydonlarini obyektga aylantiradi. data-type="num" bo'lsa raqamga o'giradi.
export function readForm(form) {
  const out = {};
  for (const el of form.querySelectorAll('[name]')) {
    if (el.disabled) continue;
    let value;
    if (el.type === 'checkbox') value = el.checked;
    else value = el.value;
    if (typeof value === 'string') value = value.trim();
    if (el.dataset.type === 'num') value = value === '' ? null : Number(String(value).replace(',', '.'));
    if (el.dataset.type === 'nullable' && value === '') value = null;
    out[el.name] = value;
  }
  return out;
}

// ---------- Xabarlar ----------

export function toast(message, kind = '') {
  const root = document.getElementById('toast-root');
  const el = document.createElement('div');
  el.className = `toast ${kind}`.trim();
  el.textContent = message;
  root.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

export function errorToast(err) {
  toast(err?.message || 'Xatolik yuz berdi', 'bad');
}

// ---------- Modal ----------

export function openModal({ title, body = '', foot = '', wide = false, onMount, onClose } = {}) {
  const root = document.getElementById('modal-root');
  root.innerHTML = `
    <div class="modal-backdrop" data-backdrop>
      <div class="modal${wide ? ' wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title || '')}">
        <div class="modal-head">
          <h3>${esc(title || '')}</h3>
          <button class="icon-btn" type="button" data-close aria-label="Yopish">${icon('x', 'ico')}</button>
        </div>
        <div class="modal-body">${body}</div>
        ${foot ? `<div class="modal-foot">${foot}</div>` : ''}
      </div>
    </div>`;
  const backdrop = root.querySelector('[data-backdrop]');
  const close = () => {
    if (!root.firstElementChild) return;
    root.innerHTML = '';
    document.removeEventListener('keydown', onKey);
    if (onClose) onClose();
  };
  const onKey = (e) => {
    if (e.key === 'Escape') close();
  };
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });
  root.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
  document.addEventListener('keydown', onKey);
  const modalEl = root.querySelector('.modal');
  if (onMount) onMount(modalEl, close);
  return { close, el: modalEl };
}

export function closeModal() {
  document.getElementById('modal-root').innerHTML = '';
}

export function confirmBox(message, { okText = 'Ha, davom etish', danger = false } = {}) {
  return new Promise((resolve) => {
    const { close, el } = openModal({
      title: 'Tasdiqlash',
      body: `<p style="font-size:16px">${esc(message)}</p>`,
      foot: `<button class="btn btn-outline" type="button" data-no>Bekor qilish</button>
             <button class="btn ${danger ? 'btn-danger' : ''}" type="button" data-yes>${esc(okText)}</button>`,
    });
    el.querySelector('[data-no]').addEventListener('click', () => { close(); resolve(false); });
    el.querySelector('[data-yes]').addEventListener('click', () => { close(); resolve(true); });
  });
}

// Yuklash holatida tugmani bloklash (ikki marta bosishdan himoya)
export async function withBusy(button, fn) {
  if (button.dataset.busy === '1') return undefined;
  button.dataset.busy = '1';
  const original = button.innerHTML;
  button.disabled = true;
  button.innerHTML = `<span class="spinner">...</span>`;
  try {
    return await fn();
  } finally {
    button.dataset.busy = '';
    button.disabled = false;
    button.innerHTML = original;
  }
}

export function statusBadge(status) {
  if (status === 'out') return '<span class="badge badge-out">Tugagan</span>';
  if (status === 'low') return '<span class="badge badge-low">Kam qolgan</span>';
  return '<span class="badge badge-ok">Yetarli</span>';
}

// Rasmni yuborishdan oldin kichraytiradi: telefon rasmi (4–8 MB) → ~1024 px JPEG (~100–300 KB).
// Shunda har qanday rasm yuklanadi, tez ochiladi va bazada joy tejaladi.
export async function compressImage(file, { max = 1024, quality = 0.8 } = {}) {
  if (!file) return null;
  if (file.type && !file.type.startsWith('image/')) throw new Error('Rasm faylini tanlang (JPG, PNG)');
  let src;
  let url = null;
  try {
    src = await createImageBitmap(file);
  } catch {
    url = URL.createObjectURL(file);
    src = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Bu rasmni ochib bo'lmadi. Boshqa rasm tanlang (JPG yoki PNG)"));
      img.src = url;
    });
  }
  const w = src.width || src.naturalWidth;
  const h = src.height || src.naturalHeight;
  const scale = Math.min(1, max / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const g = canvas.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.drawImage(src, 0, 0, canvas.width, canvas.height);
  if (url) URL.revokeObjectURL(url);
  if (src.close) src.close();
  const blob = await new Promise((resolve) => { canvas.toBlob(resolve, 'image/jpeg', quality); });
  if (!blob) throw new Error("Rasmni tayyorlab bo'lmadi. Boshqa rasm tanlang");
  return new File([blob], 'rasm.jpg', { type: 'image/jpeg' });
}

// Mahsulot rasmini yuklash (kichraytirib)
export async function uploadProductImage(productId, file) {
  const small = await compressImage(file);
  const fd = new FormData();
  fd.append('image', small);
  return api('POST', `/products/${productId}/image`, fd);
}

export function productThumb(p, big = false) {
  const cls = big ? 'thumb thumb-lg' : 'thumb';
  if (p.image_path) return `<div class="${cls}"><img src="${esc(p.image_path)}" alt=""></div>`;
  const letter = esc((p.name || '?').trim().charAt(0).toUpperCase());
  return `<div class="${cls}" aria-hidden="true">${letter}</div>`;
}

// Takroriy yuborishdan himoya uchun noyob kalit (server bir xil kalitni ikkinchi marta yozmaydi)
export function newKey(prefix = 'op') {
  const rand = globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  return `${prefix}-${rand}`;
}

// "+ Qo'shish" menyusidan kelgan ?new=1 belgisini bir marta o'qiydi va manzildan olib tashlaydi
// (sahifa yangilansa, oyna qayta ochilmasligi uchun)
export function takeNewFlag(params) {
  if (params?.query?.new !== '1') return false;
  delete params.query.new;
  const [path, qs = ''] = location.hash.split('?');
  const q = new URLSearchParams(qs);
  q.delete('new');
  const rest = q.toString();
  history.replaceState(null, '', `${path}${rest ? `?${rest}` : ''}`);
  return true;
}

export function emptyState(text, iconName = 'box') {
  return `<div class="empty">${icon(iconName)}<div>${esc(text)}</div></div>`;
}

// ---------- Tahlil uchun formatlash ----------

// Ixcham pul: 1 250 000 -> "1,25 mln"; 350 000 -> "350 ming"
export function compact(value, { unit = false } = {}) {
  const n = Number(value || 0);
  const a = Math.abs(n);
  const sign = n < 0 ? '−' : '';
  const fmt = (x, d) => {
    let t = x.toFixed(d);
    if (t.includes('.')) t = t.replace(/0+$/, '').replace(/\.$/, '');
    return t.replace('.', ',');
  };
  let s;
  if (a >= 1e9) s = `${fmt(a / 1e9, 2)} mlrd`;
  else if (a >= 1e6) s = `${fmt(a / 1e6, a >= 1e8 ? 0 : a >= 1e7 ? 1 : 2)} mln`;
  else if (a >= 1e4) s = `${fmt(a / 1e3, 0)} ming`;
  else s = num(a, 0);
  return `${sign}${s}${unit ? " so'm" : ''}`;
}

// Katta raqam: to'liq, bo'shliq bilan, tiyinlarsiz
export function moneyFull(value) {
  const n = Math.round(Number(value || 0));
  return `${n < 0 ? '−' : ''}${num(Math.abs(n), 0)}`;
}

export function pctText(v, digits = 1) {
  if (v === null || v === undefined || !Number.isFinite(Number(v))) return '—';
  const n = Number(v);
  return `${n.toFixed(digits).replace('.', ',')}%`;
}

// O'zgarish belgisi. goodWhenUp=false bo'lsa (xarajat), o'sish qizil ko'rsatiladi
// Farqni foiz o'rniga oddiy son bilan ko'rsatadi: "↑ 675 ming" yoki "↓ 3 ta"
export function deltaAmount(cur, prev, { goodWhenUp = true, unit = 'money', title = '' } = {}) {
  const c = Number(cur || 0);
  const p = Number(prev || 0);
  const diff = c - p;
  const base = Math.max(Math.abs(p), Math.abs(c));
  if (base === 0 || Math.abs(diff) < base * 0.005) {
    return `<span class="delta flat" title="${esc(title)}">${icon('flat', 'ico-xs')}o'zgarmadi</span>`;
  }
  const up = diff > 0;
  const good = up === goodWhenUp;
  const amount = unit === 'money' ? compact(Math.abs(diff)) : `${num(Math.abs(diff), 0)} ${unit}`;
  return `<span class="delta ${good ? 'up' : 'down'}" title="${esc(title)}">${icon(up ? 'up' : 'down', 'ico-xs')}${amount}</span>`;
}

export function deltaPill(change, { goodWhenUp = true, title = '' } = {}) {
  if (change === null || change === undefined) {
    return `<span class="delta flat" title="${esc(title || "Oldingi davrda ma'lumot yo'q")}">yangi</span>`;
  }
  const n = Number(change);
  if (Math.abs(n) < 0.05) return `<span class="delta flat" title="${esc(title)}">${icon('flat', 'ico-xs')}0%</span>`;
  const up = n > 0;
  const good = up === goodWhenUp;
  const v = Math.abs(n) >= 100 ? Math.round(Math.abs(n)) : Math.abs(n).toFixed(1).replace('.', ',');
  return `<span class="delta ${good ? 'up' : 'down'}" title="${esc(title)}">${icon(up ? 'up' : 'down', 'ico-xs')}${v}%</span>`;
}

export function initials(name) {
  return String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w.charAt(0).toUpperCase()).join('') || '?';
}

export function debounce(fn, ms = 250) {
  let t = null;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

// Nisbiy vaqt: "5 daqiqa oldin"
export function timeAgo(iso) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'hozirgina';
  if (diff < 3600) return `${Math.floor(diff / 60)} daqiqa oldin`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} soat oldin`;
  if (diff < 172800) return 'kecha';
  if (diff < 604800) return `${Math.floor(diff / 86400)} kun oldin`;
  return dateOnly(new Date(iso).toISOString());
}

// Faylni yuklab olish (Excel / PDF): sessiya cookie bilan, xatolar foydalanuvchiga tushunarli
export async function download(path, fallbackName = 'hisobot') {
  let res;
  try {
    res = await fetch(`/api${path}`, { credentials: 'same-origin' });
  } catch {
    throw new Error("Internet yoki server bilan aloqa yo'q. Qayta urinib ko'ring");
  }
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error || `Xatolik (${res.status})`);
  }
  const blob = await res.blob();
  const cd = res.headers.get('content-disposition') || '';
  const name = (cd.match(/filename="([^"]+)"/) || [])[1] || fallbackName;
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// Tugma ostida ochiladigan kichik oyna (menyu, bildirishnomalar)
let activePopover = null;
export function closePopover() {
  if (activePopover) {
    activePopover.cleanup();
    activePopover = null;
  }
}
export function openPopover(anchor, html, { className = '', align = 'right', onMount } = {}) {
  closePopover();
  const el = document.createElement('div');
  el.className = `popover ${className}`.trim();
  el.innerHTML = html;
  document.body.appendChild(el);
  const place = () => {
    const r = anchor.getBoundingClientRect();
    const w = el.offsetWidth;
    let left = align === 'right' ? r.right - w : r.left;
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
    let top = r.bottom + 6;
    if (top + el.offsetHeight > window.innerHeight - 8 && r.top - el.offsetHeight - 6 > 8) top = r.top - el.offsetHeight - 6;
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  };
  place();
  const onDoc = (e) => {
    if (!el.contains(e.target) && !anchor.contains(e.target)) closePopover();
  };
  const onKey = (e) => {
    if (e.key === 'Escape') {
      closePopover();
      anchor.focus();
    }
  };
  setTimeout(() => document.addEventListener('pointerdown', onDoc), 0);
  document.addEventListener('keydown', onKey);
  window.addEventListener('resize', place);
  activePopover = {
    el,
    cleanup() {
      document.removeEventListener('pointerdown', onDoc);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', place);
      el.remove();
    },
  };
  if (onMount) onMount(el, closePopover);
  return el;
}

// Davr tanlash (bosh sahifa va hisobotlar uchun umumiy)
export const RANGE_PRESETS = [
  { key: 'today', label: 'Bugun', days: 1 },
  { key: '7d', label: '7 kun', days: 7 },
  { key: '30d', label: '30 kun', days: 30 },
  { key: '90d', label: '90 kun', days: 90 },
];
export function presetRange(key) {
  const today = todayStr();
  const p = RANGE_PRESETS.find((x) => x.key === key) || RANGE_PRESETS[0];
  return { from: addDaysStr(today, -(p.days - 1)), to: today };
}
export function rangeLabel(from, to) {
  if (from === to) return from === todayStr() ? 'bugun' : dateOnly(from);
  return `${dateOnly(from)} – ${dateOnly(to)}`;
}

const WEEKDAYS = ['Yakshanba', 'Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba'];
const MONTHS = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'];
export const monthName = (m) => MONTHS[Number(m) - 1];
// "Seshanba, 17-noyabr 2026"
export function longDate(s = todayStr(), { weekday = true } = {}) {
  const d = new Date(`${s}T00:00:00Z`);
  const text = `${d.getUTCDate()}-${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  return weekday ? `${WEEKDAYS[d.getUTCDay()]}, ${text}` : text;
}
// "17-noy"
export function shortDate(s) {
  const d = new Date(`${String(s).slice(0, 10)}T00:00:00Z`);
  return `${d.getUTCDate()}-${MONTHS[d.getUTCMonth()].slice(0, 3)}`;
}
export function weekdayShort(s) {
  return ['Ya', 'Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh'][new Date(`${String(s).slice(0, 10)}T00:00:00Z`).getUTCDay()];
}
// KPI qiymati: katta summalar ixcham, kichiklari to'liq
export function kpiMoney(v) {
  const n = Number(v || 0);
  if (Math.abs(n) >= 1e6) return `${compact(n)}<span class="cur">so'm</span>`;
  return `${moneyFull(n)}<span class="cur">so'm</span>`;
}
