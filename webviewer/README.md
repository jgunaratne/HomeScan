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
npm start -- --host 127.0.0.1   # loopback only, for a deployment behind nginx
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

## Serving it on the LAN

On the Pi this repo lives on, the walkthrough is a system service at
**http://house.local**, following the pattern the other sites on that box use:
`serve.mjs` on loopback port 3010, an nginx vhost in front of it, and an avahi
alias publishing the name for whatever address DHCP has handed the host.
Everything for it is in `webviewer/deploy/`, and one command installs or
re-installs the lot:

```sh
sudo webviewer/deploy/install.sh
```

It is HTTP only, on purpose — the viewer needs no secure context, and one name
over one scheme skips the self-signed interstitial — and unauthenticated like
its neighbours. The service rebuilds `index.html` on start when the source is
newer, so after editing `src/` or `photos.json`: `sudo systemctl restart house`.
The Nano Banana button reports "no key" until a `.env` with `GEMINI_API_KEY`
exists at the repo root; add one and restart the service.

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
| `N` | Nano Banana — flip between this view and a photograph of it |
| Click a wall | Open the pictures that room's surfaces came from |
| Click a print | Open it full size · `←` `→` for the rest of that room, Esc to close |
| `Q` | Take the lens off — occlusion, bloom, focus, grain |
| `Tab` | Section view — a dollhouse with a storey-separation slider |

Each toolbar button carries its own key, so the table above is learnable from
the bar rather than from this file. A toggle that is on is lit; the label stays
a noun and never flips between two verbs, which is why nothing in `src/` writes
button text any more — `aria-pressed` carries the state and the stylesheet
draws it. The full sentence for each lives in its `title`.

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

**The brief matters more than the model**, and it took three drafts to find out
which way. The first led with what had to be preserved — keep the camera, keep
the geometry, add nothing — and gemini-2.5-flash obliged by handing the render
straight back with the bricks redrawn: faithful, and not a photograph. The second
led with the change — "change everything else" — and got a photograph of a room
that was not this one, with a plain bench returned as an upholstered armchair,
plain boards as herringbone parquet, and a course of brick through a painted
wall. The third leads with the change and then spends most of its length fencing
it: what must survive, itemised; what may not be added, listed by name; and the
demand that the two images lie on top of each other. That is the one in
`src/ui/enhance.js`, and the section view gets its own wording — a cutaway model
photographed as a model, not as a room you are standing in.

Measured against the frame it was given, on edge-map correlation across three
runs each, the third brief holds **0.695** to the second's **0.657**, with a much
better worst case (0.658 against 0.600). The gap looks small because the metric
is blunt about invented objects; the difference on screen is not small.

Two things that sound like they should help were tried and do not.
`temperature`, at 0.1, 0.2 and 0.4, moved nothing outside the ±0.03 that a repeat
run at the same settings moves on its own, so it is not in the request — it would
be a superstition. And the output already comes back at the input's aspect ratio
(1306×816 for a 1280×800 frame, 1.600 either way), so there is nothing to pin
with `imageConfig`. The prompt was the only lever that worked.

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

**Rooms that share a finish share a material.** Each room picks its patch out of
its own photographs, and two pictures of one ceiling — different corner,
different daylight — do not pick the same off-white. Left alone that reads as the
ceiling changing colour at a doorway, which is a thing the house does not do.

A ceiling groups by storey: it is one paint over one storey, and the storey above
may well have been painted on a different day. A floor groups across the whole
house, because what `finishes.floor` declares is the material itself — a room
that says `timber-cherry` means the same boards wherever it is standing. Every
room in a group takes the clearest patch any of them found, and a reviewed
rectangle scores zero, so a hand-picked crop drives the whole group.

