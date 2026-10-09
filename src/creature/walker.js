// walker.js — the creature's legs and little brain on the island: wander, idle, come when called, follow the ground.
// Exports: createWalker(creature, world, nav, { seed, onArrive, onCalled }) -> { update(dt), goTo(p) -> bool, state, position, heading, moving }.
// Behaviour: after birth it stands for a moment, then strolls to a nearby spot, looks around, and strolls again.
//   A tap on the ground sends it there (pathfinding round trees and rocks, never into the sea).
// Invariants: it only ever stands on walkable ground; speed always matches the stride (gait.speed) so feet don't
//   skate; turning is smooth and it slows down to turn sharp corners.
import * as THREE from 'three';
import { mulberry32 } from '../core/rng.js';

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export function createWalker(creature, world, nav, { seed = 1, onArrive, onCalled } = {}) {
  const rnd = mulberry32(seed ^ 0x51ed);
  const g = creature.group, gait = creature.gait;
  const pos = { x: 0, z: 0 };
  let heading = 0, amount = 0, path = null, state = 'rest', wait = 2.6 + rnd() * 1.5, called = false;
  const up = new THREE.Vector3(0, 1, 0), nrm = new THREE.Vector3(), qTilt = new THREE.Quaternion(), qYaw = new THREE.Quaternion();

  function goTo(p, byPlayer = false) {
    const route = nav.path(pos, p);
    if (!route || !route.length) return false;
    path = route; state = 'walk'; called = byPlayer;
    if (byPlayer) onCalled?.();
    return true;
  }

  function update(dt) {
    if (state === 'rest') {
      wait -= dt;
      if (wait <= 0 && !goTo(nav.wanderTarget(pos, rnd))) wait = 1;
    }
    let want = 0;
    if (state === 'walk' && path) {
      const tgt = path[0], dx = tgt.x - pos.x, dz = tgt.z - pos.z, d = Math.hypot(dx, dz);
      if (d < 0.12 + gait.speed * dt) {
        path.shift();
        if (!path.length) {
          path = null; state = 'rest'; wait = called ? 4 + rnd() * 3 : 2 + rnd() * 4;
          onArrive?.(called); called = false;
        }
      } else {
        const turn = wrap(Math.atan2(dx, dz) - heading);
        heading = wrap(heading + Math.sign(turn) * Math.min(Math.abs(turn), dt * 3.2));
        const left = path.length === 1 ? d : Infinity;
        want = Math.max(0, Math.cos(turn)) * Math.min(1, left / (gait.speed * 0.6 + 0.2));
        want = Math.max(want, 0.25);
      }
    }
    // Ease in and out of the stride; the body only moves as fast as the legs carry it.
    amount += (want - amount) * Math.min(1, dt * (want > amount ? 3 : 5));
    if (amount < 0.002) amount = 0;
    const step = gait.speed * amount * dt;
    const nx = pos.x + Math.sin(heading) * step, nz = pos.z + Math.cos(heading) * step;
    if (nav.walkable(nx, nz)) { pos.x = nx; pos.z = nz; }
    creature.setWalk(amount, Math.sin(heading) * gait.speed * amount, Math.cos(heading) * gait.speed * amount);

    // Stand on the ground and lean a little with the slope.
    const e = 0.15, hx = world.heightAt(pos.x + e, pos.z) - world.heightAt(pos.x - e, pos.z), hz = world.heightAt(pos.x, pos.z + e) - world.heightAt(pos.x, pos.z - e);
    nrm.set(-hx, 2 * e, -hz).normalize().lerp(up, 0.55).normalize();
    qTilt.setFromUnitVectors(up, nrm);
    qYaw.setFromAxisAngle(up, heading);
    g.quaternion.copy(qTilt).multiply(qYaw);
    g.position.set(pos.x, world.heightAt(pos.x, pos.z), pos.z);
  }

  return {
    update, goTo: (p) => goTo(p, true),
    get state() { return state; }, get moving() { return amount > 0.05; },
    get heading() { return heading; }, position: pos,
    get target() { return path ? path[path.length - 1] : null; },
  };
}
