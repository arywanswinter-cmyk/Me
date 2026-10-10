// icons.js — every UI icon as an inline SVG on a 48-unit grid: chunky pastel shapes, 3-unit rounded ink outline, one white highlight.
// Exports: icon(name, { fill }) -> svg string, ICON_NAMES.
// Invariants: no text, no strokes under 3 units; ink is #3A2E5C (never black); shapes are original.
const INK = '#3A2E5C';
const S = (body, fill = '#FFD6E8') => `<svg viewBox="0 0 48 48" aria-hidden="true" focusable="false"><g fill="${fill}" stroke="${INK}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">${body}</g></svg>`;
const HL = (x, y, rx = 4, ry = 2.6) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="#fff" stroke="none" opacity=".6" transform="rotate(-30 ${x} ${y})"/>`;

const I = {
  build: () => S(`<rect x="8" y="22" width="14" height="14" rx="4" fill="#9BD8FF"/><rect x="26" y="22" width="14" height="14" rx="4" fill="#FFD23F"/><rect x="17" y="8" width="14" height="14" rx="4" fill="#FF8FB1"/>${HL(21, 12)}`),
  paint: () => S(`<path d="M10 30c0-12 10-20 20-20s12 8 8 14-10 2-10 8 2 8-6 8-12-2-12-10z" fill="#FFF1D6"/><circle cx="20" cy="20" r="3.5" fill="#FF7A6B"/><circle cx="29" cy="17" r="3.5" fill="#5BB8FF"/><circle cx="17" cy="29" r="3.5" fill="#5CC86F"/>${HL(16, 15)}`),
  play: () => S(`<path d="M15 9l25 15-25 15z" fill="#5CC86F"/>${HL(20, 17)}`),
  legs: () => S(`<path d="M17 6h14v18l4 14h-9l-3-12-3 12h-9l6-14z" fill="#FFB27A"/><ellipse cx="17" cy="40" rx="8" ry="4" fill="#FF8FB1"/><ellipse cx="31" cy="40" rx="8" ry="4" fill="#FF8FB1"/>${HL(22, 11)}`),
  arms: () => S(`<path d="M6 30c8-4 14-12 18-20" fill="none"/><circle cx="34" cy="14" r="9" fill="#FFB27A"/><path d="M28 9l-5-4" /><path d="M6 30c6 4 14 4 20-2" fill="none"/>${HL(31, 10)}`),
  mouths: () => S(`<path d="M7 20c6-6 28-6 34 0-2 14-32 14-34 0z" fill="#C8505E"/><path d="M14 20h20" /><rect x="18" y="19" width="5" height="6" rx="2" fill="#FFF4DD"/><rect x="25" y="19" width="5" height="6" rx="2" fill="#FFF4DD"/>`),
  eyes: () => S(`<circle cx="17" cy="24" r="10" fill="#fff"/><circle cx="33" cy="24" r="10" fill="#fff"/><circle cx="19" cy="25" r="5" fill="#5BB8FF"/><circle cx="35" cy="25" r="5" fill="#5BB8FF"/>${HL(14, 19, 2.5, 1.6)}${HL(30, 19, 2.5, 1.6)}`),
  wings: () => S(`<path d="M24 30C14 8 6 10 4 16c4 2 6 8 4 14 6-2 12 0 16 0z" fill="#9BD8FF"/><path d="M24 30c10-22 18-20 20-14-4 2-6 8-4 14-6-2-12 0-16 0z" fill="#9BD8FF"/>${HL(12, 16)}`),
  tails: () => S(`<path d="M8 36c4-14 22-16 26-6 2 6-6 10-10 6" fill="none"/><circle cx="36" cy="14" r="8" fill="#FFD23F"/>${HL(33, 11)}`),
  fins: () => S(`<path d="M6 36C16 34 22 20 24 6c8 10 16 22 18 30z" fill="#4FD1B5"/><path d="M24 12l-2 22M32 20l-2 14"/>${HL(26, 16)}`),
  details: () => S(`<path d="M14 40l6-30 8 30z" fill="#FFF1D6"/><path d="M30 40l5-22 6 22z" fill="#FFD23F"/>${HL(19, 20, 2.5, 1.6)}`),
  readyLeg: () => S(`<path d="M18 6h12v16l3 10h-8l-2-8-2 8h-7l4-10z" fill="#FFB27A"/><ellipse cx="22" cy="38" rx="11" ry="5" fill="#FF8FB1"/>${HL(22, 11)}`),
  readyArm: () => S(`<path d="M6 34c10-2 16-8 20-16" fill="none" stroke-width="7"/><path d="M6 34c10-2 16-8 20-16" fill="none" stroke="#FFB27A" stroke-width="3"/><circle cx="32" cy="14" r="9" fill="#FF8FB1"/>${HL(29, 10)}`),
  bendy: () => S(`<path d="M8 40c0-10 8-10 12-18s4-14 14-14" fill="none" stroke-width="9"/><path d="M8 40c0-10 8-10 12-18s4-14 14-14" fill="none" stroke="#B5E655" stroke-width="4"/><circle cx="20" cy="22" r="3" fill="#fff"/><circle cx="34" cy="8" r="3" fill="#fff"/>`),
  undo: () => S(`<path d="M18 12L8 22l10 10" fill="none"/><path d="M8 22h20c8 0 12 5 12 10s-4 10-12 10h-6" fill="none"/>`),
  redo: () => S(`<path d="M30 12l10 10-10 10" fill="none"/><path d="M40 22H20c-8 0-12 5-12 10s4 10 12 10h6" fill="none"/>`),
  mirror: () => S(`<path d="M24 6v36" stroke-dasharray="4 5"/><path d="M20 12L6 24l14 12z" fill="#FFB27A"/><path d="M28 12l14 12-14 12z" fill="#FFB27A"/>`),
  mirrorOff: () => S(`<path d="M24 6v36" stroke-dasharray="4 5" opacity=".4"/><path d="M20 12L6 24l14 12z" fill="#FFB27A"/><path d="M28 12l14 12-14 12z" fill="#fff" opacity=".5"/>`),
  mute: () => S(`<path d="M8 18h8l10-8v28l-10-8H8z" fill="#FFD23F"/><path d="M33 18l8 12M41 18l-8 12"/>`),
  sound: () => S(`<path d="M8 18h8l10-8v28l-10-8H8z" fill="#FFD23F"/><path d="M32 17c3 4 3 10 0 14M37 13c5 6 5 16 0 22" fill="none"/>`),
  new: () => S(`<ellipse cx="24" cy="28" rx="13" ry="15" fill="#FFE3EF"/><path d="M24 14v12M18 20h12" />${HL(19, 20)}`),
  gallery: () => S(`<rect x="6" y="10" width="36" height="8" rx="3" fill="#E8C995"/><rect x="6" y="30" width="36" height="8" rx="3" fill="#E8C995"/><circle cx="16" cy="25" r="5" fill="#FF8FB1"/><circle cx="32" cy="25" r="5" fill="#5BB8FF"/>`),
  share: () => S(`<circle cx="12" cy="24" r="6" fill="#9B7BFF"/><circle cx="36" cy="12" r="6" fill="#FFD23F"/><circle cx="36" cy="36" r="6" fill="#5CC86F"/><path d="M17 21l14-6M17 27l14 6"/>`),
  dice: () => S(`<rect x="8" y="8" width="32" height="32" rx="8" fill="#fff"/><circle cx="17" cy="17" r="3" fill="${INK}"/><circle cx="31" cy="31" r="3" fill="${INK}"/><circle cx="24" cy="24" r="3" fill="${INK}"/>`),
  helix: () => S(`<path d="M16 6c0 10 16 10 16 18s-16 8-16 18M32 6c0 10-16 10-16 18s16 8 16 18" fill="none"/><path d="M19 12h10M19 36h10M21 24h6"/>`),
  check: () => S(`<circle cx="24" cy="24" r="18" fill="#5CC86F"/><path d="M15 25l6 6 12-13" fill="none" stroke="#fff" stroke-width="5"/>`),
  cross: () => S(`<circle cx="24" cy="24" r="18" fill="#FF7A6B"/><path d="M17 17l14 14M31 17L17 31" stroke="#fff" stroke-width="5"/>`),
  jump: () => S(`<path d="M24 6l12 14h-7v10H19V20h-7z" fill="#5BB8FF"/><ellipse cx="24" cy="40" rx="10" ry="3" fill="#B5E655"/>`),
  fly: () => S(`<path d="M24 26C16 10 8 12 6 18c4 2 6 6 4 12 6-2 10-2 14-4zM24 26c8-16 16-14 18-8-4 2-6 6-4 12-6-2-10-2-14-4z" fill="#9BD8FF"/>`),
  back: () => S(`<path d="M30 8L14 24l16 16" fill="none" stroke-width="5"/>`),
  photo: () => S(`<rect x="6" y="14" width="36" height="26" rx="6" fill="#9B7BFF"/><circle cx="24" cy="27" r="8" fill="#fff"/><rect x="16" y="9" width="12" height="7" rx="2" fill="#9B7BFF"/>`),
  question: () => S(`<circle cx="24" cy="24" r="18" fill="#FFF1D6"/><path d="M18 19c0-4 3-7 6-7s6 3 6 6c0 5-6 5-6 10" fill="none"/><circle cx="24" cy="35" r="2" fill="${INK}"/>`),
  dance: () => S(`<circle cx="24" cy="12" r="6" fill="#FF8FB1"/><path d="M24 18v12l-8 10M24 30l8 10M14 22l10 2 10-6" fill="none"/>`),
  roar: () => S(`<circle cx="22" cy="24" r="14" fill="#FFB27A"/><ellipse cx="26" cy="27" rx="6" ry="7" fill="#C8505E"/><path d="M38 16l6-4M40 24h6M38 32l6 4"/>`),
  sit: () => S(`<path d="M10 34h28v6H10z" fill="#E8C995"/><circle cx="24" cy="22" r="10" fill="#5CC86F"/>`),
  sleep: () => S(`<path d="M30 8a14 14 0 1 0 10 22A12 12 0 0 1 30 8z" fill="#FFD23F"/><path d="M8 10h7l-7 8h7"/>`),
  wave: () => S(`<circle cx="28" cy="16" r="9" fill="#FFB27A"/><path d="M8 40c6-6 10-14 14-18" fill="none"/><path d="M38 6c3 2 4 5 4 8M42 4c3 3 4 6 4 10" fill="none"/>`),
  eat: () => S(`<circle cx="22" cy="28" r="13" fill="#FF7A6B"/><path d="M22 15c0-4 2-7 6-8" fill="none"/><path d="M33 22l8-4M34 30h8" />`),
  lock: () => S(`<rect x="10" y="20" width="28" height="22" rx="6" fill="#FFD23F"/><path d="M16 20v-6a8 8 0 0 1 16 0v6" fill="none"/>`),
  card: () => S(`<rect x="10" y="6" width="28" height="36" rx="6" fill="#FFF1D6"/><circle cx="24" cy="20" r="7" fill="#FF8FB1"/><path d="M16 34h16"/>`),
  link: () => S(`<rect x="4" y="18" width="22" height="12" rx="6" fill="none"/><rect x="22" y="18" width="22" height="12" rx="6" fill="none"/>`),
  cube: () => S(`<path d="M24 6l16 9v18l-16 9-16-9V15z" fill="#9BD8FF"/><path d="M8 15l16 9 16-9M24 24v18" fill="none"/>`),
  swatchDice: () => S(`<rect x="8" y="8" width="32" height="32" rx="8" fill="#FFD23F"/><circle cx="17" cy="17" r="3" fill="${INK}"/><circle cx="31" cy="31" r="3" fill="${INK}"/><circle cx="31" cy="17" r="3" fill="${INK}"/><circle cx="17" cy="31" r="3" fill="${INK}"/>`),
};
export const ICON_NAMES = Object.keys(I);
export function icon(name) { return (I[name] || I.card)(); }
