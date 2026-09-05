# webviewer — walk a scan

A first-person walkthrough of a HomeScan scan. `index.html` is ~140 KB and links
the room photographs as ordinary files beside it; nothing else is fetched at
runtime except three.js from a CDN. Every room takes its wall, floor and ceiling
from the pictures taken in it.

Serve the folder rather than double-clicking the file. The surfaces are lifted
out of the photographs by reading them back pixel by pixel, and a browser will
not allow that for a linked image over `file://` — the page says so in the
console and stays the flat survey. For a copy that works anywhere, including
from a memory stick:

```sh
python3 webviewer/build.py --inline-photos -o walkthrough.html
```

That embeds the pictures as data URIs: one portable file, ~5 MB, 38% bigger than
the photographs themselves and re-downloaded in full whenever anything changes.
It is the right build to hand someone and the wrong one to develop against.

```sh
npm start                  # serve on http://localhost:5173 and open a browser
npm run dev                # same, rebuilding whenever the source changes
npm run build              # regenerate index.html only
```

No dependencies and no `npm install` — the server is a single file on Node's
standard library, so a fresh clone works offline. `npm start` regenerates
`index.html` first if `template.html` or `build.py` is newer, and carries on
serving the committed file if that rebuild cannot run.

```sh
npm start -- --port 8080   # different port
npm start -- --no-open     # don't launch a browser
python3 webviewer/build.py path/to/scan-dir   # any scan in the SPEC §5.1 layout
python3 webviewer/build.py <scan> -o out.html
python3 webviewer/build.py --no-photos        # geometry only, ~130 KB
python3 webviewer/build.py --inline-photos    # one portable file, ~5 MB
```

`build.py` reads `manifest.json` and each room's `room.json`, bundles `src/` into
`template.html` at the `/*__BUNDLE__*/` placeholder, and writes the geometry in at
`/*__HOUSE__*/null`. It does the same for `photos.json` at `/*__PHOTOS__*/null`.
Edit `src/` and `template.html`, never `index.html` — the latter is generated.

## Layout

`template.html` is markup and CSS. The viewer itself is ES modules under `src/`,
bundled into the page by `build.py`:

```
src/
  main.js         the boot sequence, and nothing else
  core/           data, constants, state, units, geometry, the $ helper
  scene/          renderer and lights, materials, joinery, fittings, the storeys
  photo/          what the photographs pay for: rooms, relighting, sky, the
                  world outside, the prints, and the dressing pipeline
  player/         collision, pointing at the floor, movement, input
  ui/             the HUD, the plan, the lightbox, the two toolbars
  render/         the post-processing chain and the frame loop
```

Two rules hold the structure up.

**State that changes lives in `core/state.js`**, on objects — `player`, `nav`,
`view`, `flags`, `pointer`, `focus` — rather than as loose `let`s. A module may
not assign to a name it imported, so the field is the seam: `flags.surfaced = on`
is legal from anywhere, `surfaced = on` would not be.

**Nothing happens at import time that could happen in `main.js`.** Modules define
things; `main.js` calls them in order. That is why the boot sequence is readable
in one screen, and why a module's position in the bundle is not load-bearing.

The bundler is 30 lines in `build.py`: depth-first over the `import` statements,
each module emitted after the ones it imports, then the `import`/`export`
keywords stripped and the whole thing wrapped in one function scope. Cycles —
`photo/prints.js` and `ui/modes.js` call into each other — drop the back edge;
what crosses it is always a hoisted function declaration. There is deliberately
no npm toolchain: the output has to be a single file that opens from a memory
stick with no server behind it, and that is a concatenation, not a build system.

## Controls

| | |
|---|---|
| Click the floor | Walk there |
| Drag / wheel | Look around / step forward |
| `W A S D`, Shift | Move, stride |
| `E` | Take the stairs, at the stairwell |
| `1`…`9` | Jump to a storey |
| `F` / `G` | Show or hide furniture / pass through walls |
| `P` | The dressed house, or the flat survey |
| `O` | Hang the photographs themselves as prints |
| Click a wall | Open the pictures that room's surfaces came from |
| Click a print | Open it full size · `←` `→` for the rest of that room, Esc to close |
| `Q` | Take the lens off — occlusion, bloom, focus, grain |
| `Tab` | Section view — a dollhouse with a storey-separation slider |