One wood is laid through the whole house. `finishes.floor` names it, and any
value starting with `timber` is laid as planks rather than tiled as a patch, so
a scan that wants two woods can name them apart and they will not merge. This
one deliberately does not. The photographs show two: reddish cherry downstairs
and light maple upstairs. Rendered as two they read as two houses, most of all
at the head of the stairs where you see both at once, so the house is laid as
one floor on purpose. It is now laid in white oak from the palette rather than
in either sampled wood — see *The renovation* below — and either of the real
woods is an edit to photos.json away. Everything but the two bathrooms is
boards, the laundry included, whose photograph shows white tile.

Which patch the wood comes from matters as much as which rooms share it. The
first crop reviewed for the great room sat in the sheen the window throws across
the boards, and the whole downstairs came out a pale pink that reads as tile
rather than timber; the crop 20% further up the frame, away from the glare, is
the same boards at their own colour. `plankCanvases` builds the planks from the
patch's mean alone and adds its own grain, so that mean is the entire wood — it
is worth looking at a reviewed crop rather than trusting its coordinates.

A room whose photographs never showed a ceiling inherits the storey's rather than
going without one, and `finishes.ceil` is free to name something other than paint
for a room that should not join. Grouping runs before `floorFrom`, so a borrowed
floor carries the shared boards outward rather than being overwritten by them.

**A floor stops at the wall, not halfway to the next anchor.** Rooms are matched
to a point by nearest anchor, which is the right question for a wall face and the
wrong one for a floor. A bathroom's anchor is about 1.6 m from its own door and
2.1 m from its own far corner, so the hall a metre outside that door is nearer to
it than half its own floor is: no radius can separate them, and tile came out
into the corridor. What separates one finish from the next is not distance, it is
the wall.

So the floor is flood-filled instead. Every room's anchor spreads over the 10 cm
cells until it meets a wall or another room, and what that measures is how far
away a room is *by walking* — the question a floor answers. The barriers are
every wall with its wide openings cut out: a hole a door could hang in stays a
barrier, because flooring stops at a threshold, and anything wider is a cased
opening two rooms share, so the boards run through it. The width is the one
`doorLeaf` already uses to decide whether an opening gets a leaf. Each barrier
overruns its ends by 20 cm, because RoomPlan's walls do not quite meet at the
corners and a flood leaks through a two-centimetre gap as happily as through a
door. Floor sealed off from every anchor — the garage — keeps the nearest-anchor
answer. On this scan it takes the hall bathroom from 6.5 m² to the 5.3 m² inside
its own walls, and gives the upstairs bathrooms the 13.0 m² they actually cover
rather than the 10.7 m² distance had left them.

Walls still use nearest anchor, with `reach` to bound a room whose anchor is a
fitting rather than a centre. Two questions, two answers.

**A hall is a room you never photograph.** Rooms are matched to floor by nearest
anchor, so a space with no anchor of its own goes to whoever is closest — and the
closest thing to a corridor is usually a bathroom door. The laundry held 24.3 m²
of white tile through the downstairs hall and the upstairs bathrooms 15.7 m² of
it through the landing. A room in photos.json may therefore have `"photos": []`:
it is there for its anchor above all, and takes its finishes by name instead of
by sampling, with its walls falling back to the house average. The two halls in
this scan are declared at the centres RoomPlan labelled `unidentified`.

An anchor that is not a room centre needs one thing more. The laundry's is its
washer/dryer, standing against one wall of a cupboard, so even with the hall
declared it reached out over four times its own floor; `"reach"` says in metres
how far a room's finishes carry, and exists for that case alone. A corridor with
an anchor of its own needs none, which is why only the laundry has one. Across
this scan the floor now divides as 114.1 m² of cherry and 12.0 m² of tile
downstairs, 88.0 m² of maple and 10.7 m² of tile upstairs — every square metre
hardwood but the two bathrooms and the laundry.

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
room with the 2.07 m clerestory band and the 1.66 m slider that the two deck
photographs look back through was scanned as a family room and is furnished as
the primary bedroom. Which bedroom is which is the judgement
call, and `photos.json` is where to correct it. The scan's own sixth space
downstairs — windowless, one 5.35 m opening — reads as the garage, and no
photograph was taken of it.

