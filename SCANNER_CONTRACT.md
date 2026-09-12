# What the scanner has to hand the editor

**Audience: whoever is building the room scanner.** This is everything the 3D
editor needs from you, and nothing else. Produce this JSON and the editor works;
you do not need to read any of its code.

The contract is enforced in `src/lib/roomLayoutSchema.ts` by a zod schema. If
your output parses there, it is correct by definition. If it does not, the error
message names the field.

---

## The shape

```jsonc
{
  "room": {
    "width": 3.2,          // metres, along X
    "length": 4.0,         // metres, along Z
    "height": 2.5          // metres, floor to ceiling
  },
  "objects": [
    {
      "id": "obj-1",
      "category": "desk",
      "position": [0.95, 0.375, -1.3],   // metres, CENTRE of the object
      "rotationY": 0,                    // radians
      "dimensions": [1.05, 0.75, 0.5],   // [width, HEIGHT, depth] in metres
      "confidence": 0.82                 // 0..1
    }
  ]
}
```

`room` and `objects` are the only required keys. Everything below is optional and
degrades cleanly — send nothing and the editor still works.

---

## The five rules that matter

**1. Metres. Always.** Not centimetres, not inches. A room in centimetres renders
a 320-metre dorm and nothing catches it, because 320 is a perfectly valid number.

**2. Y is up. The floor is y = 0.** The ceiling is at `room.height`.

**3. The origin is the centre of the room floor.** So x runs from `-width/2` to
`+width/2`, z from `-length/2` to `+length/2`. Not a corner.

**4. `position` is an object's CENTRE, not its base.** A 0.75 m desk standing on
the floor has `position[1] = 0.375`. This is the single most common thing to get
wrong; the editor lifts anything whose base lands below the floor, but it cannot
tell a genuinely floating object from a mis-anchored one.

**5. `dimensions` is `[width, height, depth]` — height in the MIDDLE.** It
matches `position`'s `[x, y, z]` ordering. `[w, d, h]` will look almost right and
be wrong.

`rotationY` is a rotation about the vertical axis in radians, measured so that
`0` faces −Z (the "north" wall). The editor reads facing from this everywhere,
so a desk against the north wall should be `0`, against the east wall
`-Math.PI / 2`.

---

## Categories

`category` must be one of these exactly:

```
bed  desk  chair  stool  sofa  table  shelf  dresser  nightstand
ottoman  tv  monitor  lamp  mirror  plant  rug  door  window  other
```

Anything you cannot classify goes to `other` — it renders as a plain box, which
is honest, rather than being mislabelled as furniture it is not.

**RoomPlan does not line up with this list.** It has no `desk`, `lamp`, `rug` or
`dresser`, and reports `storage`, `television` and `stairs`. Map on the way in:

| RoomPlan | Use |
|---|---|
| `table` | `desk` — in a dorm, that is what it is |
| `storage` | tall → `shelf`, short → `dresser` |
| `television` | `tv` |
| `stairs`, anything else | `other` |

RoomPlan's `confidence` is an enum (`.high` / `.medium` / `.low`), not a float.
Map it to roughly `0.9 / 0.6 / 0.3`.

---

## Optional: colour and material

All optional. Absent means the editor falls back to a per-category palette.

```jsonc
"room": {
  "wallColor": "#d8d4cd",       // #rrggbb, lowercase or upper, 6 digits
  "floorColor": "#9c968d",
  "ceilingColor": "#e8e6e2",
  "floorMaterial": "carpet",    // carpet | wood | tile | concrete | vinyl | other
  "lightColor": "#ffd9a0"       // tints the scene's lights; warm bulb vs daylight
}
```

Objects take an optional `"color": "#rrggbb"` too. **Send it whenever you can
sample it** — an object's real colour is most of what makes a render look like
someone's actual room rather than a diagram.

---

## Optional: wall features

Real rooms are not four flat rectangles. Dorms have boxed-in structural columns,
chimney breasts, radiator housings and service risers. **If your scan can see
them, send them** — furniture that ignores a pillar ends up modelled inside it.

```jsonc
"room": {
  "wallFeatures": [
    {
      "id": "f1",
      "wall": "west",        // north | south | east | west
      "kind": "pillar",      // pillar | bump | recess
      "offset": -0.6,        // metres ALONG that wall from its centre
      "width": 0.34,         // metres along the wall
      "height": 2.5,         // metres
      "depth": 0.28,         // metres INTO the room (a recess goes into the wall)
      "baseY": 0             // metres off the floor; a high pipe run starts high
    }
  ]
}
```

- `north` is the `-Z` wall, `south` is `+Z`, `west` is `-X`, `east` is `+X`.
- `pillar` — full-height structural column.
- `bump` — anything boxed in that is not full height.
- `recess` — an alcove; the box is cut into the wall rather than out of it.
- `baseY` defaults to `0` if omitted.

---

## Optional: camera frames (the LiDAR path only)

If your capture records ARKit camera poses, send them and the editor projects
the real photographed pixels onto the floor and walls instead of flat colour.
Skip this entirely if you have no poses — a browser snapshot carries none.

```jsonc
"cameraFrames": [
  {
    "url": "https://…/frame-01.jpg",
    "transform": [16 numbers],   // the camera's full 4x4 world matrix,
                                 // column-major, in the SAME room-aligned
                                 // space as object positions
    "fovY": 1.02,                // vertical field of view, RADIANS
    "width": 1920,
    "height": 1440
  }
]
```

The transform has to be in the same coordinate space as everything else. A pose
in ARKit's own world space will project the room onto the wrong surfaces.

---

## What you must NOT send

**Do not emit `binding`.** Every object carries a `binding` describing what it is
commercially, and the scan's answer is always "owned" — the person already has
it. The schema defaults it for you. Writing one from the scanner would claim
someone bought something they did not.

**Do not emit `preset`.** That describes decor a person chose in the editor
(`"poster:comic:a2"`, `"led:ceiling"`). A scan never produces one.

Both fields are optional with defaults, so simply leaving them out is correct.

---

## Where to send it

`PUT /api/layout` with `{ "session": "<id>", "layout": <the object above> }`.
The route validates against the schema and rejects anything that does not parse,
so a bad payload fails loudly at the boundary instead of rendering as a broken
room.

To read one back: `GET /api/layout?session=<id>`.

---

## Checking your output

The fastest check is the schema itself:

```ts
import { RoomLayoutSchema } from "@/lib/roomLayoutSchema";

const result = RoomLayoutSchema.safeParse(yourJson);
if (!result.success) console.error(result.error.issues);
```

Then three things worth eyeballing in the editor, because they are the failures
that parse cleanly and still look wrong:

1. **Is anything half-sunk into the floor?** `position` is a centre, not a base.
2. **Is the room a plausible size?** 3–5 m per side for a dorm. 300 means you
   sent centimetres.
3. **Do objects face the right way?** If everything is rotated 90°, your
   `rotationY` zero-point differs from ours.

---

## Minimum viable payload

If you are stuck, this parses and renders:

```json
{
  "room": { "width": 3.2, "length": 4.0, "height": 2.5 },
  "objects": [
    { "id": "1", "category": "bed", "position": [-0.75, 0.25, -1.05],
      "rotationY": 0, "dimensions": [0.99, 0.5, 1.91], "confidence": 0.8 }
  ]
}
```

Get that working end to end first, then add colours, then features.