## The photographs

The scan carries geometry and nothing at all about how the house looks. The
photographs are what the surfaces are made of: every wall face, floor and ceiling
is assigned to a room, and each room's material is lifted out of its own
pictures — a patch of plain wall, a patch of floor, a patch of ceiling, tiled at
real-world scale (1.15 m, 1.55 m, 1.9 m per repeat, mirrored so there is no seam).

**How a patch is chosen.** Each photograph is read down to 320 px and scanned
with a 24 px window over the band where that surface tends to sit — the top
tenth for ceiling, the middle third for wall, the bottom quarter for floor.
Blown-out windows and black voids are dropped, and the winner is the flattest
patch that also sits closest to the band's own median colour, which is what picks
painted wall over the picture hanging on it. Whichever of the room's photographs
yields the best patch wins. The patch is then re-cut from the full-resolution
original and pulled toward its own mean, so a photograph's baked-in light does
not tile as banding. A ceiling goes all the way to flat colour — a ceiling is
paint and only ever paint, and tiling a 128 px crop of one across a 15 m room is
what makes it speckle. Floors keep most of their contrast, because the grain is
the point.

**How a surface finds its room.** Anchors are room centres, so a point belongs to
whichever anchor is nearest within 9 m. A wall has two faces and they are asked
separately — the kitchen side of the bathroom wall is kitchen — which BoxGeometry
supports directly, one material group per face. Floors and ceilings arrive as one
slab per storey, so they are re-cut: a 10 cm grid over the footprint, each cell
tagged with its room, each row's runs merged into quads. Boundaries land on that
grid, which is finer than the walls that sit on top of them. Rooms with no
photograph — the garage, the halls — keep the flat survey palette, and `P`
returns the whole house to it.

**What else the dressing turns on.** Paint alone still reads as a diagram, so `P`
carries the rest of it: skirting on every stretch of wall that reaches the floor,
a cased head and two jambs on every door and opening, a cased and silled surround
on every window, and downlights on a 2.4 m grid over each room's own ceiling.
Fittings stop being blue-grey blocks and become what they are — white goods
white, the refrigerator steel, the television black, tables and chairs timber.
Clear glass replaces the blue pane. The survey's wireframe comes off, because it
is how you read a sketch and the last thing a room needs. Daylight comes in off
the lake instead of a flat studio fill, and the draw distance opens from 40 m to
62 m so the far side of the house falls away rather than vanishing.

Two things this changed in the geometry. Ceilings sit at the storey's *median*
wall height, so a wall shorter than that left a slot open at the top — harmless
against a black background, a bright line of sky once there is a sky; any panel
that reaches its wall's top now grows to meet the ceiling. And the stair, a
storey-tinted volume you can see through in the survey, becomes timber: RoomPlan
gives a box rather than treads and does not say which way it climbs, so a box is
all this claims.

**Fittings.** RoomPlan reports a fitting as a category, a size and a transform:
a sofa is a 1.94 × 1.05 × 0.85 box that knows it is a sofa. That is exactly the
input a parametric maker wants, so rather than draw the box, each category is
built out of it — a sofa as base, back, arms and cushions; a bed as divan,
mattress, pillows and a headboard against the wall; a run of storage as carcass,
door fronts with a reveal and a handle, toe kick, and a worktop where it is a
base unit. Which way a fitting faces is not in the data either, so it is taken
to face away from the wall it stands against; a fridge with its doors to the
wall is worse than a box. Nothing here is measured — the proportions are the
ordinary ones, hung on dimensions that are real. The survey keeps the boxes,
because a block is the honest drawing of a bounding box and this is not that.

Openings are trimmed after every wall is up: a door leaf has to know what it
would swing into. All four ways of hanging it are tried and the first that lands
on clear floor wins; a doorway too tight to swing into simply has no leaf.