## The renovation

Everything above dresses the house in what the photographs show. On top of that
sits a second layer that dresses it in what it could be — white walls, white oak
floors, a kitchen laid out again, the bathrooms brought up to date, and furniture
named from three retailers — and it is driven entirely from `photos.json`, so
taking it off is a matter of deleting the lines. Nothing in this layer is
measured; it is a proposal drawn over a survey, and `P` still gives the survey.

**Finishes are named, not sampled.** The top of `photos.json` now carries a
`finishes` block that every room inherits, with a room's own entries winning:

```json
"finishes": {"wall": "#F4F2EE", "ceil": "#FAF9F6", "floor": "timber-white-oak"}
```

A wall or ceiling may name a paint outright as `#rrggbb`, and that is what
"paint all the walls white" is — not a photograph's patch flattened to its own
colour, but a colour the photographs never had, which the declared halls take
as readily as the photographed rooms. A floor may name a wood or a tile from
the palette in `src/photo/relight.js`, and is then laid from the palette rather
than from a patch: `timber-white-oak` is a 190 mm plank (eight to the 1.55 m
tile, against ten of the sampled woods) in the colour of oiled white oak, with
quieter board-to-board variation and a matte finish; `tile-porcelain` is a
775 mm rectified porcelain with a 2 mm joint, for the two bathrooms. A wood
not in the palette is still sampled from its room's photographs exactly as
before, so the cherry and maple this house actually has are one line away.
The grouping that makes one finish one material house-wide is unchanged and
still what keeps the boards continuous through every doorway.

**The furniture is named from Crate & Barrel, Room & Board and West Elm.** A
room may carry `furnishings`, a map from a scanned category to a product:

```json
"furnishings": {"sofa": "westelm/andes-sofa-76", "table": "roomandboard/linden-table-72"}
```

The products are in `src/scene/products.js`, each with its retailer, name,
link, finish and catalogue dimensions. None of the three publish 3D models, so
nothing is downloaded: each product is drawn parametrically in its own
silhouette — the Andes' track arms and bench cushion on slim black legs, the
Gather's loose cushions on a plinth, the Hudson's flat oak panel headboard,
the Slope's shell on splayed legs — and stood on the scanned footprint, facing
the way the scanned box does, with its back where the scanned back was. It is
drawn at its catalogue size when the scan's box agrees with that to within a
third, which puts a queen Hudson where a queen bed was measured and a 72"
Linden where a 63" table stood; where the scan's box is much smaller than the
product, the product's proportions are hung on the box instead, the way every
generic fitting already is. Because the map is per category, a room may list
candidates for one and the first the box takes wins: the primary bedroom's
`storage` is `[dresser, nightstand]`, and the size rule is what makes the
1.6 m box under the television the dresser and the two small ones nightstands.
A room may also `place` a product the scan never saw — the living room's
coffee table, the second chair by its left window, the west bedroom's bed —
at a point and a yaw, settled like the rest and given its own collision and
plan box, or a `rug` of a given size; and it may `drop` scanned boxes by
position, the way the bath annotation does, which is how the west bedroom
gave up a wardrobe and a dresser standing where its bed now is. The primary
bedroom, the east, south and west bedrooms are all furnished as bedrooms —
bed, two nightstands with lamps, a dresser — whatever the scan happened to
catch in each. These are representative
drawings of named products, not the products, and the links go to the
retailers' own pages or searches so the real thing can be checked against.

**Every piece is settled into its room.** RoomPlan's box for a piece against a
wall usually reaches into the wall — it sees the front and guesses the back —
and a product drawn on that box inherits the overlap, or makes it worse where
the product is wider. So `src/scene/settle.js` walks every built piece, product
or generic, to the nearest placement whose footprint is on the floor and clear
of every wall panel: forward first, then sideways, in 2 cm steps to 60 cm. A
product that will not settle at catalogue size is tried at the scan's size;
one that fits nowhere keeps the scan's word. A probe over the shipped scan
found twelve pieces with an edge in a wall before this and none after.

