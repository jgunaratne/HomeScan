# HomeScan — SPEC.md

An iOS app that scans an entire house with Apple's RoomPlan API, merges the rooms
into a single structure, and persists everything in a re-processable form.

**Target device:** iPhone 17 Pro (LiDAR required)
**Target OS:** iOS 26+
**Language:** Swift 6, strict concurrency
**UI:** SwiftUI

---

## 1. Goals

- Scan every room in a multi-room house in as few passes as possible.
- Preserve a shared metric coordinate frame across all rooms.
- Derive and persist **measurements**: per-room floor area, wall lengths, ceiling
  height, door and window sizes, and a whole-home total — with the measurement
  convention stated explicitly (see §6).
- Persist the **raw reprocessable intermediate** (`CapturedRoomData`), not just the
  finished output, so results can be re-derived later with different options or a
  future OS version.
- Export to USDZ and JSON, and get the data off the phone without a cable.

## 2. Non-goals

- Photorealistic rendering. RoomPlan returns parametric geometry — walls, openings,
  and furniture bounding boxes. Anything photoreal is a separate pipeline.
- Multi-floor merging. RoomPlan does not handle it. Scan per floor, stack manually
  later if needed (see §10).
- Survey-grade accuracy. A LiDAR iPhone is a sketch-grade capture tool. Measurements
  are good enough for space planning, furniture fit, flooring and paint estimates —
  not for permits, structural work, or anything a contractor will bid against
  without verifying. The app should say so, in the UI, next to the numbers.

---

## 3. What RoomPlan actually returns

Verify all API signatures against current Apple documentation before implementing —
do not code from memory. Expected shape:

- `CapturedRoom` — `surfaces` (walls, windows, doors, openings, floors), `objects`
  (furniture with `category` + `attributes`), and `sections` (labelled areas within
  a room). Each surface/object carries `dimensions`, a 4×4 `transform`, a
  `confidence` (`.high` / `.medium` / `.low`), and a stable `identifier`.
- `CapturedRoomData` — the opaque intermediate. `RoomBuilder` turns it into a
  `CapturedRoom`. **This is the thing worth archiving.**
- `CapturedStructure` — the merged multi-room result from `StructureBuilder`.
- Surfaces expose a `polygon` for non-rectangular geometry (sloped walls, curved
  windows). Use it rather than assuming rectangles.

Known constraints to design around:

- Practical room size caps out around 9×9 m. Large open-plan spaces need splitting.
- Geometry is simplified toward rectangles; curved architecture degrades.
- RoomPlan has received no substantive updates in recent OS releases and there are
  unconfirmed reports of capture issues on iOS 26. **Build a smoke-test scan early**
  (Milestone 0) before investing in the rest.

---

## 4. Capture architecture

### 4.1 Two session modes

**Mode A — `RoomCaptureView` (Milestone 0/1).** Apple's built-in guided coaching UI.
Implement `RoomCaptureViewDelegate`:
- `captureView(shouldPresent:error:)` — return `true` to show the post-scan result view.
- `captureView(didPresent:error:)` — receive the finished `CapturedRoom`.

Fastest path to a working scan. Use this until the multi-room flow is proven.

**Mode B — `RoomCaptureSession` + custom `ARSession` (Milestone 3).** Drive the
session directly with `RoomCaptureSessionDelegate`, running on an
`ARWorldTrackingConfiguration` you own. Required if HomeScan ever needs to capture
its own frames or depth alongside RoomPlan in a single walkthrough.

### 4.2 Multi-room continuity — the important part

The naive approach (scan room, finish, scan next room) throws away the coordinate
frame between rooms, and merging afterward is guesswork.

Instead: **stop the capture session without tearing down the ARSession.** Look for
the `pauseARSession: false` variant of `RoomCaptureSession.stop(...)`. This keeps
ARKit world tracking alive while the user walks through a doorway, so the next room
is captured in the same frame as the last one.

Flow:

1. User taps *Start House Scan*.
2. Scan room 1 → tap *Done with this room*.
3. Session stops, ARSession stays live. UI shows "Walk to the next room — keep the
   phone up and pointed ahead."
4. Scan room 2. Repeat.
5. User taps *Finish House* → run `StructureBuilder` over all `CapturedRoom`s.

**Tracking loss is the main failure mode.** If ARKit relocalization fails mid-walk,
the frame is broken and later rooms will merge badly. Detect via `ARCamera`
tracking state, warn immediately, and offer to start a new *segment* rather than
silently continuing with a corrupted frame. A house scan may legitimately be several
segments; the merge step handles them independently.

### 4.3 Merging

```
let builder = StructureBuilder(options: [.beautifyObjects])
let structure = try await builder.capturedStructure(from: capturedRooms)
```

Merge per segment, then per floor. Store the merged `CapturedStructure` alongside —
never instead of — the individual rooms.

---

## 5. Data model & persistence

### 5.1 On-disk layout

Everything under `Documents/` so the Files app can reach it. Set
`UIFileSharingEnabled` and `LSSupportsOpeningDocumentsInPlace` in Info.plist.

