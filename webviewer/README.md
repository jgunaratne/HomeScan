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
| `N` | Nano Banana — this view handed back as a photograph |
| `Tab` | Section view — a dollhouse with a storey-separation slider |

## Nano Banana

The `Nano Banana` button in either toolbar — or `N` — takes the frame on screen,
posts it to Gemini's image model, and puts the photograph that comes back over
the whole viewport at the size the walkthrough itself runs at. `N` again flips
back to the live view, and again to the photograph. That is the point of it: the
same room from the same camera, one of them measured and one of them imagined,
compared by flipping rather than by putting two small pictures side by side.

The geometry is sketch-grade LiDAR and the paint is lifted off a handful of
photographs, so the walkthrough is credible as a survey and never as a picture.
This is the one place it stops pretending.

Three states, and no more: the photograph over everything, the live view with a
chip in the corner to get back to it, and gone. The keyboard belongs to the
walkthrough again the moment the photograph is out of the way, so you can walk
somewhere else and flip back — the header says the view has moved when it has,
and `Render again` takes a fresh one from wherever you now stand. Clicking the
photograph is the same as pressing `N`; `Esc` throws it away.

```sh
cp .env.example .env       # at the repo root
# GEMINI_API_KEY=…         from https://aistudio.google.com/apikey
npm start
```

The key is read by `serve.mjs` and never reaches the page — this is a server
route, not a `fetch` from the browser, and that is the whole reason for it.
A viewer opened straight off disk has no server behind it, so the button says so
rather than failing silently. `GEMINI_IMAGE_MODEL` overrides the model; the
default is `gemini-3.1-flash-image`, and a 404 on it falls back to
`gemini-2.5-flash-image`, which not every key is cleared past.
`curl localhost:5173/api/nano-banana` reports whether a key was found without
spending one.

**The brief matters more than the model.** The first version of it led with what
had to be preserved — keep the camera, keep the geometry, add nothing — and
gemini-2.5-flash-image obliged by handing the render straight back with the
bricks slightly redrawn. The instruction that works leads with the change (an
untextured model render, reproduced as a photograph on a 24 mm lens, every
surface given a real material and real daylight) and fences the geometry after
it. On the same frame, the same brief and the newer model is the difference
between a tidier render and a photograph. Whatever is typed into the field on the
bar is appended, so "at dusk" or "in winter" is a sentence, not a rewrite.

The frame is captured straight off the drawing buffer, which is readable only
inside the task that drew it — this renderer has no `preserveDrawingBuffer` — so
`renderFrame()` and the read happen without yielding in between. It goes up as a
JPEG no wider than 1536 px: the model resamples to about a megapixel anyway. What
comes back fills the viewport with `object-fit: cover`, so the two views line up
under the flip instead of one of them being letterboxed.

What comes back is generated. It is a picture of what the scan guessed, at the
resolution of a model's idea of a house, and it is not evidence of anything.

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
that reaches its wall's top now grows to meet the ceiling. The stair keeps its measured box in the survey. A photo annotation now
supplies its ascent direction for the dressed flight described below.

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

**Daylight shared by the room and its furnishings.** The dressed materials now
sample a directional lighting volume per storey rather than darkening only wall
and floor colours. A 32 cm grid at eight heights stores window energy and its
incoming direction. Each window is sampled at sixteen points, with visibility rays
clipped against the scan walls, door/window openings, inferred roof slopes, and
large opaque cabinets/appliances. Interior doors transfer bounce but do not emit
daylight. The connected-floor sky bake supplies a restrained diffuse bounce term.

A material shader interpolates this field at the fragment's world position and
uses its normal, so window-facing paint, shaded ceiling slopes, trim and furniture
share the same illumination. The exterior environment supplies restrained
reflections instead of unblocked indoor diffuse light. The sun still casts direct
shadows; its map is 4096 pixels with a tighter frustum and less normal offset to
reduce bright leaks at wall joints. The static shadow map is refreshed when
storey, furniture visibility or section placement changes, rather than on camera
movement. Display palette colours are decoded to linear
before lighting, retaining the timber and upholstery colour.

This is a low-frequency approximation, not path tracing: sixteen window samples,
coarse spatial interpolation, and cabinet bounding boxes cannot reproduce every
contact shadow. Movable furniture is not rebaked when hidden. The fields follow
the storeys in section view and remain active with the optional lens disabled.

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
So the sun is left to make the patch on the floor and the window lighting volume supplies the indoor bounce.

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
rather than a colour of their own; and furniture proportions are inferred from RoomPlan bounds rather than exact
models of the photographed pieces.

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