**What makes it read as furnished rather than boxed.** Textures are laid out in
metres — `box()` writes its UVs from the flat box, so a wood tile is 60 cm of
board and a weave 12 cm of cloth on every piece alike — and the pale pieces are
bouclé, with loops the light catches. Cushions are stuffed: a `cushion()` is a
box whose faces bow out toward their middles. Then the small things: a pillow
leant into each sofa corner and a throw folded over an arm; a duvet turned
back over a rippled top, two pillows, two euro pillows against the headboard
and a throw across the foot; a lamp on every nightstand, books on the end
tables, a bowl on the dining table, a vase on the console; and a bordered
flatweave rug under every sofa, sectional and bed, settled the same way the
furniture is and shrunk until it fits.

**The kitchen is laid out, not scanned.** The scan reports the cabinets it saw
as boxes, and those said where the old kitchen was: an L with the range jammed
into the corner beside the bathroom wall, a tall pantry at the far end of the
same wall, and a 1.4 m island in a 3.3 m wide room. `finishes.kitchen` says
where the new one goes, as runs of units along named walls and an island placed
outright:

```json
"kitchen": {
  "runs": [{"wallAt": [-3.02, -0.50], "start": -2.07, "uppers": true,
            "units": [["corner", 0.9], ["base", 0.45], ["range", 0.76], ["base", 0.63], ["base", 0.6]]},
           {"wallAt": [-3.90, -3.14], "start": -1.27, "uppers": true,
            "units": [["base", 0.3], ["sink", 0.9], ["dishwasher", 0.6], ["fridge", 0.89], ["pantry", 0.45]]},
           {"wallAt": [-0.99, -1.50], "start": -1.87, "uppers": true,
            "units": [["base", 0.6], ["base", 0.6], ["base", 0.62]]}]
}
```

An `"island": {"at", "yaw", "length", "width"}` may be added to that and is
built with a waterfall top and a pendant over it; this kitchen had one and lost
it, for the reason below.

`start` is metres along the wall from its own `-w/2` end and may run past the
record onto a collinear neighbour — the south wall here is two records on one
line, 2.54 m and 0.80 m, and the run is laid along both. Which side of the wall
the kitchen is on comes from the room's anchor, as it does for the fireplace.
The layout itself: the sink stays under the window, with a dishwasher beside it
and a tray cabinet at the corner; the refrigerator stays where the scan found
it, at the north end of that run, and the pantry moves from the far end of the
south wall to stand beside it, so the two make one full-height bank against the
short return wall; that frees the south wall for the range at the centre of a
continuous counter, with landing space either side and a hood over it, where
before it had fifteen centimetres to the corner. There is no island: in a room
3.3 m wide one left 0.8 m aisles, so its storage goes to the east wall instead,
as a third run of drawer stacks with uppers over them on the 1.8 m of solid
wall between the great room and the hall opening — a U, with two metres of
clear floor in the middle and the dining table through the opening. The
joinery is two-tone, oak below the counter and matte white above, with quartz
across and up the splashback, uppers to the ceiling that stop for the window
and the hood, and drawer stacks rather than doors. Every unit is a collision box, the tall ones stop daylight, and
the plan draws them in place of the scanned boxes they replace; the survey
keeps the scan.

**The bathrooms.** The scan gives each one a toilet, a vanity and a basin, and
nothing else — no tub, no shower, and upstairs a vanity and a toilet twice over,
because the two rooms either side of one wall were captured as one.
`finishes.bath` drops the boxes that should not be drawn, restyles the vanities
the scan did see — floating, in oak, with a quartz top, an undermount basin, a
black mixer and a frameless mirror between two sconces — and adds what it did
not: a shower against a named wall, tiled on three sides in large-format
porcelain with a fixed glass panel on the fourth, and a vanity where a room had
none. The hall bathroom's tub alcove, 0.96 m wide under its little window,
becomes a walk-in shower; the two upstairs rooms each get one at their far end.
The floors are porcelain; everything else in the house is oak.

