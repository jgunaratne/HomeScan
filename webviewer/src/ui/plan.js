import { $ } from '../core/util.js';
import { player, flags } from '../core/state.js';
import { levels } from '../scene/levels.js';

const mini = $('mini'), mx = mini.getContext('2d');
export function paintPlan(){
  const L = levels[player.level], b = L.bounds;
  const W = mini.width, H = mini.height, pad = 14;
  mx.clearRect(0,0,W,H);
  const s = Math.min((W-pad*2)/(b.x1-b.x0), (H-pad*2)/(b.z1-b.z0));
  const ox = (W - (b.x1-b.x0)*s)/2 - b.x0*s, oz = (H - (b.z1-b.z0)*s)/2 - b.z0*s;
  const X = x => x*s + ox, Z = z => z*s + oz;

  mx.fillStyle = 'rgba(120,138,160,.13)';
  for (const f of L.floors){
    mx.beginPath();
    f.poly.forEach(([x,z],i) => i ? mx.lineTo(X(x),Z(z)) : mx.moveTo(X(x),Z(z)));
    mx.closePath(); mx.fill();
  }

  if (L.sealed.cells.length){
    const q = L.sealed;
    mx.fillStyle = 'rgba(232,163,61,.22)';
    for (const k of q.cells){
      const i = k % q.nx, j = (k - i)/q.nx;
      mx.fillRect(X(q.b.x0 + i*q.g), Z(q.b.z0 + j*q.g), q.g*s + 1, q.g*s + 1);
    }
  }

  mx.fillStyle = 'rgba(139,152,169,.34)';
  // The dressed house draws what the dressing laid out in place of the
  // scanned boxes it replaced; the survey draws the scan.
  const boxes = !flags.showFurniture ? [] : !flags.surfaced ? L.objects
    : L.objects.filter(o => !o.replaced).concat(L.planBoxes || []);
  for (const o of boxes){
    mx.save(); mx.translate(X(o.c[0]), Z(o.c[2])); mx.rotate(-o.yaw);
    mx.fillRect(-o.d[0]*s/2, -o.d[2]*s/2, o.d[0]*s, o.d[2]*s);
    mx.restore();
  }

  // only body-height panels are drawn, so doorways read as gaps — plan convention
  mx.strokeStyle = '#C9D0D8'; mx.lineWidth = 2.4; mx.lineCap = 'butt';
  mx.beginPath();
  for (const p of L.plan){
    const c = Math.cos(p.yaw), s2 = Math.sin(p.yaw);
    mx.moveTo(X(p.x - c*p.hx), Z(p.z + s2*p.hx));
    mx.lineTo(X(p.x + c*p.hx), Z(p.z - s2*p.hx));
  }
  mx.stroke();

  const tint = '#' + L.tint.toString(16).padStart(6,'0');

  if (flags.showPrints){
    mx.fillStyle = '#E4EAF2';
    for (const m of L.shots){
      const ph = m.userData.ph;
      if (!ph.mark) continue;
      mx.save(); mx.translate(X(ph.mark.x), Z(ph.mark.z)); mx.rotate(-ph.mark.yaw);
      mx.fillRect(-4.5, -1.6, 9, 3.2);
      mx.restore();
    }
  }

  const px = X(player.x), pz = Z(player.z), a = player.yaw;
  mx.globalAlpha = 0.22;
  mx.beginPath(); mx.moveTo(px,pz);
  mx.arc(px, pz, 34, -a - Math.PI/2 - 0.42, -a - Math.PI/2 + 0.42);
  mx.closePath(); mx.fillStyle = tint; mx.fill(); mx.globalAlpha = 1;
  mx.beginPath(); mx.arc(px, pz, 4.2, 0, 7); mx.fillStyle = tint; mx.fill();
  mx.strokeStyle = '#0C0F14'; mx.lineWidth = 1.4; mx.stroke();
}
