// parts.js — the 70-part catalog as data: ids, original names, DNA/complexity, stats, tags and attachment sizes.
// Exports: PARTS (array), PART (map id → def), GROUPS (drawer order), partTypes (Set), STAT_NAMES, statGroup.
// Invariants: names and shapes are original; ids are <group>.<key>; every def carries baseR (m, at scale 1),
//   sink (fraction of base height pushed into the skin, 0.20–0.35) and 1–3 tunable params with defaults.
export const STAT_NAMES = ['Bite', 'Charge', 'Strike', 'Spit', 'Sing', 'Dance', 'Charm', 'Pose', 'Speed', 'Sprint', 'Stealth', 'Glide', 'Jump', 'Health'];
export const statGroup = { Bite: 'attack', Charge: 'attack', Strike: 'attack', Spit: 'attack', Sing: 'social', Dance: 'social', Charm: 'social', Pose: 'social',
  Speed: 'move', Sprint: 'move', Stealth: 'move', Glide: 'move', Jump: 'move', Health: 'health' };

// line: key, name, dna, complexity, stats "Bite1 Sing1", tags "jaw omni"
const RAW = {
  mouth: [
    ['grin', 'Button Grin', 40, 3, 'Bite1 Sing1', 'jaw omni'],
    ['munch', 'Munch Muzzle', 90, 4, 'Bite1 Sing3', 'jaw herb'],
    ['chomper', 'Chomper', 150, 5, 'Bite3 Sing1', 'jaw carn'],
    ['peep', 'Peep Beak', 60, 3, 'Bite1 Sing2', 'beak herb'],
    ['hook', 'Hook Beak', 170, 4, 'Bite4', 'beak carn'],
    ['mandible', 'Click Mandibles', 120, 4, 'Bite2 Sing2', 'mandible carn'],
    ['snoot', 'Snuffle Snoot', 100, 4, 'Bite1 Sing2 Charm1', 'snout omni spring'],
    ['trumpet', 'Trumpet Bell', 220, 4, 'Sing5', 'snout herb flare'],
    ['sieve', 'Sieve Lips', 80, 4, 'Sing3', 'filter filter'],
    ['squirt', 'Squirt Spout', 170, 4, 'Spit4 Sing1', 'filter omni'],
  ],
  eye: [
    ['button', 'Button Eye', 20, 2, '', ''],
    ['moon', 'Moon Eye', 60, 2, 'Charm1', 'lids'],
    ['dreamy', 'Dreamy Eye', 80, 3, 'Charm2', 'lids'],
    ['almond', 'Almond Eye', 90, 2, 'Stealth1 Charm1', 'lids'],
    ['frog', 'Frog Dome', 70, 3, 'Jump1 Charm1', 'lids'],
    ['cluster', 'Dot Cluster', 100, 3, 'Stealth2', ''],
    ['stalk', 'Stalk Eye', 90, 4, 'Stealth1 Charm1', 'lids spring'],
    ['peeper', 'Big Peeper', 130, 3, 'Charm2 Stealth1', 'lids centre'],
  ],
  foot: [
    ['nub', 'Nub Paw', 25, 2, 'Speed1', 'pads'],
    ['pillow', 'Pillow Pad', 70, 3, 'Stealth2 Speed1', 'pads'],
    ['tiptoe', 'Tiptoe', 90, 3, 'Dance3', 'claws'],
    ['hoof', 'Tap Hoof', 110, 3, 'Speed3 Dance1', 'hooves'],
    ['web', 'Splash Web', 80, 3, 'Speed1 Jump1', 'pads'],
    ['gecko', 'Sticky Toes', 100, 4, 'Stealth3 Jump1', 'sticky'],
    ['talon', 'Grippy Talon', 120, 4, 'Sprint2 Strike1', 'claws'],
    ['spring', 'Spring Foot', 160, 4, 'Jump4 Sprint1', 'pads'],
    ['zoom', 'Zoom Runner', 220, 4, 'Speed4 Sprint3', 'pads'],
    ['twinkle', 'Twinkle Toes', 200, 3, 'Dance5', 'hooves'],
  ],
  hand: [
    ['mitten', 'Mitten', 40, 2, 'Pose1', ''],
    ['three', 'Three-Finger', 80, 4, 'Pose2 Strike1', 'curl'],
    ['scoop', 'Scoop Paw', 90, 3, 'Strike2 Pose1', 'curl'],
    ['cup', 'Suction Cup', 70, 3, 'Pose1 Stealth1', ''],
    ['curl', 'Curl Tip', 90, 3, 'Pose2 Charm1', 'spring'],
    ['snip', 'Snip Pincer', 140, 4, 'Strike3', 'jaw'],
    ['jazz', 'Jazz Hand', 160, 5, 'Pose4 Charm1', 'curl'],
    ['bonk', 'Bonk Mallet', 180, 3, 'Strike4', ''],
  ],
  wing: [
    ['nub', 'Flutter Nub', 40, 2, 'Jump1 Charm1', 'nofly'],
    ['leaf', 'Leaf Glider', 70, 3, 'Glide2', 'glide'],
    ['petal', 'Petal Wing', 130, 4, 'Glide2 Charm2', 'flap fold slow'],
    ['glass', 'Glass Wing', 140, 5, 'Glide2 Jump1', 'buzz fold'],
    ['sail', 'Sail Wing', 120, 4, 'Glide2 Speed1', 'flap fold membrane'],
    ['umbrella', 'Umbrella Wing', 150, 5, 'Glide3 Stealth1', 'flap fold membrane'],
    ['feather', 'Feather Wing', 160, 5, 'Glide3', 'flap fold'],
    ['cloud', 'Cloud Wing', 230, 6, 'Glide4 Charm1', 'flap fold'],
  ],
  tail: [
    ['puff', 'Puff Tail', 40, 2, 'Charm1', ''],
    ['curly', 'Curly Q', 50, 3, 'Dance1 Charm1', ''],
    ['sprout', 'Sprout Tail', 60, 3, 'Charm1 Stealth1', ''],
    ['ribbon', 'Ribbon Tail', 80, 4, 'Speed1 Dance1', ''],
    ['fluke', 'Fluke Tail', 90, 3, 'Speed2', ''],
    ['brush', 'Brush Tail', 120, 4, 'Charm2 Stealth1', ''],
    ['club', 'Thump Club', 150, 4, 'Strike3', ''],
    ['fan', 'Fan Tail', 180, 5, 'Charm3 Dance2', 'flare'],
  ],
  fin: [
    ['paddle', 'Paddle Fin', 50, 2, 'Speed1', 'spring'],
    ['ear', 'Fin Ear', 50, 2, 'Charm1 Stealth1', 'spring'],
    ['whisker', 'Whisker Fins', 60, 3, 'Stealth1 Charm1', 'spring'],
    ['sail', 'Back Sail', 60, 2, 'Speed1 Charm1', ''],
    ['crest', 'Head Crest', 90, 3, 'Charm2 Sing1', 'flare'],
    ['ripple', 'Ripple Fin', 110, 4, 'Speed1 Charm2', 'wave'],
    ['glider', 'Flying Fin', 130, 4, 'Glide2 Speed1', 'flare'],
    ['sunfan', 'Sunfan', 140, 4, 'Charm3', 'flare'],
  ],
  det: [
    ['nubhorn', 'Nub Horn', 50, 2, 'Charge1', 'keratin'],
    ['curlhorn', 'Curl Horn', 120, 3, 'Charge3', 'keratin'],
    ['swirlhorn', 'Swirl Horn', 180, 4, 'Charge4', 'keratin'],
    ['antler', 'Branch Antler', 140, 4, 'Charge2 Charm2', 'keratin'],
    ['ridge', 'Spike Ridge', 130, 5, 'Strike2 Health1', 'keratin'],
    ['plates', 'Armour Plates', 120, 4, 'Health2 Charge1', 'shell'],
    ['shell', 'Dome Shell', 220, 5, 'Health4', 'shell centre'],
    ['bobble', 'Bobble Antenna', 50, 3, 'Stealth1 Sing1', 'spring'],
    ['frill', 'Neck Frill', 130, 4, 'Charm3', 'flare membrane'],
    ['tuft', 'Fluff Tuft', 40, 2, 'Charm1', 'spring'],
  ],
};

