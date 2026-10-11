// thresholds.js — every §16 threshold, sample size and fixture count, verbatim, in one place.
// Exports: T (frozen object).
// Invariants: tests read limits only from here; a value may never be loosened to make a test pass
//   (the final report diffs this file against the build prompt).
export const T = Object.freeze({
  fixtures: 12, starters: 8,
  skinMaxTris: 40000, nonManifoldFrac: 0.01,                                 // item 7
  remeshSamples: 50, previewP95Ms: 15, fullP95Ms: 90,                        // item 8
  stateHashSteps: 600,                                                       // item 9
  vertebraeMin: 3, vertebraeMax: 24, radiusMin: 0.04, radiusMax: 0.60,       // item 10
  wheelPerNotch: 0.08, wheelTol: 0.005, minYTolM: 0.001, settleSteps: 15,
  limbJointStep: 0.22, limbJointsMin: 2, limbJointsMax: 5, limbReachTol: 0.10, // item 11
  parts: 70, partL0MaxTris: 1500, thumbLumaStd: 6, thumbAlphaMin: 0.10, thumbAlphaMax: 0.90, silhouetteIoU: 0.85, // item 12
  partsL0Max: 40000, partsL1Max: 15000, partsL2Max: 5000,
  baseRingField: -0.15, anchorDeltaE: 0.02,                                  // item 13
  randomEdits: 200, reresolveH: 0.5,                                         // item 14
  mirrorTol: 1e-5, hausdorffH: 0.5,                                          // item 15
  restTol: 1e-5, bendFlipFrac: 0.005, partFollowM: 0.002,                    // item 16
  undoOps: 200,                                                              // item 17
  dnaTotal: 2000, complexityCap: 100,                                        // items 18-19
  statTol: 0.5,                                                              // item 20
  hint1Steps: 120, hintGoneSteps: 60, hint2Steps: 120, hintAbsentSteps: 300, // item 22
  visibleTextRe: '^[0-9 .,:+−×%/·?-]*$', minTarget: 44, minCard: 64,         // item 23
  paintLayers: 3, paintPatterns: 10, paintSizes: 3,                          // item 24
  domainMoveM: 0.001, neighbourJumpH: 3, junctionDeltaE: 0.03,               // item 25
  swatchDeltaE: 0.06, swatches: 18,                                          // item 26
  slideDriftP95Mm: 3, slideDriftMaxMm: 10, penetrationP95Mm: 2, airGapMm: 5, // item 28
  slideLegPctP95: 0.01, slideLegPctMax: 0.03, reachLimitedFrac: 0.02, slideDistM: 10, slideAccelS: 2,
  circleR: 1.5, circleLaps: 2,                                               // item 29
  legless10mSteps: 1500, leglessSinkM: 0.01,                                 // item 30
  emoteSteps: 180, emotePenetrationM: 0.01,                                  // item 31
  flyHoldSteps: 600, flyAboveM: 1, flyAboveSteps: 480, landSteps: 300, flareDeg: 30, glideSlopeTol: 0.15, winglessGroundSteps: 120, // item 32
  wasdDistM: 8, wasdTolM: 0.3, wasdSteps: 1800, tapSteps: 1200, followRunStep: 36, followRunTol: 1, jumpTol: 0.05, // item 33
  idleSteps: 1800, blinks: 5, blinkMs: [70, 30, 110], blinkTolSteps: 1, chestHalfRange: 0.012, chestTol: 0.003,
  breathPeriodS: 3.2, breathPeriodTol: 0.2, eyeWithinDeg: 10, eyeTargetDeg: 20, eyeSteps: 30, tailStdM: 0.002, // item 34
  eatSteps: 300, chomps: 3, crumbs: 8, respawnSteps: 1200, respawnTol: 1,    // item 35
  photoFreezeSteps: 60, backdrops: 6, backdropDiffFrac: 0.05,                // item 36
  programs: { low: 32, medium: 44, high: 56 },                               // item 37
  editorMainCalls: 40, islandCalls: { high: [110, 30], medium: [75, 20], low: [50, 10] },
  islandTris: { high: 650000, medium: 380000, low: 200000 }, creatureTris: 80000, // item 38
  lowVsHighDeltaE: 0.05,                                                     // item 39
  simP95Ms: 2, simWarmSteps: 180, simSteps: 1800,                            // item 40
  heapSlopeMB: 1, heapSteps: 3600, heapEvery: 300, heapGuardMB: 0.8, memTol: 2, rebuildCycles: 50, islandTrips: 10, // item 41
  diffFrac: 0.005, yiq: 0.1,                                                 // item 42, §15.3
  beautyFill: [0.55, 0.70], beautyDarkMax: 10, beautyClipFrac: 0.003, catchLuma: 235, rimRatio: 1.12,
  backlitRatio: 1.3, haloRatio: 1.2, footShadowDarker: 0.08, skyRunPx: 16,   // §11.6
  reloadFlushMs: 100, reloadLateMs: 1000,                                    // item 46
  thumbStrip: [2048, 128], thumbFrames: 16,                                  // item 47
  linkMaxChars: 2000, inflateCapBytes: 65536,                                // item 49
  glbMaxMB: 8, glbMeshes: 3, glbTol: 0.01, glbStarters: 3,                   // item 50
  audioIds: 85, sfxGenerations: 367,                                         // items 51, 54
  peakMax: 0.891, rateTol: 1e-6, sameIdMs: 40, busCaps: { ui: 4, voice: 3, move: 6, amb: 3, music: 2 }, // item 53
  tipRatio: 0.15, tipSphere: 0.9,                                            // item 58
  reducedSquash: [0.94, 1.04], reducedTol: 0.005, reducedIdleSteps: 600,     // item 62
  pinchTol: 0.05, secondFingerMs: 150, longPressMs: 450, radialButtons: 4, radialMin: 56, // item 66
  mirrorMaxKB: 16, undoMaxEntries: 100, undoMaxMB: 2, undoEdits: 300, cardW: 1080, cardH: 1350, // item 68
  nonReaderInteractions: 12, nonReaderSteps: 3600,                           // item 72
  spikeDriftP95Mm: 10, smokeRootM: 2, smokeSteps: 300,                       // M1 spike, M2.smoke
});