## Furniture rendering

The dressed view uses bevelled furniture geometry, individually modelled sofa
cushions and accent pillows, textured bedding, recessed basins, curved ceramic
fixtures, and appliance controls and door rims. Wood, fabric and stone use small,
deterministic canvas textures with matching bump maps; no additional assets or
network requests are needed. The scan still determines object position and size.
These are representative furnishings, not replicas of the photographed products.
The flat survey and furniture toggle retain the original scan boxes and bounds.

Architectural details include bevelled casing with raised edge beads, two-sided
Shaker-style door rails, lever handles and hinge barrels, plus ceiling downlights
with separate trim rings and dark baffles. Door styling and hardware are inferred;
the scan supplies the openings. Unclaimed floor strips stop at footprint gaps,
so dressing does not bridge empty space outside the scan.

### Photo-guided realism

Optional `finishes` on a room in `photos.json` now records reviewed material
choices. `floor: "timber"` builds a 1.55 m tile with ten 155 mm boards, staggered
joints, and separate colour, normal, and roughness maps. The room's extracted
floor colour supplies the palette; board layout and grain are inferred. Living
room, great room, and west bedroom use this finish, and the living room and kitchen
borrow the great room floor through `floorFrom` to keep the connected boards continuous. Other rooms retain their
photographic patches. The shared world-space UVs keep board direction consistent.

Kitchen `cabinetUpper`, `cabinetLower`, `counter`, and `hardware` colour values
match the cream, grey-blue, warm stone, and metal finishes visible in its photos.
They apply to storage in that room through cloned materials. Cabinet fronts have
raised rails, upholstery has quieter weave and cushion piping, and bedding has
shallow folds and a turned-back sheet. The photos show mostly empty rooms, so
furniture continues to be a representative interpretation of the scan bounds.

Window sash rails, gaskets, and sill tracks give glass a recessed seat. Lighting
uses depth-aware ambient-occlusion filtering to preserve contact edges. Ceiling
triangle winding now agrees with its downward normals, and shorter slab quads
smooth the baked daylight interpolation. Normal maps use linear encoding, colour
maps use sRGB, and reduced film grain keeps painted surfaces cleaner. The lens
still falls back automatically on slower devices; this is not ray-traced lighting.


### Staircase, fireplace, and indirect daylight

The entry room's `finishes.stair` records `riseToward` along the stair object's
local Z axis and `railSide` along local X. The dressed staircase uses the scanned
width, run, position, and rotation, with its rise taken from the next storey's
elevation. White risers and stringers, timber treads and handrail, and dark metal
balusters follow the living-room photos. Tread count and railing proportions are
inferred. Matching openings are cut into the dressed lower ceiling and upper
floor; the flat survey retains the captured slabs. Stairs stay visible when
furniture is hidden. Navigation still uses **E** to switch storeys; treads do not
provide continuous vertical walking or fall simulation.

The scan does not classify a fireplace. The living room's `finishes.fireplace`
therefore explicitly annotates its wall centre and estimated width, height, and
depth. Dressing requires a matching solid wall with no intersecting opening.
The brick surround, arched unlit insert, projecting hearth, and timber mantel
follow the photographs between the two windows. Brick courses use instancing;
this adds no texture downloads. It is decorative photo-guided geometry, not a
new measured object or collision boundary, and appears only in the dressed view.

The daylight bake now diffuses an indirect term through connected open cells,
with solid walls stopping propagation and doorways admitting it. Smoothing also
respects those boundaries. This softens the falloff away from windows without
adding per-room lights or per-frame ray tracing. It remains an approximation of
bounced light, not a physically solved illumination model.

Run `npm test` for stair-cut area and boundary checks and the sealed-room daylight
regression. These checks use Node alone and require no dependency installation.

### Near exterior and reviewed material patches

`finishes.deck` attaches a photo-guided deck to a matching wall containing a door.
Its `wallAt`, `width`, and `depth` describe the inferred attachment and size. The
upper family room now has weathered boards, cable railings, posts, and open pergola
beams based on its deck photos. It follows its storey in the separated view and
hides with photo surfaces. Nearby instanced shrubs and a photo-textured lawn add
parallax and receive daylight; plant placement is inferred and kept clear of the
scanned footprint. The distant lake remains a photographic backdrop. The deck
is visual context, not a new navigable area or measured exterior survey.

