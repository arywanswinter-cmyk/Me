// pictures.js — full-screen friendly pictures for dead ends (no WebGL2), drawn as SVG with no words.
// Exports: showNoWebGL().
// Invariants: never throws; replaces the canvas with a picture of a sleepy creature and a computer.
export function showNoWebGL() {
  const c = document.getElementById('cover');
  c.hidden = false;
  c.className = 'cover picture';
  c.innerHTML = '<svg viewBox="0 0 480 300" width="480" height="300" role="img" aria-label="This computer cannot show the creature">' +
    '<ellipse cx="240" cy="250" rx="150" ry="18" fill="#3A2E5C" opacity=".12"/>' +
    '<path d="M150 240c-10-80 40-140 90-140s100 60 90 140z" fill="#FF8FB1" stroke="#3A2E5C" stroke-width="6" stroke-linejoin="round"/>' +
    '<path d="M200 175q12 10 24 0M256 175q12 10 24 0" fill="none" stroke="#3A2E5C" stroke-width="6" stroke-linecap="round"/>' +
    '<ellipse cx="240" cy="210" rx="10" ry="6" fill="#3A2E5C"/>' +
    '<path d="M326 96h22l-22 24h22M356 64h16l-16 18h16" fill="none" stroke="#3A2E5C" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" opacity=".6"/>' +
    '<rect x="60" y="60" width="90" height="64" rx="10" fill="#FFF8EC" stroke="#3A2E5C" stroke-width="5"/>' +
    '<path d="M86 80l38 24M124 80l-38 24" stroke="#FF7A59" stroke-width="7" stroke-linecap="round"/></svg>';
  const gl = document.getElementById('gl');
  if (gl) gl.style.display = 'none';
}
