#!/usr/bin/env python3
"""Build a first-person walkthrough of a HomeScan scan.

    python3 webviewer/build.py <scan-dir> [-o index.html]

Reads a scan folder in the SPEC §5.1 layout — manifest.json plus
segments/<seg>/rooms/<room>/room.json — and writes a single self-contained HTML
file with the geometry inlined. Nothing is fetched at runtime except three.js.

The app names those two folders with the record's UUID. A folder kept by hand may
carry a readable name instead ("segment-1", "downstairs"), in which case the
record says so in "dir"; the id stays the id either way.

photos.json, if present, adds room photographs: each is inlined as a data URI and
hung on a wall of the room it belongs to. They are the reason the output is
megabytes rather than kilobytes — `--no-photos` builds the geometry alone.

Why the parametric room.json and not the USDZ: room.json keeps walls, doors,
windows and objects as separate things, so doorways can be cut as real gaps and
collision can tell a doorway from a window. A baked USDZ mesh cannot.

The viewer's own source lives in webviewer/src as ES modules; bundle() below
resolves and concatenates them into template.html. There is no npm toolchain on
purpose: the output has to be one file that opens with no server behind it, and
that is a concatenation, not a build system.
"""
import argparse, base64, json, math, os, re, statistics, sys
from pathlib import Path, PurePosixPath

# ---------- bundler ----------
IMPORT = re.compile(r"^import\s*\{[^}]*\}\s*from\s*'([^']+)';[ \t]*\n", re.M)


def bundle(entry):
    """Every module reachable from `entry`, dependencies first, as one script.

    Depth-first over the import graph, emitting each module after the ones it
    imports. A module already on the stack is a cycle — prints and modes each
    call into the other — and the back edge is dropped rather than followed:
    what crosses it is always a function declaration, which hoists, so the order
    only has to satisfy the modules whose top level runs at load.
    """
    order, state = [], {}

    def visit(path, parent):
        if state.get(path) in ('done', 'open'):
            return
        if not path.exists():
            sys.exit(f'{parent} imports {path}, which does not exist')
        state[path] = 'open'
        text = path.read_text(encoding='utf-8')
        for m in IMPORT.finditer(text):
            visit((path.parent / m.group(1)).resolve(), path)
        state[path] = 'done'
        order.append(path)

    entry = entry.resolve()
    visit(entry, entry)
    root = entry.parent
    out = []
    for path in order:
        name = str(path.relative_to(root))
        text = IMPORT.sub('', path.read_text(encoding='utf-8'))
        text = re.sub(r'^export (?=const |let |async |function |class )', '', text, flags=re.M)
        out.append(f'// ---------- {name} ' + '-' * max(3, 58 - len(name))
                   + f'\n{text.strip()}\n')
    # One scope, so the page leaves nothing of its own on window.
    return '(function(){\n' + '\n'.join(out) + '})();\n', len(order)

# Storeys are tinted bottom-up; the first two are the app's established colours.
PALETTE = [0xF2C230, 0x54C7EC, 0x9BE07A, 0xE88CC0, 0xC9A0FF, 0xFF9E6B]
STOREY_GAP = 1.2          # metres between floor levels before it counts as a new storey


# ---------- 4x4 helpers (RoomPlan stores column-major) ----------
def mat(a):
    return [[a[0], a[4], a[8],  a[12]],
            [a[1], a[5], a[9],  a[13]],
            [a[2], a[6], a[10], a[14]],
            [a[3], a[7], a[11], a[15]]]

def mul(A, B):
    return [[sum(A[i][k] * B[k][j] for k in range(4)) for j in range(4)] for i in range(4)]

def xf(M, p):
    v = list(p) + [1]
    return [sum(M[i][k] * v[k] for k in range(4)) for i in range(3)]

def inv_rigid(M):
    Rt = [[M[j][i] for j in range(3)] for i in range(3)]
    t = [M[i][3] for i in range(3)]
    ti = [-sum(Rt[i][k] * t[k] for k in range(3)) for i in range(3)]
    return [Rt[0] + [ti[0]], Rt[1] + [ti[1]], Rt[2] + [ti[2]], [0, 0, 0, 1]]