**The materials are the retailers' own.** `swatches/swatches.json` names
eleven material swatches — Tepic, Orla, Sumner, Tatum and Vick fabrics, Lecco
leather, white oak and walnut — and `swatches/fetch.py` fetches each from the
retailer's image server, where it is the retailer's photograph of the actual
cloth or board. They are committed beside it, ~1.3 MB in all, so a clone needs
nothing from the network. `build.py` writes them into the page the way it does
the photographs (linked, or inlined for the one-file build); the dressing loads
them with the photographs and, before anything is built, puts each on the
material `src/scene/swatches.js` says wears it, tiled at the real size one
repeat covers, its own light and dark serving as its relief. Every sofa is
then upholstered in the photograph of its cloth, the leather chair in the
photograph of the hide, and every oak piece in the photograph of the board —
and so is the floor: the white oak planks are cut board by board from the oak
swatch, each from its own slice of it, mirrored along its length so the grain
never repeats within a board, lifted a little toward white and grey because a
floor of it wants to be paler than a tabletop. Only Room & Board serves its
swatches to anything but a browser; Crate & Barrel and West Elm refuse every
automated request, so their pieces wear Room & Board's closest match, and the
manifest says which stands for what.

**What grounds it.** A contact shadow under every piece — a soft-edged dark
plane on the floor, deeper under upholstery than under legs — does what the
lens's screen-space occlusion does only when the lens is on: it puts the
furniture on the floor rather than over it. The boards themselves are long
now, 1.4 to 2.2 m with their joints staggered, from a 3.6 m tile at double the
resolution.

**The shading, tuned toward a photograph.** The lens's occlusion reaches
further (0.55 m, sixteen taps) and is curved so corners and undersides go
properly dark; the composite adds a quarter of an S-curve for midtone
contrast and a slight warmth, since daylight indoors is sunlight off oak and
off-white rather than the sky's blue, and a little more vignette and bloom.
The baked daylight now shades by hemisphere — a face that looks up is lit a
little more, a ceiling a little less, a wall between — which is the gradient
every photograph of a room has and a flat irradiance field does not. The oak
floor is satin rather than matte, so the screen-space reflections have
something to do.

**The rooms, as they are now used.** Downstairs: the dining room has a 96"
Linden and eight Slope chairs on a rug and nothing else; the living room its
Metro 98", two Cavetts, the coffee table and the television over the plaster
fireplace; the main-floor bedroom is a media room — the Andes sectional facing
a 72" television over the Anton console, a bookcase beside it — with the
scanned bed and nightstands dropped. Upstairs: the primary and west bedrooms
are bedrooms; the two rooms under the roof slopes are offices, a Parsons desk
and a Slope office chair each with a Woodwind bookcase, and the east one has
its closet taken out — the wall removed and the closet's strip added back as
floor by `finishes.removeWalls` and `finishes.floorPatches`. The two upstairs
bathrooms are two rooms either side of one wall, each with its shower at the
far end and its toilet and vanity along one wall; the north one has a door cut
from the primary bedroom, which makes it the en-suite. The door from the
garage into the laundry is on the garage's far wall, where IMG_0703 shows it.

**Which way the boards run.** The house sits thirty degrees off the scene's
axes, and boards laid on those axes cross every room diagonally.
`finishes.boards` is a wall yaw, and the boards run along it — here the
lake-facing walls', so they run left to right as you stand at the windows, and
the bathroom tile is squared to the same walls. It is a default at the top of
`photos.json` like the paint, and a room may name its own.

**The rooms upstairs are bedrooms.** RoomPlan scanned the room with the deck
and the clerestory as a family room, and it is named as one in the photo
captions; it is furnished as the primary bedroom — it has the lake, the deck,
and the en-suite through the wall — with the Hudson bed, dresser and
nightstands, and the television it was scanned with stays on its wall.

