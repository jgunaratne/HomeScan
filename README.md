# HomeScan

An iOS app that scans an entire house with RoomPlan, merges the rooms into a single
structure, and persists everything in a re-processable form. Implementation of
[SPEC.md](SPEC.md).

**Requires a LiDAR iPhone on iOS 26.** RoomPlan has no Simulator support, so the
capture path can only be exercised on device.

```
open HomeScan.xcodeproj                    # set a signing team, run on device
xcodebuild -scheme HomeScan -sdk iphonesimulator \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' test
```

The unit tests cover the measurement layer — the geometry, the verification rules,
the unit formatting and the CSV — and run on the Simulator, because that maths is
where the app's actual output comes from and it does not need a camera to check.

---

## Layout

```
HomeScan/
  App/        HomeScanApp, AppDelegate (background-upload relaunch)
  Model/      ScanManifest, MeasurementSchedule, TapeCheck
  Storage/    ScanPaths (SPEC §5.1 layout), ScanStore (actor; all file I/O)
  Capture/    CaptureCoordinator, TrackingMonitor, RoomPlan delegate proxy
  Measure/    Geometry (pure), MeasurementEngine, RoomLabelMatcher
  Export/     USDZ options, MeasurementCSV, FloorPlanRenderer (thumbnails)
  Sync/       SyncService (background URLSession), DirectoryZipper
  Settings/   AppSettings + Keychain, UnitFormatter
  UI/         Library, Scan, Room label, Scan detail, Room schedule, Tape check,
              Settings, Smoke test
```

## Milestone status

| | |
|---|---|
| **M0** Feasibility smoke test | Built, and kept in the shipping app under **Settings ▸ Diagnostics ▸ Run Capture Smoke Test**. Bare `RoomCaptureView` with Apple's stock coaching and result view; dumps the `CapturedRoom` JSON to the console. Nothing of HomeScan's own capture path is involved, so a failure there isolates the problem to RoomPlan on this OS build. |
| **M1** Single room, persisted | Done. Full on-disk layout, USDZ export, QuickLook preview. |
| **M2** Multi-room house | Done. Continuous ARSession, `StructureBuilder` merge per segment, tracking-loss detection with a segment fallback. |
| **M2.5** Measurements | Done. Floor-polygon areas, median ceiling heights, wall and opening schedule, `measurements.json` + CSV, tape check. |
| **M3** Library and sync | Done. Manifest, library UI with sync state, background upload, share-sheet fallback. |
| **M4** Custom ARSession | Done, with a caveat — see below. |

## Verified API notes

SPEC §11 asks that every RoomPlan signature be checked against the current SDK
rather than written from memory. Checked against the iOS 26.5 SDK's
`RoomPlan.swiftinterface`; three things differ from the spec's description:

- **The polygon property is `polygonCorners: [simd_float3]`** (iOS 17+), not
  `polygon`. `MeasurementEngine.floorArea` uses it.
- **`stop(pauseARSession:)` exists as hoped** — `@_disfavoredOverload public func
  stop(pauseARSession: Bool = true)`, iOS 17+. This is what makes multi-room
  continuity work.
- **`RoomCaptureView(frame:arSession:)` exists** (iOS 17+), so the app can own the
  ARSession while still getting Apple's coaching UI.

## Decisions worth knowing about

**The capture path takes data from the *view's* delegate, not the session's.**
`captureView(shouldPresent:error:)` hands over the `CapturedRoomData` and returns
`false`, skipping Apple's post-scan result view so the app can run `RoomBuilder`
itself and go straight to the label prompt. Setting
`captureSession.delegate` instead would fight `RoomCaptureView` for the delegate
that drives its own coaching UI.

**Tracking state is polled, not delegated.** `TrackingMonitor` samples
`arSession.currentFrame?.camera.trackingState` at 5 Hz rather than installing
itself as `ARSessionDelegate`, for the same reason: RoomPlan drives that session.
Polling cannot interfere, and tracking state changes far more slowly than 5 Hz.

**M4's "owned `ARWorldTrackingConfiguration`" is partly not possible.** HomeScan
owns the `ARSession` object, which is what unlocks reading tracking state,
retrieving the `ARWorldMap`, and adding further data streams to the same
walkthrough. But `RoomCaptureSession.Configuration` exposes only
`isCoachingEnabled`, and RoomPlan configures and runs the ARSession itself —
running our own configuration would be replaced, or rejected as
`.invalidARConfiguration`. Owning the session is the whole of what the API allows.

**Labels have to be carried across the merge.** `StructureBuilder` re-identifies
rooms, so the `CapturedRoom`s coming out of a `CapturedStructure` do not carry the
identifiers the user's labels were attached to. `RoomLabelMatcher` reassociates them
by plan-view centroid with greedy nearest-pair assignment and a 4 m cutoff; an
unmatched merged room is labelled "Unlabelled room N" rather than guessed at.
Measurements are computed on the merged rooms, per SPEC §6.4, so overlapping
captures are not double-counted.

**Everything user-visible is derived, and can be re-derived.** The archived
`raw.capturedroomdata` is written first and never deleted; JSON, USDZ, thumbnails
and the schedule are all downstream of it. **Scan detail ▸ Re-derive from Archived
Capture** re-runs `RoomBuilder` over every archive and regenerates the lot, which is
the concrete payoff of SPEC §5.3.

**The area convention travels with the number.** `measurements.json` states
`"convention": "net-interior"`, the CSV repeats it in a trailing metadata block, and
the UI carries a note explaining that listing and assessor figures are gross area
and typically read 10–15% higher. No screen says "square footage" unqualified.

**Verification is explicit.** A room is excluded from the *verified* total if any
wall or floor is low-confidence, or if its area did not come from a floor polygon.
Both totals are stored: `floorArea` (everything) and `verifiedFloorArea`. Estimated
and low-confidence rooms are badged everywhere they appear.

**Metric is the only stored unit.** Conversion happens in `UnitFormatter` at the
display boundary; the CSV is the one exception and emits both, so downstream
conversion cannot go wrong.

## Open questions from SPEC §10

- **Multi-floor** — untouched, as specced. `CapturedRoom.story` and
  `Surface.story` exist in the SDK and are a better starting point than barometer
  deltas when this is picked up.
- **Open-plan spaces over ~9 m** — undecided. The segment machinery already
  supports splitting a space into several captures; what is missing is guidance in
  the UI about when to do it.
- **Re-scanning a room** — the store versions rather than replaces: re-saving a
  room id bumps `RoomRecord.version` and keeps `capturedAt`. A re-derive
  deliberately does not bump it. No UI drives a re-scan yet.
- **Floor plan rendering** — `FloorPlanRenderer` draws plan-view thumbnails
  (floor polygons, walls, doors, windows) but has no dimensioning, labels or
  symbols. A real 2D floor plan is still its own milestone.

## Not done

- No `.model` USDZ export by default — it is a Settings toggle, off, since it needs
  a `ModelProvider` to be worth anything.
- `ARWorldMap` archiving is implemented but off by default (Settings ▸ Capture):
  the maps are large and identical-layout spaces confuse relocalization.
- Storage pressure has not been tested against a real full-house scan; that needs
  the device. Settings shows bytes used so the number is at least visible.