**How much sky each surface can see.** One hemisphere light means a corner eight
metres from the glazing is exactly as bright as the sill, which was the most
artificial thing left. There is no global illumination here, but the plan knows
where light gets in: solid wall stops it, an opening does not. Each storey is
rasterised once — walls blocked, every door, window and opening punched back
open — and from each cell a fan of 24 rays walks until it hits something or
leaves the building. The fraction that get out is baked into the vertex colours
of the walls, floors and ceilings, so rooms go bright at the glass and fall away
into their corners because of where the windows are, not because a number was
chosen. Ceilings sit deeper than floors: light arrives from below and from the
window head, and a ceiling as bright as its floor is the giveaway of a fake room.

Walls are segmented at roughly 0.7 m so the term can vary across one rather than
only between its corners, and a low-frequency mottle rides on top — real paint on
real plaster is never one tone across four metres, and perfectly even colour
reads as plastic.

**The lens.** three.js ships its post-processing in `examples/js` and this file
loads only the core UMD build, so the chain is written out in `src/render/passes.js`:
the scene into a linear half-float buffer, ambient occlusion off the depth, a
bloom pyramid, a composite that also does depth of field and ACES, and FXAA to
put back the edges that rendering off-screen took away. Occlusion normals are
rebuilt from depth derivatives rather than rendered again — one fewer pass over
the scene, and the difference does not survive the blur. Depth of field gets its
own quarter-size blur of the full image; the first version economised by reusing
the bloom pyramid, which is the bright pass, and everything soft came back milky
with the windows smeared through it.

Screen-space reflections run over the floors. There is no G-buffer, so which
pixels are floor is decided the only way available: rebuild the normal from
depth and keep the ones facing up. The normal has to be turned toward the camera
first — flipping it toward world up instead, as the first version did, makes
every ceiling pass for a floor and reflect the room onto itself. What is
off-screen is not reflected; that is the standing bargain with the technique.

`Q` takes it off. It comes off by itself, once, if the frame budget goes for a
couple of seconds — five full-screen passes and a 2048 shadow map is a lot to
ask of a laptop. The survey never had it: that view wants to be legible, not
photographed, and a crisp aliased edge is easier to measure against.

**Light.** Surfaces are `MeshStandardMaterial`, so roughness is what separates
eggshell paint from a satin worktop from a stainless door, and a height field
read off each patch's own luminance gives the boards their grain and the tile
its grout. There is an environment to reflect — the same sky, horizon and ground
again, small and equirectangular — because a polished floor with nothing to
reflect reads as matte plastic.

The sun casts. Without a shadow map it lit every wall in the house at once,
inside and out, and no room ever had a lit side and a dark one. With one, almost
nothing reaches indoors — which is true, and useless, because what lights a room
is daylight bouncing off every surface and there is no global illumination here.
So the sun is left to make the patch on the floor and the sky term stands in for
the bounce.

**The world outside.** Rooms read as sealed boxes until the windows have
something behind them, and nothing in the scan knows what that is. The
photographs do: one photo in `photos.json` carries `"view"` and `"ground"` —
`[x, y, w, h]` in 0..1 of that picture — naming the crop the outside is built
from. Here it is the deck shot: sky, the far hills, the lake. The crop is wrapped
four times round a 140 m cylinder with the photograph's own sky graded above it
and its own lawn below, and a 34 m disc of grass under the house. It is a
backdrop, not a place — it does not parallax and it is not to scale — but the
view out of the window is the real one, and it is what tells you the house looks
at water.

**The prints.** `O` hangs the photographs themselves on the wall of the room they
came from, on the nearest solid stretch that faces the room's anchor, that you
can see from it, and that no other room's anchor sits closer to. `panels()` has
already cut the doors and windows out, so a slot is solid by construction — a
print never lands over an opening. Where the wall is short or narrow the picture
shrinks to fit. Clicking a wall does the same job without them: it opens the
pictures that room's paint was lifted out of.

**When a room shows no floor.** Every kitchen photograph here is taken across the
island, so the bottom of the frame is worktop and the extracted "floor" came back
grey stone. `"floorFrom": "<room>"` borrows another room's boards — the kitchen
takes the great room's, which is the same floor running through. It is the one
manual correction in the file, and the place to make more.