// Attachment size (base radius at scale 1, metres) and sink per part; tuned so mounds read as soft bumps.
const BASE = {
  mouth: { r: 0.085, sink: 0.30 }, eye: { r: 0.06, sink: 0.35 }, foot: { r: 0.07, sink: 0.25 }, hand: { r: 0.06, sink: 0.25 },
  wing: { r: 0.05, sink: 0.25 }, tail: { r: 0.05, sink: 0.25 }, fin: { r: 0.045, sink: 0.20 }, det: { r: 0.045, sink: 0.25 },
};
const BASE_R = { 'eye.moon': 0.075, 'eye.dreamy': 0.07, 'eye.peeper': 0.12, 'eye.button': 0.045, 'eye.cluster': 0.065, 'eye.stalk': 0.035, 'mouth.chomper': 0.11, 'mouth.trumpet': 0.07, 'mouth.sieve': 0.1,
  'det.shell': 0.18, 'det.plates': 0.1, 'det.ridge': 0.06, 'det.frill': 0.08, 'wing.cloud': 0.06, 'tail.brush': 0.06, 'tail.club': 0.045, 'det.tuft': 0.04,
  'foot.pillow': 0.085, 'hand.bonk': 0.065 };
// Sink overrides (within 0.20–0.35) for parts whose wide bases sit on strongly curved skin (item 13).
const SINK = { 'mouth.hook': 0.35, 'det.plates': 0.30, 'det.shell': 0.30 };
// Params per group: p1 stretch along the main axis, p2 curl/bend/spread, p3 tip fatten/flare.
const PARAMS = {
  mouth: { len: 1, curl: 0.5, fat: 1 }, eye: { len: 1, curl: 0.5, fat: 1 }, foot: { len: 1, curl: 0.5, fat: 1 }, hand: { len: 1, curl: 0.3, fat: 1 },
  wing: { len: 1, curl: 0.5, fat: 1 }, tail: { len: 1, curl: 0.5, fat: 1 }, fin: { len: 1, curl: 0.5, fat: 1 }, det: { len: 1, curl: 0.4, fat: 1 },
};
const STEPS = ['pads', 'hooves', 'claws', 'sticky'];