def yaw_of(M):
    """three.js Euler Y for a surface whose local +X runs along its width."""
    return math.atan2(-M[2][0], M[0][0])

def first_key(d, fallback='unknown'):
    return next(iter(d), fallback) if isinstance(d, dict) and d else fallback


def load_rooms(scan_dir):
    """Every room in the scan, already lifted into one shared world frame.

    `referenceOriginTransform` is inverted to get local -> world. That direction
    is not documented either way, so it was settled against this project's own
    capture: inverting puts the two storeys' footprints in 99.9% overlap with a
    2.66 m rise, while the other reading gives 25% overlap and stacks them upside
    down. See webviewer/README.md.
    """
    manifest = json.loads((scan_dir / 'manifest.json').read_text())
    labels, areas = {}, {}
    for seg in manifest.get('segments', []):
        for rec in seg.get('rooms', []):
            labels[rec['id']] = rec.get('label', 'Room')
            areas[rec['id']] = rec.get('floorAreaSqM', 0.0)

    rooms = []
    for seg in manifest.get('segments', []):
        for rec in seg.get('rooms', []):
            path = (scan_dir / 'segments' / seg.get('dir', seg['id'])
                    / 'rooms' / rec.get('dir', rec['id']) / 'room.json')
            if not path.exists():
                print(f'  ! {labels[rec["id"]]}: no room.json, skipped', file=sys.stderr)
                continue
            d = json.loads(path.read_text())
            W = inv_rigid(mat(d['referenceOriginTransform']))
            floors = d.get('floors') or []
            if not floors:
                print(f'  ! {labels[rec["id"]]}: no floor surface, skipped', file=sys.stderr)
                continue
            # Largest floor surface wins when RoomPlan reports several.
            def extent(f):
                pts = [xf(mul(W, mat(f['transform'])), c) for c in f['polygonCorners']]
                return ((max(p[0] for p in pts) - min(p[0] for p in pts)) *
                        (max(p[2] for p in pts) - min(p[2] for p in pts)))
            floor = max(floors, key=extent)
            poly = [xf(mul(W, mat(floor['transform'])), c) for c in floor['polygonCorners']]
            heights = [w['dimensions'][1] for w in d.get('walls') or []] or [2.4]
            rooms.append({
                'id': rec['id'], 'label': labels[rec['id']], 'area': areas[rec['id']],
                'W': W, 'doc': d, 'poly': poly,
                'y': statistics.median(p[1] for p in poly),
                'ceiling': statistics.median(heights),
            })
    return manifest, rooms


def storeys(rooms):
    """Group rooms into storeys by floor elevation."""
    out = []
    for r in sorted(rooms, key=lambda r: r['y']):
        if out and r['y'] - out[-1][-1]['y'] < STOREY_GAP:
            out[-1].append(r)
        else:
            out.append([r])
    return out


