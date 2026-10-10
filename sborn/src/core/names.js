// names.js — friendly creature names from soft syllables (the dice on the name tag).
// Exports: randomName(rnd) -> string (2–3 syllables, capitalised, ≤ 12 letters).
// Invariants: deterministic for a given rnd(); only gentle, pronounceable syllables, never real words on purpose.
const A = ['Bo', 'Pi', 'Mu', 'Lo', 'Zu', 'Ki', 'Fi', 'Wo', 'Nu', 'Ta', 'Gli', 'Pom', 'Bun', 'Dee', 'Wib', 'Snu', 'Tup', 'Mog'];
const B = ['bo', 'li', 'ka', 'mo', 'ni', 'pu', 'zle', 'ble', 'roo', 'pip', 'wump', 'dle', 'ty', 'sy'];
const C = ['', '', 'o', 'y', 'kins', 'ster', 'bit', 'boo'];
export function randomName(rnd = Math.random) {
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  return (pick(A) + pick(B) + pick(C)).slice(0, 12);
}
