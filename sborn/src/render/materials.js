// materials.js — the part materials (keratin, mouth, teeth, eyes, membrane, shell) and part tints, shared by every creature.
// Exports: createPartMaterials(skinMat) -> { map: {name: Material}, setPaint(paint) }.
// Invariants: one material object per kind for the whole app (programs never multiply); colours change by uniform writes.
import * as THREE from 'three';

export function createPartMaterials(skinMat) {
  const phys = (o) => new THREE.MeshPhysicalMaterial({ roughness: 0.4, metalness: 0, ...o });
  const map = {
    skin: phys({ color: '#ff8fb1', roughness: 0.42, clearcoat: 0.3, clearcoatRoughness: 0.2, sheen: 0.2, sheenRoughness: 0.5 }),
    'tint:base': phys({ color: '#ff8fb1', roughness: 0.42, clearcoat: 0.3, clearcoatRoughness: 0.2, sheen: 0.2 }),
    'tint:coat': phys({ color: '#6c8cff', roughness: 0.42, clearcoat: 0.3, clearcoatRoughness: 0.2, sheen: 0.2 }),
    'tint:detail': phys({ color: '#ffd23f', roughness: 0.42, clearcoat: 0.3, clearcoatRoughness: 0.2, sheen: 0.2 }),
    keratin: phys({ color: '#ffd23f', roughness: 0.32, clearcoat: 0.8, clearcoatRoughness: 0.15 }),
    mouth: phys({ color: '#8c2f3e', roughness: 0.6 }),
    tongue: phys({ color: '#F07C8C', roughness: 0.5, clearcoat: 0.4 }),
    teeth: phys({ color: '#FFF4DD', roughness: 0.3, clearcoat: 0.6 }),
    sclera: phys({ color: '#FBF6EE', roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.04 }),
    iris: phys({ color: '#7fc8ff', roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.04 }),
    pupil: phys({ color: '#1a1424', roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.04 }),
    membrane: phys({ color: '#ff8fb1', roughness: 0.5, side: THREE.DoubleSide, sheen: 0.3 }),
    shell: phys({ color: '#9b7bff', roughness: 0.3, clearcoat: 1, iridescence: 0.35 }),
  };
  function setPaint(paint) {
    map.skin.color.set(paint.base.c); map.membrane.color.set(paint.base.c);
    map['tint:base'].color.set(paint.base.c); map['tint:coat'].color.set(paint.coat.c); map['tint:detail'].color.set(paint.detail.c);
    map.keratin.color.set(paint.detail.c); map.iris.color.set(paint.iris);
  }
  return { map, setPaint };
}
