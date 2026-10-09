// walker.js — the creature's legs and little brain on the island: wander, idle, come when called, follow the ground.
// Exports: createWalker(creature, world, nav, { seed, onArrive, onCalled }) -> { update(dt), goTo(p) -> bool, face(yaw), wake(),
//          state, sleeping, position, heading, moving, target }.
// Behaviour: after birth it stands for a moment, then strolls to a nearby spot, looks around, and strolls again.
//   A tap on the ground sends it there (pathfinding round trees and rocks, never into the sea); from more than 4 m
//   away it runs. After a few strolls it gets sleepy and naps; a tap wakes it. Tapped, it turns to face you.
// Invariants: it only ever stands on walkable ground; speed always matches the stride (gait.speed) so feet don't
//   skate; turning is smooth and it slows down to turn sharp corners.
import * as THREE from 'three';
import { mulberry32 } from '../core/rng.js';

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export function createWalker(creature, world, nav, { seed = 1, onArrive, onCalled } = {}) {
  const rnd = mulberry32(seed ^ 0x51ed);
  const g = creature.group, gait = creature.gait;
  const pos = { x: 0, z: 0 };
  let heading = 0, amount = 0, path = null, state = 'rest', wait = 2.6 + rnd() * 1.5, called = false, faceYaw = null;
  let strolls = 0, sleepyAfter = 4 + Math.floor(rnd() * 4);
  const up = new THREE.Vector3(0, 1, 0), nrm = new THREE.Vector3(), qTilt = new THREE.Quaternion(), qYaw = new THREE.Quaternion();

  function wake() {
    if (state !== 'sleep') return false;
    creature.setSleep(false); state = 'rest'; wait = 2 + rnd() * 2; strolls = 0;
    return true;
  }
  function goTo(p, byPlayer = false) {
    if (byPlayer) wake();
    const route = nav.path(pos, p);
    if (!route || !route.length) return false;
    path = route; state = 'walk'; called = byPlayer; faceYaw = null;
    if (byPlayer) onCalled?.();
    return true;
  }

  function update(dt) {
    if (state === 'sleep') {
      wait -= dt;
      if (wait <= 0) wake();
    } else if (state === 'rest') {
      wait -= dt;
      if (faceYaw !== null) {
        const turn = wrap(faceYaw - heading);
        heading = wrap(heading + Math.sign(turn) * Math.min(Math.abs(turn), dt * 2.6));
        if (Math.abs(turn) < 0.02) faceYaw = null;
      }
      if (wait <= 0 && strolls >= sleepyAfter) {
        state = 'sleep'; wait = 16 + rnd() * 14; creature.setSleep(true); sleepyAfter = 4 + Math.floor(rnd() * 4);
      } else if (wait <= 0 && !goTo(nav.wanderTarget(pos, rnd))) wait = 1;
    }
    let want = 0;
    if (state === 'walk' && path) {
      const tgt = path[0], dx = tgt.x - pos.x, dz = tgt.z - pos.z, d = Math.hypot(dx, dz);
      if (d < 0.12 + gait.speed * dt) {
        path.shift();
        if (!path.length) {
          path = null; state = 'rest'; wait = called ? 4 + rnd() * 3 : 2 + rnd() * 4;
          if (!called) strolls++;
          onArrive?.(called); called = false;
        }
      } else {
        const turn = wrap(Math.atan2(dx, dz) - heading);
        heading = wrap(heading + Math.sign(turn) * Math.min(Math.abs(turn), dt * 3.2));
        const left = path.length === 1 ? d : Infinity;
        want = Math.max(0, Math.cos(turn)) * Math.min(1, left / (gait.speed * 0.6 + 0.2));
        want = Math.max(want, 0.25);
        // Called from far away: break into a run.
        if (called) {
          let rest = d;
          for (let i = 1; i < path.length; i++) rest += Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z);
          if (rest > 4) want *= 1.45;
        }
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
    update, goTo: (p) => goTo(p, true), wake,
    face: (yaw) => { if (state === 'rest') { faceYaw = yaw; wait = Math.max(wait, 2.5); } },
    get sleeping() { return state === 'sleep'; },
    get state() { return state; }, get moving() { return amount > 0.05; },
    get heading() { return heading; }, position: pos,
    get target() { return path ? path[path.length - 1] : null; },
  };
}