def build_scene(scan_dir):
    manifest, rooms = load_rooms(scan_dir)
    if not rooms:
        sys.exit('No rooms with geometry found in ' + str(scan_dir))

    groups = storeys(rooms)
    base = statistics.median(r['y'] for r in groups[0])
    allp = [p for r in rooms for p in r['poly']]
    cx = (min(p[0] for p in allp) + max(p[0] for p in allp)) / 2
    cz = (min(p[2] for p in allp) + max(p[2] for p in allp)) / 2
    to_scene = lambda p: [p[0] - cx, p[1] - base, p[2] - cz]

    levels, stairs = [], None
    for n, group in enumerate(groups):
        elev = statistics.median(r['y'] for r in group) - base
        walls, objects, sections, floors = [], [], [], []

        for r in group:
            W, d = r['W'], r['doc']
            floors.append({
                'poly': [[round(to_scene(p)[0], 3), round(to_scene(p)[2], 3)] for p in r['poly']],
                'ceiling': round(r['ceiling'], 3),
            })

            holes_by_wall = {}
            for kind in ('doors', 'windows', 'openings'):
                for h in d.get(kind) or []:
                    if h.get('parentIdentifier'):
                        holes_by_wall.setdefault(h['parentIdentifier'], []).append((kind[:-1], h))

            for w in d.get('walls') or []:
                M = mul(W, mat(w['transform']))
                c = to_scene([M[0][3], M[1][3], M[2][3]])
                inv = inv_rigid(M)
                hs = []
                for kind, h in holes_by_wall.get(w['identifier'], []):
                    HM = mul(W, mat(h['transform']))
                    lp = xf(inv, [HM[0][3], HM[1][3], HM[2][3]])
                    hw, hh = h['dimensions'][0], h['dimensions'][1]
                    hs.append({'k': kind,
                               'x0': round(lp[0] - hw / 2, 3), 'x1': round(lp[0] + hw / 2, 3),
                               'y0': round(lp[1] - hh / 2, 3), 'y1': round(lp[1] + hh / 2, 3)})
                walls.append({'c': [round(v, 3) for v in c],
                              'w': round(w['dimensions'][0], 3),
                              'h': round(w['dimensions'][1], 3),
                              'yaw': round(yaw_of(M), 5),
                              'conf': first_key(w.get('confidence'), 'medium'),
                              'holes': hs})

            for o in d.get('objects') or []:
                M = mul(W, mat(o['transform']))
                c = to_scene([M[0][3], M[1][3], M[2][3]])
                cat = first_key(o.get('category'), 'object')
                objects.append({'cat': cat, 'c': [round(v, 3) for v in c],
                                'd': [round(v, 3) for v in o['dimensions']],
                                'yaw': round(yaw_of(M), 5)})
                if cat == 'stairs' and stairs is None:
                    stairs = {'x': round(c[0], 3), 'z': round(c[2], 3)}

            for s in d.get('sections') or []:
                p = to_scene(xf(W, s['center']))
                sections.append({'label': s.get('label', 'room'),
                                 'x': round(p[0], 2), 'z': round(p[2], 2)})

        levels.append({
            'name': group[0]['label'] if len(group) == 1 else f'Level {n + 1}',
            'elevation': round(elev, 3),
            'ceiling': round(statistics.median(f['ceiling'] for f in floors), 3),
            'tint': PALETTE[n % len(PALETTE)],
            'areaSqM': round(sum(r['area'] for r in group), 2),
            'floors': floors, 'walls': walls, 'objects': objects, 'sections': sections,
        })

    return {
        'name': manifest.get('name', 'Scan'),
        'device': manifest.get('deviceModel', ''),
        'os': manifest.get('osVersion', ''),
        'levels': levels,
        'stairs': stairs,
        'storeyRise': round(levels[1]['elevation'] - levels[0]['elevation'], 3)
                      if len(levels) > 1 else 0,
    }


MIME = {'.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
        '.png': 'image/png', '.heic': 'image/heic', '.avif': 'image/avif'}


def in_poly(poly, x, z):
    hit = False
    j = len(poly) - 1
    for i, (xi, zi) in enumerate(poly):
        xj, zj = poly[j]
        if (zi > z) != (zj > z) and x < (xj - xi) * (z - zi) / (zj - zi) + xi:
            hit = not hit
        j = i
    return hit