export const GROUPS = [
  { key: 'legs', parts: ['foot'] }, { key: 'arms', parts: ['hand'] }, { key: 'mouths', parts: ['mouth'] }, { key: 'eyes', parts: ['eye'] },
  { key: 'wings', parts: ['wing'] }, { key: 'tails', parts: ['tail'] }, { key: 'fins', parts: ['fin'] }, { key: 'details', parts: ['det'] },
];

export const PARTS = [];
export const PART = {};
for (const [group, rows] of Object.entries(RAW)) {
  for (const [key, name, dna, cx, st, tg] of rows) {
    const id = `${group}.${key}`;
    const stats = {};
    for (const s of st.split(' ').filter(Boolean)) { const m = s.match(/^([A-Za-z]+)(\d)$/); stats[m[1]] = +m[2]; }
    const tags = tg.split(' ').filter(Boolean);
    const defTags = { mouth: ['jaw'], eye: ['track'], foot: ['tip'], hand: ['tip', 'grasp'], wing: [], tail: ['spring', 'wag'], fin: ['membrane'], det: [] }[group];
    if (group === 'wing' && !tags.some((t) => ['glide', 'buzz', 'nofly'].includes(t)) && !tags.includes('flap')) tags.push('flap', 'fold');
    for (const t of defTags) if (!tags.includes(t)) tags.unshift(t);
    const def = {
      id, group, key, name, dna, cx, stats, tags,
      voice: group === 'mouth' ? tg.split(' ')[0] : null,
      diet: group === 'mouth' ? tg.split(' ')[1] : null,
      footstep: tags.find((t) => STEPS.includes(t)) || null,
      baseR: BASE_R[id] ?? BASE[group].r,
      sink: SINK[id] ?? BASE[group].sink,
      params: { ...PARAMS[group] },
      centreOnly: tags.includes('centre') || group === 'tail',      // tails always sit on the mid-line
      tipOnly: tags.includes('tip'),
      tint: tags.includes('keratin') ? 'detail' : group === 'eye' ? 'natural' : 'skin',
    };
    PARTS.push(def);
    PART[id] = def;
  }
}
export const partTypes = new Set(PARTS.map((p) => p.id));