**Everything else that changed with it.** Doors are flush slabs with a matte
black lever; casings are square flat stock with no bead; the skirting is a
flat 70 mm; every cabinet front in the house is a slab with a black edge pull
rather than a Shaker frame and a bar; the stair treads and handrail are oak;
the toilet is a one-piece with a skirt; the appliances are brushed rather than
polished, because a refrigerator that mirrors the lake reads as blue glass.
The fireplace annotation takes `"finish": "plaster"` for a smooth chimney
breast with a wide black steel firebox, a quartz hearth and a floating oak
shelf, and `"tv": 1.45` for a television that width mounted on the breast
above the shelf; the brick surround the photographs show is still the default.

What the renovation does not do: move a wall, a door or a window, or claim any
of its dimensions beyond the standard ones — a 600 mm base, a 900 mm counter,
a 350 mm upper. The rooms are the rooms the scan measured.

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

Architectural details include cased openings, door leaves with lever handles
and hinge barrels, and ceiling downlights with separate trim rings and dark
baffles; the casing was bevelled with a raised bead and the doors Shaker-railed
until the renovation flattened both. Door styling and hardware are inferred; the
scan supplies the openings. Unclaimed floor strips stop at footprint gaps,
so dressing does not bridge empty space outside the scan.

### Photo-guided realism

Optional `finishes` on a room in `photos.json` now records reviewed material
choices. `floor: "timber"` builds a 1.55 m tile with ten 155 mm boards, staggered
joints, and separate colour, normal, and roughness maps. The room's extracted
floor colour supplies the palette; board layout and grain are inferred. Living
room, great room, and west bedroom use this finish, and the living room and kitchen
borrow the great room floor through `floorFrom` to keep the connected boards continuous. Other rooms retain their
photographic patches. The shared world-space UVs keep board direction consistent.

The kitchen's scanned cabinets once took the cream, grey-blue, warm stone and
metal finishes visible in its photos through per-room colour values; the kitchen
is now laid out afresh (see *The renovation*), and those values went with the
cabinets they coloured. Upholstery has quieter weave and cushion piping, and
bedding has shallow folds and a turned-back sheet. The photos show mostly empty
rooms, so furniture continues to be a representative interpretation of the scan
bounds — or, where a room names products, of the products.

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

The HUD is compact: the rail is one line and its metadata has moved to the card
that introduces the scan, the section and plan panels have lost their captions
and their second lines, and both toolbars are key-led nouns at about two thirds
of the height they were. It reclaims roughly a fifth of the screen — a
walkthrough should be mostly the house. Two things worth knowing came out of it.
Toggle state now lives entirely in `aria-pressed`, so the boot flags have to be
pushed through the setters in `initControls`, or a button that is on shows as
off. And an edit that replaced a slice of `template.html` silently deleted the
whole lightbox block; the suite now checks every `$('id')` in `src/` against the
template, which catches exactly that.

Nano Banana was introducing furniture, flooring and wall materials that are not
in the scan. The brief now leads with the change and then fences it at length —
an itemised list of what must survive, a named list of what may not be added, and
the demand that the two images lie on top of each other — and the section view is
briefed as a cutaway model rather than as a room. Edge-map correlation against
the source rises from 0.657 to 0.695 over three runs each, and a plain bench
comes back a plain bench. Temperature and aspect-ratio pinning were both measured
and both do nothing, so neither is in the request.

Floors and ceilings no longer vary room to room within a storey. The variation
was sampling noise, not the house: every room chose its own patch, so one paint
came out as seven off-whites downstairs and five upstairs, and three bedrooms
laid three different timbers. Ceilings are now grouped by storey and floors by
declared finish, the clearest patch in each group winning for all of it. Verified
by instrumenting a build to report material identity per room against the same
build without the change: 7 ceilings to 1 and 5 to 1, and the upstairs floors
from 5 distinct to 3, with the bathroom, bedroom and laundry keeping their own.