`finishes.samples` selects explicit material patches using
`{"file": "room-photo.webp", "rect": [x, y, width, height]}` in normalized image
coordinates. Reviewed samples currently cover living-room paint and fireplace
brick, great-room paint, ceiling and timber colour, and kitchen countertop stone.
They are decoded from the existing photos and flattened to reduce baked lighting.
Brick and countertops use the reviewed texture itself; the timber generator uses
the selected floor palette. Automatic selection remains the fallback for missing
photos or invalid rectangles. No new image downloads are required. `npm test`
checks rectangle bounds and that each configured source belongs to its room.

The sky probe is now preserved separately from the lawn probe, so sampling grass
cannot replace the sky's top colour in the reflection environment.

### Rendering and room cleanup

Dressed rendering keeps ACES highlight rolloff when the optional lens is disabled
or the frame-budget fallback activates. The lens path continues to tone-map only
in its composite, and the flat survey retains its original rendering. Sun and
fill intensity, bloom, and matte furnishings' environment response are reduced
to preserve more material detail in bright areas.

Furniture bevels now have vertices at the bevel boundary, so broad panels remain
flat instead of interpolating corner shading across an entire board or cabinet.
Furniture facing uses distance to the wall surface and ignores perpendicular
side walls. Open-door placement checks along the leaf rather than just its centre,
reducing intersections with short return walls.

`finishes.wall: "paint"` flattens automatic wall patches to their extracted colour;
this removes repeated photographic fixtures and shadows from the annotated
bedrooms, family room, laundry, and entry. Bathroom wall patches retain their
texture. This pass was reviewed from a viewpoint in each of the twelve photo
rooms; the original scan and inferred room boundaries still limit placement.

Wall-face material lookup now prefers room anchors with an unobstructed segment
through the scan's wall blockers. This reduces bathroom texture leaking onto
adjacent bedroom faces. A nearest-anchor fallback remains for incomplete scans
or anchors without a clear segment; inferred room boundaries are not exact.

Photo-inferred roof wedges now replace portions of the east and south bedroom
ceilings. `finishes.roof` stores an oriented plan rectangle, high/low heights
above the storey, and its scan yaw. The slope has closed vertical returns;
its footprint is subtracted from the dressed slab, and generic downlights are
omitted in these rooms. The survey retains its measured flat ceiling. These
roof dimensions are visual estimates, with the east soffit limited to the
end-wall band to keep the scanned high window clear; they are not roof measurements.
Both rooms now use photo-coloured timber boards. Paint has independent fine
bump texture, and timber has finer grain and softened board-edge relief.

The lens now uses depth-aware colour filtering for soft reflections and focus,
so distant window colours are less likely to smear across nearby surfaces.
Reflections are restricted to the two storeys' floor elevations, use Fresnel
falloff and premultiplied confidence, and blend with the scene instead of adding
brightness. Ray hits use a tighter thickness tolerance. Depth of field and
vignette are restrained, with grain applied after the sRGB display conversion.
This remains screen-space rendering: off-camera objects cannot be reflected.
Validation: browser shader compilation, both render paths, survey toggling and
resize at 1280×800 and 800×600, plus the geometry/material unit suite.


The entry now shares the great room's continuous timber floor and uses a reviewed
paint sample from the entry photo. Stair flights have a closed painted underside
and timber end posts. Door frames include recessed jamb liners and stops, with
handles on the latch edge and hinges at the actual pivot. The scan still contains
no interior garage doorway; these details do not add an inferred connection.

The walkthrough can now hand its own frame to Gemini and show the photograph that
comes back, behind a `Nano Banana` button in both toolbars and the `N` key. The
key lives in `.env` at the repo root and is read by the server, so the page never
holds it; a viewer opened off disk reports that rather than failing. Validation:
the .env parser and the request shape under the unit suite, plus a headless
browser run of the whole path — capture, post, swap, save, Escape — against the
live model, with the prompt field proved not to fire the viewer's single-letter
toggles.

The photograph now fills the viewport and `N` flips between it and the live view,
rather than opening a card with the render beside it. Two things came out of
building it. The bundler's export-stripping regex knew `const`, `let`, `function`
and `class` but not `async`, so `export async function` survived into the page as
a SyntaxError that took the whole viewer down; the suite now parses the built
bundle and checks every export in `src/` against the form the regex recognises.
And an absolutely positioned box at `left:50%` is only offered the half of the
line that remains, so both toolbars had been shrink-to-fitting into 640 px on a
1280 px screen and wrapping to two rows; they are centred by auto margins now.
Validation: the unit suite, plus a headless browser run of the whole path —
render, flip, walk, flip back to the moved-view marker, save, Escape — against
the live model.