```
Documents/
  Scans/
    <scan-uuid>/
      manifest.json
      segments/
        <segment-uuid>/
          rooms/
            <room-uuid>/
              raw.capturedroomdata      # archived CapturedRoomData
              room.json                 # CapturedRoom, Codable
              room-parametric.usdz
              room-mesh.usdz
              thumbnail.png
          structure.json                # merged CapturedStructure
          structure.usdz
      measurements.json                 # derived room schedule, see §6.7
      measurements.csv
      worldmap.arworldmap               # optional, see §5.3
```

### 5.2 Manifest

`manifest.json` is the app's own metadata — not Apple's — and is the source of truth
for the library UI:

```jsonc
{
  "id": "uuid",
  "name": "Home — Main Floor",
  "createdAt": "ISO8601",
  "deviceModel": "iPhone17,2",
  "osVersion": "26.x",
  "segments": [
    {
      "id": "uuid",
      "rooms": [
        { "id": "uuid", "label": "Kitchen", "confidence": "high",
          "floorAreaSqM": 18.4, "objectCount": 12 }
      ]
    }
  ],
  "syncedAt": null
}
```

Room labels are user-supplied. Prompt for one immediately after each room scan while
the user is still standing in it — retroactive labelling from a wireframe is painful.

### 5.3 Archive the intermediate

`CapturedRoom` is `Codable` — persist it as JSON. But also archive the raw
`CapturedRoomData`. It is the only thing that lets you re-run `RoomBuilder` later
with different options, or re-derive results on a newer OS, without re-walking the
house. Treat it as the master asset and the JSON/USDZ as derived.

Optionally persist the `ARWorldMap` per segment. It enables relocalizing into the
same physical space on a later visit to extend a scan rather than restart it. Note
that identical-layout spaces (adjacent units with the same floor plan) confuse
relocalization; scope this to a stretch goal.

### 5.4 Export

`CapturedRoom.export(to:exportOptions:)` — support `.parametric`, `.mesh`, and
`.model`. Write both parametric and mesh by default; they serve different downstream
tools and the storage cost is trivial next to the value of not re-scanning.

---

## 6. Measurements & dimensions

RoomPlan hands you geometry in metres; it does not hand you a floor plan schedule.
This section is the derivation layer that turns one into the other.

### 6.1 Source values

Every `surface` and `object` exposes `dimensions` (a `SIMD3<Float>` in its own local
frame) plus a 4×4 `transform` placing it in the room frame. Interpretation differs
by category:

| Element | What to read |
|---|---|
| Wall | `dimensions.x` = length along the wall, `dimensions.y` = height. Thickness is ~0 — RoomPlan models walls as planes, not solids. |
| Floor | The `polygon` is the authoritative footprint. Use it, not a bounding box. |
| Door / window | `dimensions.x` × `dimensions.y` = the opening size. Free and genuinely useful. |
| Object | Bounding box only. Fine for "will the sofa fit", not for the sofa's actual shape. |

### 6.2 Floor area

Compute from the floor surface `polygon`, not from wall extents — wall-derived
footprints break on any non-rectangular room.

1. Transform the polygon vertices into the room (or structure) world frame.
2. Project to the XZ plane.
3. Shoelace formula for signed area; take the absolute value.

If a room has no detected floor surface (it happens on cluttered or poorly-lit
scans), fall back to the wall footprint and **flag the room as estimated** in the UI.
Never silently mix the two methods in one total.

### 6.3 Ceiling height

Take the median wall `dimensions.y` across the room rather than the max. A single
mis-detected wall extending into a stairwell or vaulted section will otherwise skew
it. Report the spread alongside the median — a wide spread is a real signal about
the room (sloped ceiling) or about scan quality.

### 6.4 Whole-home total — state the convention

This is the part that will be wrong if it isn't decided deliberately. RoomPlan
measures **interior clear space**, wall face to wall face. The square footage on a
listing, tax assessment, or floor plan is normally **gross area**, measured to the
outside of exterior walls and including interior partitions.

The gap is real — commonly on the order of 10–15% depending on wall construction,
and larger in a house with many small rooms. A HomeScan total will read *low*
against the assessor's figure, and that is correct behaviour, not a bug.

So: compute and store **net interior area** as the primary number, label it as such
everywhere it appears, and never call it "square footage" unqualified. If a gross
estimate is wanted later, it needs an assumed wall thickness as an explicit input,
and should be presented as a separate, clearly derived figure.

Summing rooms also risks double-counting where `StructureBuilder` merged overlapping
captures. De-duplicate on the merged `CapturedStructure`'s rooms, not on the
individual pre-merge `CapturedRoom`s.

### 6.5 Units

Store metric internally, always — RoomPlan is metric and every conversion is a
rounding error waiting to compound. Convert at the display layer only. Default the
display to imperial with a Settings toggle, and show areas to a sensible precision:
a room is "12'4" × 14'2", 175 sq ft", never 175.3847.

### 6.6 Confidence and validation

Propagate each surface's `confidence` into the measurement record. Any room
containing a low-confidence wall gets a visible marker on its dimensions, and is
excluded from the "verified" home total.