def load_photos(path, scene, out_dir, inline):
    """Every photo in photos.json, tagged with the room it was taken in.

    The room a photo belongs to is a reading of the capture, not something
    RoomPlan recorded — so it lives in an editable JSON file rather than in
    code. `at` is a point inside the room in the same scene frame as the
    geometry; the app picks the wall to hang on from there.

    `inline` decides how the picture reaches the page. Linked, it is a relative
    URL and the page stays ~150 KB, which is the sane default: the browser
    caches each file, and a photograph that changes does not rewrite the HTML.
    Inlined, it is a base64 data URI — 38% bigger and uncacheable, but the whole
    walkthrough is then one file that works from a memory stick over file://,
    where a linked image would taint the canvas and cost the room its surfaces.
    """
    doc = json.loads(path.read_text())
    root = path.parent / doc.get('dir', '.')
    rel = os.path.relpath(root, out_dir)
    out, rooms, missing = [], [], 0
    # Finishes declared at the top of the file are every room's defaults — one
    # paint through the house, one floor — and a room's own entries win.
    defaults = doc.get('finishes') or {}
    for room in doc.get('rooms') or []:
        n = room['level']
        room['finishes'] = {**defaults, **(room.get('finishes') or {})}
        if not 0 <= n < len(scene['levels']):
            print(f'  ! {room["name"]}: no level {n}, skipped', file=sys.stderr)
            continue
        at = room['at']
        if not any(in_poly(f['poly'], *at) for f in scene['levels'][n]['floors']):
            print(f'  ! {room["name"]}: anchor {at} is not on {scene["levels"][n]["name"]}\'s '
                  'floor — its photos will land on the nearest wall anyway', file=sys.stderr)
        # A hall is a room you walk through and never photograph. Without an
        # anchor of its own it goes to whichever anchor is nearest, and a small
        # bathroom two metres away beats every other room in the house to it.
        # Declared here, it takes its finishes by name instead of by sampling.
        if not room.get('photos'):
            rooms.append({'level': n, 'name': room['name'],
                          'at': [round(v, 3) for v in at],
                          'floorFrom': room.get('floorFrom'),
                          'reach': room.get('reach'),
                          'finishes': room.get('finishes'),
                          'furnishings': room.get('furnishings'),
                          'place': room.get('place'),
                          'drop': room.get('drop')})
            continue
        for i, ph in enumerate(room['photos']):
            f = root / ph['file']
            if not f.exists():
                print(f'  ! {ph["file"]}: not found, skipped', file=sys.stderr)
                missing += 1
                continue
            mime = MIME.get(f.suffix.lower())
            if not mime:
                print(f'  ! {ph["file"]}: unknown image type, skipped', file=sys.stderr)
                missing += 1
                continue
            out.append({
                'level': n, 'room': room['name'], 'at': [round(v, 3) for v in at],
                'caption': ph.get('caption', ''), 'file': ph['file'], 'seq': i,
                'floorFrom': room.get('floorFrom'),
                'reach': room.get('reach'),
                'finishes': room.get('finishes'),
                'furnishings': room.get('furnishings'),
                'place': room.get('place'),
                'drop': room.get('drop'),
                'view': ph.get('view'), 'ground': ph.get('ground'),
                'land': ph.get('land'), 'lakeAt': ph.get('lakeAt'),
                'src': ('data:' + mime + ';base64,'
                        + base64.b64encode(f.read_bytes()).decode('ascii')) if inline
                       else PurePosixPath(rel.replace(os.sep, '/'), ph['file']).as_posix(),
            })
    if missing:
        print(f'  ! {missing} photo(s) skipped', file=sys.stderr)
    return out, rooms


def load_swatches(here, out_dir, inline):
    """The material swatches in swatches/, as name -> src, the way photos are.

    Linked by relative path, or inlined as data URIs for the one-file build:
    they are read into textures at dress time exactly as the photographs are
    read into surfaces, so they obey the same serving rules.
    """
    folder = here / 'swatches'
    manifest = folder / 'swatches.json'
    if not manifest.exists():
        return {}
    doc = json.loads(manifest.read_text())
    rel = os.path.relpath(folder, out_dir)
    out = {}
    for name, spec in (doc.get('swatches') or {}).items():
        f = folder / f'{name}.jpg'
        if not f.exists():
            print(f'  ! swatch {name}: not fetched (python3 webviewer/swatches/fetch.py), skipped', file=sys.stderr)
            continue
        out[name] = {
            'metres': spec.get('metres', 0.3),
            'src': ('data:image/jpeg;base64,' + base64.b64encode(f.read_bytes()).decode('ascii')) if inline
                   else PurePosixPath(rel.replace(os.sep, '/'), f.name).as_posix(),
        }
    return out


