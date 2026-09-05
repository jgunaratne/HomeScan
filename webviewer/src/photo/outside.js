import { renderer, scene } from '../scene/stage.js';
import { levels } from '../scene/levels.js';
import { photoRooms } from './rooms.js';

// Rooms read as sealed boxes until the windows have something behind them, and
// nothing in the scan knows what that is. The photographs do: photos.json names
// a crop of the deck shot — sky, the far hills, the lake — and it is wrapped on
// a cylinder outside the house with lawn under it. A backdrop, not a place: it
// does not parallax and it is not to scale, but it is the real view.
let outdoors = null;
export function buildOutdoors(){
  const src = photoRooms.flatMap(r => r.shots).find(ph => ph.view && ph.img);
  if (!src) return null;
  const img = src.img, W = img.naturalWidth, H = img.naturalHeight;
  const cut = r => [r[0]*W, r[1]*H, r[2]*W, r[3]*H];

  // Eight repeats at 2048 wide keeps the crop close to its own aspect: stretch
  // one strip round 140 m of horizon and it smears into nothing.
  const N = 2048, M = 512, REP = 8;
  const c = document.createElement('canvas');
  c.width = N; c.height = M;
  const cx = c.getContext('2d');
  const [vx, vy, vw, vh] = cut(src.view);

  // Read the crop's own top and foot, so the gradient above and the ground
  // below meet the horizon in the colours the photograph actually has.
  const probe = document.createElement('canvas');
  probe.width = 1; probe.height = 64;
  const pcx = probe.getContext('2d');
  pcx.drawImage(img, vx + vw/2, vy, 1, vh, 0, 0, 1, 64);
  const col = row => {
    const d = pcx.getImageData(0, row, 1, 1).data;
    return `rgb(${d[0]},${d[1]},${d[2]})`;
  };
  const sky = cx.createLinearGradient(0, 0, 0, M*0.45);
  sky.addColorStop(0, col(0));
  sky.addColorStop(1, col(6));
  cx.fillStyle = sky; cx.fillRect(0, 0, N, M*0.45);

  // The crop itself across the horizon, repeated so it is not smeared round.
  for (let i=0;i<REP;i++)
    cx.drawImage(img, vx, vy, vw, vh, i*N/REP, M*0.43, N/REP, M*0.18);

  let lawn = '#6E8B4A';
  if (src.ground){
    const [gx, gy, gw, gh] = cut(src.ground);
    pcx.drawImage(img, gx, gy, gw, gh, 0, 0, 1, 1);
    lawn = col(0);
  }
  const down = cx.createLinearGradient(0, M*0.60, 0, M);
  down.addColorStop(0, lawn);
  down.addColorStop(1, '#3B4A2C');
  cx.fillStyle = down; cx.fillRect(0, M*0.60, N, M*0.40);

  const tex = new THREE.CanvasTexture(c);
  tex.encoding = THREE.sRGBEncoding;
  tex.wrapS = THREE.RepeatWrapping;
  const R = 140, HH = 140, base = levels[0].elevation;
  // fog:false, or a 40 m draw distance would swallow the whole horizon.
  const sleeve = new THREE.Mesh(
    new THREE.CylinderGeometry(R, R, HH, 48, 1, true),
    new THREE.MeshBasicMaterial({map:tex, side:THREE.BackSide, fog:false}));
  sleeve.position.y = base - 60 + HH/2;

  // Lawn only as far as a lawn goes; past that the photographed ground takes over.
  const grass = new THREE.Mesh(new THREE.CircleGeometry(34, 48),
    new THREE.MeshBasicMaterial({color:new THREE.Color(lawn), fog:false}));
  grass.rotation.x = -Math.PI/2;
  grass.position.y = base - 0.28;

  // The same world again, small and equirectangular, so physical surfaces have
  // something to reflect. Without it a polished floor reflects nothing and reads
  // as matte plastic; with it, it picks up the window and the sky above it.
  const e = document.createElement('canvas');
  e.width = 256; e.height = 128;
  const ecx = e.getContext('2d');
  const eSky = ecx.createLinearGradient(0, 0, 0, 64);
  eSky.addColorStop(0, col(0)); eSky.addColorStop(1, col(6));
  ecx.fillStyle = eSky; ecx.fillRect(0, 0, 256, 64);
  ecx.drawImage(img, vx, vy, vw, vh, 0, 56, 256, 18);
  // Half the reflected sphere is ground, so a saturated lawn tints every
  // surface in the house green. For the reflection it is muted toward neutral.
  ecx.fillStyle = lawn; ecx.fillRect(0, 74, 256, 54);
  ecx.globalAlpha = 0.55;
  ecx.fillStyle = '#8C8C86'; ecx.fillRect(0, 74, 256, 54);
  ecx.globalAlpha = 1;
  const envTex = new THREE.CanvasTexture(e);
  envTex.mapping = THREE.EquirectangularReflectionMapping;
  envTex.encoding = THREE.sRGBEncoding;
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  scene.environment = pmrem.fromEquirectangular(envTex).texture;
  pmrem.dispose(); envTex.dispose();

  const g = new THREE.Group();
  g.add(sleeve); g.add(grass);
  g.renderOrder = -1;
  scene.add(g);
  return outdoors = {group:g, sky:new THREE.Color(col(2)),
                     lawn:new THREE.Color(lawn), env:scene.environment};
}
export const outdoorWorld = () => outdoors;
