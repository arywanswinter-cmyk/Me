// grid.js — flood fill and connected-component labelling on square pixel grids.
// Exports: flood(block, N) -> Uint8Array (1 = reachable from the border through block==0, 4-connected);
//          label(mask, w, h, conn8) -> { lab: Int32Array (-1 = background), sizes: number[] }.
// Invariant: every pixel is pushed at most once, so both run in O(pixels).
export function flood(block, N) {
  const ext = new Uint8Array(N * N);
  const st = new Int32Array(N * N);
  let sp = 0;
  const push = (i) => { if (!block[i] && !ext[i]) { ext[i] = 1; st[sp++] = i; } };
  for (let i = 0; i < N; i++) { push(i); push((N - 1) * N + i); push(i * N); push(i * N + N - 1); }
  while (sp) {
    const i = st[--sp], x = i % N;
    if (x > 0) push(i - 1);
    if (x < N - 1) push(i + 1);
    if (i >= N) push(i - N);
    if (i < N * N - N) push(i + N);
  }
  return ext;
}

export function label(mask, w, h, conn8) {
  const lab = new Int32Array(w * h).fill(-1);
  const sizes = [];
  const st = new Int32Array(w * h);
  for (let s = 0; s < w * h; s++) {
    if (!mask[s] || lab[s] >= 0) continue;
    const L = sizes.length;
    let sp = 0, n = 0;
    lab[s] = L; st[sp++] = s;
    while (sp) {
      const i = st[--sp]; n++;
      const x = i % w, y = (i - x) / w;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if ((!dx && !dy) || (!conn8 && dx && dy)) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (mask[j] && lab[j] < 0) { lab[j] = L; st[sp++] = j; }
      }
    }
    sizes.push(n);
  }
  return { lab, sizes };
}