**What it will not do.** There are no camera poses in these photographs, so
nothing is projected and nothing claims to put a pixel back where it was seen.
This is a house dressed in its own materials, not a reconstruction of it: the
paint, the boards, the tile and the view are the real ones, and where they sit on
the wall is not. Pixel-exact would need the poses — either solved by
photogrammetry from a denser set than 31 wide-angle shots of empty painted rooms,
or, far more cheaply, recorded at capture: an ARKit session already knows the
camera transform of every frame, so stills taken during the RoomPlan scan would
come with poses attached and could be projected properly.

Known tells: a bathroom photographed from its doorway can hand back counter
rather than floor; a low-confidence wall, brown in the flat survey, is painted
like any other here; surfaces no room claims take the house's average paint
rather than a colour of their own; and fittings are RoomPlan's bounding boxes in
the right material, not furniture.

```json
{"level": 0, "name": "Kitchen", "at": [-2.6, -2.4], "floorFrom": "Great room",
 "photos": [{"file": "…webp", "caption": "Range wall and the window over the sink"}]}
```

`at` is `[x, z]` in metres in the scene frame `build.py` builds — origin at the
centre of the footprint, `+X` east, `+Z` south, level 0 at the ground. It is the
room's anchor twice over: it decides which surfaces are that room's, and which
wall a print hangs on. Anchors off the floor are warned about at build time.
Point a room somewhere else, or move a photo between rooms, by editing that file
and rebuilding.

**What the mapping is and is not.** RoomPlan labelled six sections per storey,
four of them usefully (`livingRoom`, `kitchen`, `bathroom`, `bedroom`); the rest
of the naming here — great room, entry, laundry, which of the three upstairs
bedrooms — is a reading of the capture against the photographs. The rooms carried
by the geometry are solid: the kitchen has the refrigerator and both ovens, the
laundry has the washer/dryer, the entry has the front door and the stair, the
upper family room has the 2.07 m clerestory band and the 1.66 m slider that the
two deck photographs look back through. Which bedroom is which is the judgement
call, and `photos.json` is where to correct it. The scan's own sixth space
downstairs — windowless, one 5.35 m opening — reads as the garage, and no
photograph was taken of it.

## Why room.json and not the USDZ

`room-parametric.usdz` is a baked mesh: a wall with a door in it is just
triangles. `room.json` keeps walls, doors, windows and objects as separate
records, which is what makes the rest possible — doorways become real gaps you
walk through, windows stop you, and furniture can be toggled and collided with
independently.

## Three decisions worth knowing

**Which way `referenceOriginTransform` goes.** Apple does not document whether it
maps room-local to world or the reverse, and the two readings differ by a whole
storey. Settled empirically against this project's own capture: inverting it puts
the two storeys' footprints in **99.9% overlap** with a 2.66 m rise, while the
other reading gives 25% overlap and stacks the storeys upside down. `build.py`
inverts. If a future scan comes out stacked wrongly, this is the line to revisit.

**Walls are decomposed, not cut.** `panels()` in the app sweeps each wall's width,
subtracts each opening's height range from that column, and emits the solid
rectangles that remain. Exact for the rectangular holes RoomPlan reports, and far
cheaper than CSG.

**Collision stops at the shoulder, not the eye.** The body band is 0.20–1.50 m.
RoomPlan reports door headers as low as 1.63 m in this capture, so blocking to
full eye height walls off real doorways; window sills start at 0.82 m, so they
still stop you.

## Known limitations

- **Storeys are grouped by floor elevation** (`STOREY_GAP`, 1.2 m). A scan whose
  rooms were captured one-per-floor works as-is; a scan with many rooms per floor
  is merged into one storey per elevation cluster, which is right, but each room
  keeps its own ceiling height rather than sharing one.
- **Segments are not registered against each other.** Rooms captured after a
  tracking loss have unrelated world origins, and `build.py` places them all by
  their own reference origins — so a multi-segment scan may not line up. This
  scan is a single segment.
- **Rooms the scan sealed.** If RoomPlan recorded no doorway into a space, there
  is no opening to render. The app floods each floor at load, tints any
  unreachable region on the plan, and says so; `G` walks through walls to get in.
  In `floor-data-saved` this affects 26.9 m² downstairs — five high-confidence
  walls, none with an opening.
- Sketch-grade throughout. Same caveat as the app: good for space planning, not
  for anything anyone will bid against.