Build a **tape-measure check** into the app: pick one wall, enter a real measured
length, and show the delta against the scan. Run it on the first scan of any new
house. It takes two minutes and it is the only way to know whether a given
environment is producing trustworthy geometry before a whole house is captured on
top of it.

### 6.7 Persisted output

Alongside the geometry, write a `measurements.json` per scan — a flat, human-readable
schedule that doesn't require parsing USDZ to use:

```jsonc
{
  "convention": "net-interior",
  "units": "meters",
  "generatedAt": "ISO8601",
  "rooms": [
    {
      "id": "uuid", "label": "Kitchen",
      "floorArea": 18.42, "areaMethod": "floor-polygon",
      "ceilingHeight": { "median": 2.44, "min": 2.41, "max": 2.47 },
      "perimeter": 17.8,
      "walls": [ { "length": 4.2, "height": 2.44, "confidence": "high" } ],
      "openings": [ { "type": "door", "width": 0.81, "height": 2.03 } ],
      "confidence": "high"
    }
  ],
  "total": { "floorArea": 142.6, "roomCount": 9, "verified": true }
}
```

Also offer CSV export of the room schedule. It is what anyone will actually paste
into a spreadsheet when pricing flooring.

---

## 7. Sync off-device

A share sheet export is the fallback, but the primary path should be push-to-server:

- Zip the `<scan-uuid>/` directory.
- `POST` to a configurable endpoint over HTTPS.
- Endpoint URL, and an optional bearer token, live in Settings — no hardcoding.
- Use a background `URLSession` upload task so a large house scan survives the app
  being backgrounded.
- Write `syncedAt` into the manifest on success; show sync state per scan in the
  library UI. Never delete local data on successful upload without explicit user action.

Assume the server is reachable on a private network rather than the public internet;
do not build in any cloud-provider dependency.

---

## 8. Screens

| Screen | Purpose |
|---|---|
| **Library** | List of scans with thumbnail, room count, sync state. Swipe to delete, tap to open. |
| **Scan** | RoomCaptureView (or custom session). Room counter, tracking-quality indicator, *Done with room* / *Finish house*. |
| **Room label prompt** | Modal after each room. Text field + quick-pick chips (Kitchen, Bedroom, Bath…). |
| **Scan detail** | USDZ QuickLook preview of the merged structure, per-room list with confidence, export and sync buttons. |
| **Room schedule** | The measurement table: area, dimensions, ceiling height per room, home total with its convention labelled. Estimated and low-confidence rooms visibly marked. CSV export. |
| **Tape check** | Pick a wall, enter a measured length, see the delta. Run once per new house. |
| **Settings** | Sync endpoint, token, export format defaults, storage used. |

Keep the scanning screen ruthlessly minimal. The user is holding a phone at eye
level, walking backward around furniture.

---

## 9. Milestones

**M0 — Feasibility smoke test.** Bare `RoomCaptureView`, scan one room, dump the
`CapturedRoom` JSON to the console. Confirms RoomPlan works correctly on this
device and OS build before anything else gets built on top of it. Do not skip.

**M1 — Single room, persisted.** Save one room to the on-disk layout, export USDZ,
preview it in QuickLook.

**M2 — Multi-room house.** Continuous ARSession across rooms, `StructureBuilder`
merge, tracking-loss handling and segment fallback.

**M2.5 — Measurements.** Floor-polygon areas, ceiling heights, wall and opening
schedule, `measurements.json` + CSV, tape-measure validation check. Do this before
M3 — the numbers are the point of the app, and the sync layer should be shipping
them from day one.

**M3 — Library and sync.** Manifest, library UI, background upload.

**M4 — Custom ARSession.** Swap to `RoomCaptureSession` on an owned
`ARWorldTrackingConfiguration`. No user-visible change; opens the door to capturing
additional data streams in the same pass.

---

## 10. Open questions

- **Multi-floor.** Nothing in RoomPlan stitches floors. Options: scan per floor and
  align manually using stair openings as anchors, or use barometer altitude deltas
  as a coarse Z offset. Deferred — decide after seeing what a two-floor scan
  actually produces.
- **Open-plan spaces** exceeding the ~9 m guidance. Split into overlapping captures
  and let `StructureBuilder` merge, or accept degraded geometry?
- **Re-scanning a room.** Replace in place, or version it? Versioning is cheap given
  the archive-the-intermediate design and probably worth it.
- **Floor plan rendering.** RoomPlan gives wall polygons in metric coordinates —
  producing a clean 2D top-down SVG from them is straightforward but non-trivial.
  Own milestone if it becomes a priority.

---

## 11. Implementation notes

- RoomPlan requires a physical device. There is no simulator support. Plan the
  test loop accordingly.
- Camera usage description string is required; the app is unusable without it.
- Scans are large. Test storage pressure with a full house before shipping, and show
  storage used in Settings.
- All file I/O off the main actor. The merge step in particular is slow enough to
  jank the UI.
- Verify every RoomPlan API signature in this document against Apple's current
  documentation before writing code against it.
