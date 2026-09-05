import { $ } from '../core/util.js';
import { HOUSE } from '../core/data.js';
import { SPEED, SPRINT, BODY_R, REDUCED } from '../core/constants.js';
import { player, nav, view, orbit, flags, pointer, keys, focus } from '../core/state.js';
import { onFloor } from '../core/geometry.js';
import { renderer, scene, camera } from '../scene/stage.js';
import { levels } from '../scene/levels.js';
import { pushOut } from '../player/collision.js';
import { stairsNear } from '../player/movement.js';
import { ring } from '../player/pointing.js';
import { shotAt } from '../photo/prints.js';
import { whereAmI } from '../ui/hud.js';
import { paintShot } from '../ui/modes.js';
import { paintPlan } from '../ui/plan.js';
import { makeTargets, renderFrame, watchBudget } from './passes.js';

let prev = performance.now();
export function frame(now){
  const dt = Math.min((now - prev)/1000, 0.05); prev = now;

  if (view.mode === 'walk'){
    const L = levels[player.level];
    let fx = (keys.w || keys.arrowup ? 1 : 0) - (keys.s || keys.arrowdown ? 1 : 0);
    let sx = (keys.d || keys.arrowright ? 1 : 0) - (keys.a || keys.arrowleft ? 1 : 0);
    if (pointer.stick){ fx -= pointer.stick.dy; sx += pointer.stick.dx; }
    const m = Math.hypot(fx, sx);
    let dvx = 0, dvz = 0;

    if (m > 0.01){
      nav.goTarget = null;                       // any manual input takes the wheel back
      const sp = keys.shift ? SPRINT : SPEED;
      dvx = (-Math.sin(player.yaw)*fx + Math.cos(player.yaw)*sx) / m * sp;
      dvz = (-Math.cos(player.yaw)*fx - Math.sin(player.yaw)*sx) / m * sp;
    } else if (nav.goTarget){
      const tx = nav.goTarget.x - player.x, tz = nav.goTarget.z - player.z;
      const d = Math.hypot(tx, tz);
      if (d < 0.28){ nav.goTarget = null; }
      else {
        dvx = tx/d * SPEED; dvz = tz/d * SPEED;
        // Turn to face the way you are walking, unless you are steering by hand.
        if (!(pointer.drag && pointer.press && pointer.press.moved)){
          const want = Math.atan2(-tx, -tz);
          const off = ((want - player.yaw + Math.PI*3) % (Math.PI*2)) - Math.PI;
          player.yaw += off * Math.min(dt*2.6, 1);
        }
      }
    }
    player.vx += (dvx - player.vx) * Math.min(dt*12, 1);
    player.vz += (dvz - player.vz) * Math.min(dt*12, 1);
    player.x += player.vx * dt;
    player.z += player.vz * dt;

    for (let pass=0; pass<3; pass++){
      if (flags.ghost) break;
      for (const b of L.blockers) pushOut(player, b, BODY_R);
      if (flags.showFurniture) for (const b of L.objBlockers) pushOut(player, b, BODY_R);
    }
    if (nav.goTarget){
      nav.stuckT = Math.hypot(player.vx, player.vz) < 0.4 ? nav.stuckT + dt : 0;
      if (nav.stuckT > 0.5){ nav.goTarget = null; nav.stuckT = 0; }
    }
    if (onFloor(L, player.x, player.z)) nav.lastGood = {x:player.x, z:player.z};
    else { player.x = nav.lastGood.x; player.z = nav.lastGood.z; player.vx = player.vz = 0; }

    camera.position.set(player.x, L.elevation + flags.eyeH, player.z);
    camera.rotation.set(0,0,0, 'YXZ');
    camera.rotation.order = 'YXZ';
    camera.rotation.y = player.yaw;
    camera.rotation.x = player.pitch;
    scene.fog.near = flags.surfaced ? 12 : 7;
    scene.fog.far  = flags.surfaced ? 62 : 40;

    if (pointer.lockLook){
      const was = focus.hoverShot;
      focus.hoverShot = focus.lbShot ? null : shotAt(innerWidth/2, innerHeight/2);
      if (was !== focus.hoverShot) paintShot();
    }
    const near = stairsNear();
    $('prompt').hidden = !(near && !focus.hoverShot);
    if (near) $('prompt-t').textContent =
      player.level === 0 ? 'Go up to ' + levels[1].name : 'Go down to ' + levels[0].name;
    const mark = nav.goTarget || (pointer.lockLook ? null : nav.hover);
    ring.visible = !!mark;
    if (mark){
      ring.position.set(mark.x, L.elevation + 0.02, mark.z);
      ring.material.opacity = nav.goTarget ? 0.95 : 0.55;
    }
    $('here-room').textContent = whereAmI();
    const deg = Math.round(((-player.yaw * 180/Math.PI) % 360 + 360) % 360);
    $('here-co').textContent =
      `${player.x >= 0 ? '+' : ''}${player.x.toFixed(1)}, ${player.z >= 0 ? '+' : ''}${player.z.toFixed(1)} · ${String(deg).padStart(3,'0')}°`;
    paintPlan();
  } else {
    if (!REDUCED && !pointer.drag) orbit.theta += dt * 0.055;
    const r = orbit.dist;
    camera.position.set(
      orbit.tx + r*Math.cos(orbit.phi)*Math.sin(orbit.theta),
      orbit.ty + r*Math.sin(orbit.phi),
      orbit.tz + r*Math.cos(orbit.phi)*Math.cos(orbit.theta));
    camera.rotation.order = 'YXZ';
    camera.lookAt(orbit.tx, orbit.ty, orbit.tz);
    scene.fog.near = 30; scene.fog.far = 130;
    paintPlan();
  }

  levels.forEach((L,i) => {
    L.group.position.y = view.mode === 'view' ? view.explode * i : 0;
    L.ceil.visible = view.mode === 'walk' && i === player.level;
    L.group.visible = true;
  });

  watchBudget(dt);
  renderFrame();
  requestAnimationFrame(frame);
}

export function resize(){
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w/h; camera.updateProjectionMatrix();
  // Five full-screen passes: the buffers follow the drawing buffer, but capped,
  // because a retina panel would otherwise cost four times the fill for nothing
  // the eye can find once FXAA and a little grain are over the top.
  const dpr = Math.min(renderer.getPixelRatio(), 1.5);
  makeTargets(Math.max(2, Math.round(w*dpr)), Math.max(2, Math.round(h*dpr)));
}

// Frame the whole house for the section view: the orbit sits at half the storey
// rise and stands back by the longer of the two plan axes.
export function frameHouse(){
  const all = HOUSE.levels.flatMap(L => L.floors.flatMap(f => f.poly));
  orbit.ty = (HOUSE.levels[1]?.elevation ?? 0) / 2 + 1.2;
  orbit.dist = Math.max(20, Math.max(
    Math.max(...all.map(p=>p[0])) - Math.min(...all.map(p=>p[0])),
    Math.max(...all.map(p=>p[1])) - Math.min(...all.map(p=>p[1]))) * 1.5);
}

export function startLoop(){
  addEventListener('resize', resize);
  resize();
  requestAnimationFrame(frame);
}