def edit_walls(scene, path):
    """Walls taken out, and floor put in, by annotation in photos.json.

    A closet the scan drew as a wall and a notch in the floor — the east
    bedroom's — is removed by naming the wall (`finishes.removeWalls`, by
    centre) and giving the room the floor the notch left out
    (`finishes.floorPatches`, polygons in the scene frame). The wall goes from
    the record before anything reads it; the patch is one more floor polygon
    on the storey, so walking, slabs, daylight and the plan all take it as
    floor.
    """
    doc = json.loads(path.read_text())
    removed, patched = 0, 0
    for room in doc.get('rooms') or []:
        n = room['level']
        if not 0 <= n < len(scene['levels']):
            continue
        level = scene['levels'][n]
        fin = room.get('finishes') or {}
        for at in fin.get('removeWalls') or []:
            before = len(level['walls'])
            level['walls'] = [w for w in level['walls']
                              if math.hypot(w['c'][0] - at[0], w['c'][2] - at[1]) > 0.1]
            if len(level['walls']) == before:
                print(f'  ! {room["name"]}: no wall at {at} to remove', file=sys.stderr)
            removed += before - len(level['walls'])
        for seg in fin.get('addWalls') or []:
            # A wall the scan never had, from one point to another at the
            # storey's ceiling height: the end of a closet strip opened to the
            # room, which was closed by a wall the scan did not record.
            (ax, az), (bx, bz) = seg['from'], seg['to']
            dx, dz = bx - ax, bz - az
            length = math.hypot(dx, dz)
            h = seg.get('h', level['ceiling'])
            level['walls'].append({'c': [round((ax + bx)/2, 3), round(level['elevation'] + h/2, 3), round((az + bz)/2, 3)],
                                   'w': round(length, 3), 'h': round(h, 3),
                                   'yaw': round(math.atan2(-dz, dx), 5), 'conf': 'annotated', 'holes': []})
            patched += 1
        for poly in fin.get('floorPatches') or []:
            level['floors'].append({'poly': [[round(x, 3), round(z, 3)] for x, z in poly],
                                    'ceiling': level['ceiling']})
            patched += 1
    return removed, patched