The hardwood is now one material per wood across the whole house rather than one
per storey. `finishes.floor` names the material — `timber-cherry` downstairs,
`timber-maple` upstairs — so the declaration groups house-wide instead of being
split by which storey a room sits on, and the main-floor bedroom and upper family
room, both plainly hardwood in their photographs and both previously undeclared,
now say so instead of sampling a third and fourth wood of their own. The two
woods are genuinely different in the photographs and stay apart. Verified the
same way as before, by material identity per room: five hardwood rooms downstairs
on one floor material, four upstairs on another, tile untouched.

The hallways are hardwood now, and the reason they were not is worth keeping.
Nothing in photos.json described a hall, so the corridors fell to whichever
anchor was nearest, and a small wet room beside a corridor beats every other room
in the house to it: the laundry was laying 24.3 m² of white tile downstairs and
the upstairs bathrooms 15.7 m² across the landing. Both halls are declared rooms
now, photographless, present for their anchor and naming their storey's boards;
the laundry, whose anchor is a washer/dryer against one wall of a cupboard rather
than a room centre, also declares how far its finishes carry. Measured by
floor-cell assignment: downstairs 114.1 m² cherry and 12.0 m² tile, upstairs
88.0 m² maple and 10.7 m² tile, against 126.2 and 98.7 m² of storey.

The floors are one hardwood now, everywhere but the two bathrooms. Two things
were wrong. The great room's reviewed crop sat in the window's sheen, so the
downstairs boards came out pale pink — `plankCanvases` takes only the patch mean,
so a crop in the glare is a floor in the glare; the crop moved up the frame, out
of it. And the house was laid as the two woods its photographs show, which reads
as two houses from the head of the stairs. It is one wood on purpose now, cherry,
with the laundry joining the boards despite its tiled photograph. Verified by
material identity per floor cell: one material over 207.6 m², tile over the
17.2 m² of bathroom.

Tile was bleeding out of the first-floor bathroom into the hall outside it. The
cause was that floors were assigned by nearest anchor, and a bathroom's anchor is
nearer to the corridor past its door than to its own far corner — which is why
`reach` never fixed it and could not have. Floors are flood-filled from the
anchors now, over a barrier set of every wall with its wide openings cut out, so
a finish stops at a doorway and carries through a cased opening. The hall
bathroom drops from 6.5 m² to the 5.3 m² within its own walls.

## Rendering quality

The selector in the top bar offers **Auto**, **High**, **Balanced**, and
**Performance**, and remembers your choice. Auto starts at High and steps down
when frames stay slow; selecting a tier explicitly keeps it fixed. High renders
at up to 1.5× CSS resolution, Balanced at 1×, and Performance at 0.75×.
High also uses more occlusion, bounce and reflection samples than Balanced.

High and Balanced combine the existing baked window irradiance with a small
screen-space diffuse bounce, depth-filtered SSAO, and floor reflections with
refined ray intersections. On WebGL2, an eight-sample jitter sequence and
camera-reprojected temporal antialiasing reduce shimmer. Depth rejection and
neighbourhood clipping limit ghosting; changing floors, furniture visibility,
section spacing, or resolution clears history. FXAA finishes the image.
Performance retains SSAO, bloom and tone mapping, with FXAA instead of TAA,
and skips bounce and reflections. `Q` toggles the post-processing chain.

These are GPU fragment-shader effects in the existing WebGL renderer, not
hardware ray tracing. Screen-space bounce and reflections only use visible
geometry; the baked irradiance supplies lighting beyond the camera view.
HDR targets require a renderable floating-point colour extension, with
8-bit targets as a fallback. Unsupported depth/derivative hardware uses the
ordinary renderer. The high-performance GPU preference is a browser hint,
not a guarantee that a discrete GPU will be selected.
