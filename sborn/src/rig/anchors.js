// anchors.js — skinned anchors: each surface socket bone borrows the skin weights of the skin vertex nearest its rest
//   position, so the rig can place it by the skin's own blend (see skeleton.js setAnchors).
// Exports: skinAnchors(shape, res) -> [{ bone, idx[4], w[4] }].
// Invariants: limb-tip sockets (feet, hands) are skipped: they ride their IK tip bone; weights are the u8 weights / 255
//   restricted to body bones and renormalized.
// Skinned anchors: every surface socket (not limb-tip feet and hands, which ride their IK tip bone) takes the skin
// weights of the skin vertex nearest its rest position, so its part follows the deformed surface exactly.
export function skinAnchors(sh, res) {
  const P = res.position, SI = res.skinIndex, SW = res.skinWeight, nv = P.length / 3, out = [];
  for (const s of sh.sockets) {
    if (s.tip) continue;
    const b = sh.bones[s.bone].pos;
    let best = -1, bd = Infinity;
    for (let v = 0; v < nv; v++) { const dx = P[v * 3] - b[0], dy = P[v * 3 + 1] - b[1], dz = P[v * 3 + 2] - b[2], d = dx * dx + dy * dy + dz * dz; if (d < bd) { bd = d; best = v; } }
    if (best < 0) continue;
    // only body bones (spine, limb, tip): mound skin is weighted to socket bones, which would make the anchor circular
    const idx = [], w = [];
    let sum = 0;
    for (let k = 0; k < 4; k++) { const bi = SI[best * 4 + k], wi = SW[best * 4 + k] / 255, kind = sh.bones[bi] && sh.bones[bi].kind; if (wi > 0 && (kind === 'spine' || kind === 'limb' || kind === 'tip')) { idx.push(bi); w.push(wi); sum += wi; } }
    if (sum <= 0) continue;
    out.push({ bone: s.bone, idx, w: w.map((x) => x / sum) });
  }
  return out;
}