def cut_openings(scene, path):
    """Doors and openings the scan missed, cut into its walls from photos.json.

    RoomPlan records the openings it saw; a door it did not — the one from the
    garage into the laundry, behind a workbench — leaves a room sealed. A room
    may annotate `finishes.openings` with the wall (by its centre, as the
    fireplace does), a point along it, a width, a height and a kind, and the
    hole goes into the wall record before anything downstream reads it, so the
    panels, the collision, the flood fill, the daylight and the plan all see a
    doorway that is simply there.
    """
    doc = json.loads(path.read_text())
    cut = 0
    for room in doc.get('rooms') or []:
        n = room['level']
        for o in (room.get('finishes') or {}).get('openings') or []:
            if not 0 <= n < len(scene['levels']):
                continue
            walls = scene['levels'][n]['walls']
            wall = min(walls, key=lambda w: math.hypot(w['c'][0] - o['wallAt'][0], w['c'][2] - o['wallAt'][1]))
            if math.hypot(wall['c'][0] - o['wallAt'][0], wall['c'][2] - o['wallAt'][1]) > 0.1:
                print(f'  ! {room["name"]}: no wall at {o["wallAt"]} to cut an opening in', file=sys.stderr)
                continue
            along, width, height = o.get('along', 0.0), o['width'], o.get('height', 2.03)
            # An opening cut over a hole the scan already had replaces it — a
            # closet opened across its width has no use for its old door's
            # casing hanging in the middle of the new opening.
            x0, x1 = along - width / 2, along + width / 2
            wall['holes'] = [h for h in wall['holes'] if not (h['x0'] >= x0 - 0.01 and h['x1'] <= x1 + 0.01)]
            wall['holes'].append({'k': o.get('kind', 'door'),
                                  'x0': round(along - width / 2, 3), 'x1': round(along + width / 2, 3),
                                  'y0': round(-wall['h'] / 2, 3), 'y1': round(-wall['h'] / 2 + height, 3)})
            cut += 1
    # Door styles annotate existing scan holes, without opening another gap.
    for room in doc.get('rooms') or []:
        n = room['level']
        for spec in (room.get('finishes') or {}).get('doors') or []:
            if not 0 <= n < len(scene['levels']):
                raise ValueError(f'{room["name"]}: invalid door level {n}')
            candidates = [(w, h) for w in scene['levels'][n]['walls']
                          if math.hypot(w['c'][0] - spec['wallAt'][0],
                                        w['c'][2] - spec['wallAt'][1]) < 0.1
                          for h in w['holes'] if h['k'] == 'door'
                          and abs((h['x0'] + h['x1']) / 2 - spec['along']) < 0.1]
            if len(candidates) != 1 or spec['style'] != 'closet-slider':
                raise ValueError(f'{room["name"]}: ambiguous or unsupported door annotation {spec}')
            candidates[0][1]['style'] = spec['style']
    return cut


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    here = Path(__file__).resolve().parent
    ap.add_argument('scan', nargs='?', default=str(here.parent / 'floor-data-saved'),
                    help='scan directory holding manifest.json (default: ../floor-data-saved)')
    ap.add_argument('-o', '--out', default=str(here / 'index.html'))
    ap.add_argument('--template', default=str(here / 'template.html'))
    ap.add_argument('--src', default=str(here / 'src'),
                    help='module tree to bundle (default: webviewer/src)')
    ap.add_argument('--photos', default=str(here / 'photos.json'),
                    help='photo-to-room map (default: webviewer/photos.json)')
    ap.add_argument('--no-photos', action='store_true',
                    help='geometry only — leaves the output a few hundred KB')
    ap.add_argument('--inline-photos', action='store_true',
                    help='embed the photographs in the HTML instead of linking '
                         'them: one portable ~5 MB file that also works over '
                         'file://, at the cost of caching')
    args = ap.parse_args()

    scene = build_scene(Path(args.scan))
    photos, declared = [], []
    pjson = Path(args.photos)
    out_dir = Path(args.out).resolve().parent
    if pjson.exists():
        removed, patched = edit_walls(scene, pjson)
        if removed or patched:
            print(f'  {removed} wall(s) removed, {patched} wall(s) or floor patch(es) added from photos.json annotations')
        cut = cut_openings(scene, pjson)
        if cut:
            print(f'  {cut} opening(s) cut from photos.json annotations')
    if not args.no_photos and pjson.exists():
        photos, declared = load_photos(pjson, scene, out_dir, args.inline_photos)
    swatches = load_swatches(here, out_dir, args.inline_photos) if not args.no_photos else {}

    html = Path(args.template).read_text()
    if '/*__BUNDLE__*/' not in html:
        sys.exit(f'{args.template} has no /*__BUNDLE__*/ placeholder')
    code, nmods = bundle(Path(args.src) / 'main.js')
    html = html.replace('/*__BUNDLE__*/', code)
    for token, value in (('/*__HOUSE__*/null', scene), ('/*__PHOTOS__*/null', photos),
                         ('/*__ROOMS__*/null', declared), ('/*__SWATCHES__*/null', swatches)):
        if token not in html:
            sys.exit(f'{args.src} has no {token} placeholder')
        html = html.replace(token, json.dumps(value, separators=(',', ':')))
    Path(args.out).write_text(html)

    size = Path(args.out).stat().st_size / 1024
    print(f'{args.out}  ({size / 1024:.1f} MB)' if size > 1024 else f'{args.out}  ({size:.0f} KB)')
    print(f'  {nmods} modules bundled')
    for n, L in enumerate(scene['levels']):
        holes = sum(len(w['holes']) for w in L['walls'])
        shots = sum(1 for p in photos if p['level'] == n)
        print(f'  {L["name"]:<12} {L["elevation"]:+.2f} m  {len(L["walls"]):>3} walls  '
              f'{holes:>2} openings  {len(L["objects"]):>2} fittings  {L["areaSqM"]} m²'
              + (f'  {shots:>2} photos' if photos else ''))
    if photos:
        rooms = len({(p['level'], p['room']) for p in photos})
        how = 'inlined' if args.inline_photos else 'linked'
        print(f'  {len(photos)} photos across {rooms} rooms, {how}')
    if swatches:
        print(f'  {len(swatches)} material swatches')


if __name__ == '__main__':
    main()
