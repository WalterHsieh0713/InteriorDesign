// GENERATED — do not edit by hand.
// The 33 Amazon Berkeley Objects models in public/models/, with their real
// product identity and their true size measured from each model's own
// bounding box (ABO's item_dimensions field is absent on ~70% of rows and
// often carries packaging sizes, so the mesh is the only reliable source).
//
// Models are CC BY 4.0 — Amazon Berkeley Objects must be credited wherever
// they are displayed. See ATTRIBUTION in this file's consumer.
//
// dimensions are [width, height, depth] in metres, Y-up, matching RoomLayout.

import type { ObjectCategory } from "./roomLayoutSchema";

export type ModelMount = "floor" | "wall" | "tabletop" | "ceiling";

export type CatalogModel = {
  id: string;
  asin: string;
  modelUrl: string;
  category: ObjectCategory;
  aboType: string;
  name: string;
  brand: string | null;
  color: string | null;
  mount: ModelMount;
  dimensions: [number, number, number];
};

export const CATALOG_MODELS: CatalogModel[] = [
  {
    "id": "abo-b071p9wjbt",
    "asin": "B071P9WJBT",
    "modelUrl": "/models/abo-b071p9wjbt.glb",
    "category": "dresser",
    "aboType": "DRESSER",
    "name": "Amazon Brand – Stone & Beam Parson 6-Drawer Wood Bedroom Dresser, 60\"W, Natural",
    "brand": "Stone & Beam",
    "color": "Brown",
    "mount": "floor",
    "dimensions": [1.657, 0.932, 0.5635]
  },
  {
    "id": "abo-b072zlcb3m",
    "asin": "B072ZLCB3M",
    "modelUrl": "/models/abo-b072zlcb3m.glb",
    "category": "table",
    "aboType": "TABLE",
    "name": "Amazon Brand – Rivet Bristol Natural Edge Black Metal Side Table, Walnut",
    "brand": "Rivet",
    "color": "Brown",
    "mount": "floor",
    "dimensions": [0.4767, 0.4764, 0.4936]
  },
  {
    "id": "abo-b0735t6948",
    "asin": "B0735T6948",
    "modelUrl": "/models/abo-b0735t6948.glb",
    "category": "rug",
    "aboType": "RUG",
    "name": "Amazon Brand – Stone & Beam Garrison Vintage Pattern Wool Area Rug, 5 x 8 Foot, Grey Multi",
    "brand": "Stone & Beam",
    "color": null,
    "mount": "floor",
    "dimensions": [2.6509, 0.0099, 1.9709]
  },
  {
    "id": "abo-b073p5fm9s",
    "asin": "B073P5FM9S",
    "modelUrl": "/models/abo-b073p5fm9s.glb",
    "category": "other",
    "aboType": "WALL_ART",
    "name": "Amazon Brand – Rivet American Forest Map Wall Art Print in Gold Wood Frame, 20\" x 20\"",
    "brand": "Rivet",
    "color": "Multi",
    "mount": "wall",
    "dimensions": [0.5087, 0.5087, 0.0401]
  },
  {
    "id": "abo-b073p5qj14",
    "asin": "B073P5QJ14",
    "modelUrl": "/models/abo-b073p5qj14.glb",
    "category": "other",
    "aboType": "WALL_ART",
    "name": "Amazon Brand – Rivet 9-Piece Pastel Floral Art Mural on Wood, 36\" x 36\"",
    "brand": "Rivet",
    "color": "Multi",
    "mount": "wall",
    "dimensions": [0.9112, 0.9102, 0.0124]
  },
  {
    "id": "abo-b073p5qkl4",
    "asin": "B073P5QKL4",
    "modelUrl": "/models/abo-b073p5qkl4.glb",
    "category": "other",
    "aboType": "WALL_ART",
    "name": "Amazon Brand – Rivet Blue and Metallic Gold Geometric Print with Oak Hanger, 18\" x 24\"",
    "brand": "Rivet",
    "color": "Multi",
    "mount": "wall",
    "dimensions": [0.4586, 0.6079, 0.0121]
  },
  {
    "id": "abo-b073wh6n3r",
    "asin": "B073WH6N3R",
    "modelUrl": "/models/abo-b073wh6n3r.glb",
    "category": "mirror",
    "aboType": "HOME_MIRROR",
    "name": "Amazon Brand – Stone & Beam Vintage-Look Square Hanging Wall Mirror, 39.5 Inch Height, Tan and White",
    "brand": "Stone & Beam",
    "color": "Glass",
    "mount": "wall",
    "dimensions": [0.8043, 0.8043, 0.0612]
  },
  {
    "id": "abo-b073whzk9w",
    "asin": "B073WHZK9W",
    "modelUrl": "/models/abo-b073whzk9w.glb",
    "category": "mirror",
    "aboType": "HOME_MIRROR",
    "name": "Amazon Brand – Stone & Beam Rustic Ridged Metal Mirror, 24\" Diameter, Rust Finish",
    "brand": "Stone & Beam",
    "color": "Glass",
    "mount": "wall",
    "dimensions": [0.609, 0.609, 0.0559]
  },
  {
    "id": "abo-b075x33rzk",
    "asin": "B075X33RZK",
    "modelUrl": "/models/abo-b075x33rzk.glb",
    "category": "chair",
    "aboType": "CHAIR",
    "name": "Amazon Brand – Stone & Beam Larkin Living Room Accent Swivel Chair, 30\"W, Smokey Teal",
    "brand": "Stone & Beam",
    "color": "Smoky Teal",
    "mount": "floor",
    "dimensions": [0.7601, 0.9256, 0.8697]
  },
  {
    "id": "abo-b075x41rld",
    "asin": "B075X41RLD",
    "modelUrl": "/models/abo-b075x41rld.glb",
    "category": "desk",
    "aboType": "DESK",
    "name": "AmazonBasics Three Piece Corner/Gaming Desk - Black with Clear Glass",
    "brand": "AmazonBasics",
    "color": "Clear",
    "mount": "floor",
    "dimensions": [1.3462, 0.7366, 1.3462]
  },
  {
    "id": "abo-b075yp4wvq",
    "asin": "B075YP4WVQ",
    "modelUrl": "/models/abo-b075yp4wvq.glb",
    "category": "stool",
    "aboType": "STOOL_SEATING",
    "name": "Amazon Brand – Stone & Beam Sophia Modern Swivel Kitchen Bar Stool, 43.3\"H, Merlot",
    "brand": "Stone & Beam",
    "color": "Merlot",
    "mount": "floor",
    "dimensions": [0.4683, 1.0927, 0.5623]
  },
  {
    "id": "abo-b075yz16v7",
    "asin": "B075YZ16V7",
    "modelUrl": "/models/abo-b075yz16v7.glb",
    "category": "dresser",
    "aboType": "DRESSER",
    "name": "Amazon Brand – Rivet Mid-Century Stark 6-Drawer Dresser, 61\"W, Warm Espresso",
    "brand": "Rivet",
    "color": "Brown",
    "mount": "floor",
    "dimensions": [1.536, 0.8098, 0.4644]
  },
  {
    "id": "abo-b075zbvzst",
    "asin": "B075ZBVZST",
    "modelUrl": "/models/abo-b075zbvzst.glb",
    "category": "desk",
    "aboType": "DESK",
    "name": "Amazon Brand – Rivet Mid-Century Curved Wood Table Home Office Computer Desk, 48.4\"L, Walnut",
    "brand": "Rivet",
    "color": "Brown",
    "mount": "floor",
    "dimensions": [1.2562, 0.8005, 0.4864]
  },
  {
    "id": "abo-b075zbw1rr",
    "asin": "B075ZBW1RR",
    "modelUrl": "/models/abo-b075zbw1rr.glb",
    "category": "shelf",
    "aboType": "SHELF",
    "name": "Amazon Brand – Stone & Beam Larson Industrial Wood and Metal 2-Shelf Bookcase, 39\"H, Walnut",
    "brand": "Stone & Beam",
    "color": "Walnut + Metal",
    "mount": "floor",
    "dimensions": [0.8224, 0.9474, 0.3518]
  },
  {
    "id": "abo-b075zf4s39",
    "asin": "B075ZF4S39",
    "modelUrl": "/models/abo-b075zf4s39.glb",
    "category": "shelf",
    "aboType": "SHELF",
    "name": "Amazon Brand – Stone & Beam Barrett Reclaimed Wood 4-Shelf Bookcase, 40\"W, White and Sandstone Pine",
    "brand": "Stone & Beam",
    "color": "White/Brown",
    "mount": "floor",
    "dimensions": [1.0216, 1.8783, 0.3812]
  },
  {
    "id": "abo-b078jjdpr2",
    "asin": "B078JJDPR2",
    "modelUrl": "/models/abo-b078jjdpr2.glb",
    "category": "plant",
    "aboType": "VASE",
    "name": "Amazon Brand – Stone & Beam Modern Ceramic Home Decor Flower Vase - 7 Inch, Teal White Tan",
    "brand": "Stone & Beam",
    "color": null,
    "mount": "tabletop",
    "dimensions": [0.106, 0.1916, 0.106]
  },
  {
    "id": "abo-b07b4l9fhl",
    "asin": "B07B4L9FHL",
    "modelUrl": "/models/abo-b07b4l9fhl.glb",
    "category": "chair",
    "aboType": "CHAIR",
    "name": "Amazon Brand – Rivet Edgewest Low Back Modern Accent Chair, 34\"W, Grey Linen",
    "brand": "Rivet",
    "color": "Grey Linen",
    "mount": "floor",
    "dimensions": [0.963, 0.8614, 0.8657]
  },
  {
    "id": "abo-b07b4mtfl8",
    "asin": "B07B4MTFL8",
    "modelUrl": "/models/abo-b07b4mtfl8.glb",
    "category": "sofa",
    "aboType": "SOFA",
    "name": "Amazon Brand – Stone & Beam Andover Modern Sofa Couch, 78\"W, Charcoal",
    "brand": "Stone & Beam",
    "color": "Charcoal",
    "mount": "floor",
    "dimensions": [2.2076, 0.9648, 0.9479]
  },
  {
    "id": "abo-b07b4scb6t",
    "asin": "B07B4SCB6T",
    "modelUrl": "/models/abo-b07b4scb6t.glb",
    "category": "bed",
    "aboType": "BED",
    "name": "Stone & Beam Tisbury Nailhead Trim Queen Bed, 66\"W, Spinnsol Cocoa",
    "brand": "Stone & Beam",
    "color": "Spinnsol Cocoa",
    "mount": "floor",
    "dimensions": [1.7128, 1.4429, 2.3722]
  },
  {
    "id": "abo-b07b4w5v3c",
    "asin": "B07B4W5V3C",
    "modelUrl": "/models/abo-b07b4w5v3c.glb",
    "category": "bed",
    "aboType": "BED",
    "name": "Amazon Brand – Stone & Beam Tisbury Nailhead Trim Queen Bed, 66\"W, Curious Pearl",
    "brand": "Stone & Beam",
    "color": "Curious Pearl",
    "mount": "floor",
    "dimensions": [1.7119, 1.4426, 2.3717]
  },
  {
    "id": "abo-b07b4yltp5",
    "asin": "B07B4YLTP5",
    "modelUrl": "/models/abo-b07b4yltp5.glb",
    "category": "rug",
    "aboType": "RUG",
    "name": "Amazon Brand – Rivet Modern Chevron Wool Runner Rug, 2' 6\" x 8', Blue, Green, Ivory",
    "brand": "Rivet",
    "color": "Blue, Green, Ivory",
    "mount": "floor",
    "dimensions": [2.4367, 0.0079, 0.7743]
  },
  {
    "id": "abo-b07b4z6pyt",
    "asin": "B07B4Z6PYT",
    "modelUrl": "/models/abo-b07b4z6pyt.glb",
    "category": "bed",
    "aboType": "BED",
    "name": "Amazon Brand – Stone & Beam Prudence Tufted Queen Bed, 66\"W, Spinnsol Iron",
    "brand": "Stone & Beam",
    "color": "Spinnsol Iron",
    "mount": "floor",
    "dimensions": [1.6981, 1.4272, 2.3867]
  },
  {
    "id": "abo-b07b4zm575",
    "asin": "B07B4ZM575",
    "modelUrl": "/models/abo-b07b4zm575.glb",
    "category": "bed",
    "aboType": "BED",
    "name": "Amazon Brand – Stone & Beam Prudence Tufted Queen Bed, 66\"W, Fresh Pewter",
    "brand": "Stone & Beam",
    "color": "Fresh Pewter",
    "mount": "floor",
    "dimensions": [1.6981, 1.4272, 2.2305]
  },
  {
    "id": "abo-b07b4zr624",
    "asin": "B07B4ZR624",
    "modelUrl": "/models/abo-b07b4zr624.glb",
    "category": "rug",
    "aboType": "RUG",
    "name": "Amazon Brand – Rivet Geometric Wool Area Rug, 5 x 8 Foot, Dark Grey, Ivory",
    "brand": "Rivet",
    "color": "Dark Gray, Ivory",
    "mount": "floor",
    "dimensions": [2.4328, 0.0073, 1.5164]
  },
  {
    "id": "abo-b07b7dkrw4",
    "asin": "B07B7DKRW4",
    "modelUrl": "/models/abo-b07b7dkrw4.glb",
    "category": "desk",
    "aboType": "DESK",
    "name": "Amazon Brand – Stone & Beam Anne Farmhouse French Wood Desk, 62\"W, Blue",
    "brand": "Stone & Beam",
    "color": "Blue",
    "mount": "floor",
    "dimensions": [1.2886, 0.8606, 0.6298]
  },
  {
    "id": "abo-b07b7dl3gx",
    "asin": "B07B7DL3GX",
    "modelUrl": "/models/abo-b07b7dl3gx.glb",
    "category": "desk",
    "aboType": "DESK",
    "name": "Amazon Brand – Stone & Beam Casual Wood Office Computer Desk, 60\"W, Birch",
    "brand": "Stone & Beam",
    "color": "Birch",
    "mount": "floor",
    "dimensions": [1.4987, 0.7622, 0.8128]
  },
  {
    "id": "abo-b07b8nw6gg",
    "asin": "B07B8NW6GG",
    "modelUrl": "/models/abo-b07b8nw6gg.glb",
    "category": "mirror",
    "aboType": "HOME_MIRROR",
    "name": "Amazon Brand – Stone & Beam Rustic Farmhouse Round Wood Iron Mirror with Faux Leather Strap - 22 Inch, Black Metal",
    "brand": "Stone & Beam",
    "color": "Galvanized",
    "mount": "wall",
    "dimensions": [0.3549, 0.5678, 0.0423]
  },
  {
    "id": "abo-b07b8p1jct",
    "asin": "B07B8P1JCT",
    "modelUrl": "/models/abo-b07b8p1jct.glb",
    "category": "shelf",
    "aboType": "SHELF",
    "name": "Amazon Brand – Rivet Modern Metal Shelf, 24\"W, Black",
    "brand": "Rivet",
    "color": "Black",
    "mount": "wall",
    "dimensions": [0.6051, 0.0529, 0.1016]
  },
  {
    "id": "abo-b07cb5gsz2",
    "asin": "B07CB5GSZ2",
    "modelUrl": "/models/abo-b07cb5gsz2.glb",
    "category": "sofa",
    "aboType": "SOFA",
    "name": "Amazon Brand – Stone & Beam Andover Modern Left Chaise Sofa Sectional, 126\"W, Pewter",
    "brand": "Stone & Beam",
    "color": "Pewter",
    "mount": "floor",
    "dimensions": [3.4711, 0.9539, 1.6062]
  },
  {
    "id": "abo-b07dbb7fvl",
    "asin": "B07DBB7FVL",
    "modelUrl": "/models/abo-b07dbb7fvl.glb",
    "category": "table",
    "aboType": "TABLE",
    "name": "Amazon Brand – Ravenna Home Morley Classic Round Pedestal Side End Table, 20\"W, Black",
    "brand": "Ravenna Home",
    "color": "Black",
    "mount": "floor",
    "dimensions": [0.4815, 0.6646, 0.4815]
  },
  {
    "id": "abo-b07dbdv3fh",
    "asin": "B07DBDV3FH",
    "modelUrl": "/models/abo-b07dbdv3fh.glb",
    "category": "lamp",
    "aboType": "LAMP",
    "name": "Amazon Brand – Ravenna Home Swing Arm Living Room Floor Lamp With LED Light Bulb - 58 Inches, Brushed Steel",
    "brand": "Ravenna Home",
    "color": "Brushed Steel",
    "mount": "floor",
    "dimensions": [0.3554, 1.4731, 0.3554]
  },
  {
    "id": "abo-b07dbft2yg",
    "asin": "B07DBFT2YG",
    "modelUrl": "/models/abo-b07dbft2yg.glb",
    "category": "table",
    "aboType": "TABLE",
    "name": "Amazon Brand – Ravenna Home Angela Modern Turned Leg Wood Shelf Storage Coffee Table, 44\"W, Grey",
    "brand": "Ravenna Home",
    "color": "Grey",
    "mount": "floor",
    "dimensions": [1.1095, 0.5058, 0.5511]
  },
  {
    "id": "abo-b07dbgv427",
    "asin": "B07DBGV427",
    "modelUrl": "/models/abo-b07dbgv427.glb",
    "category": "ottoman",
    "aboType": "OTTOMAN",
    "name": "Amazon Brand – Ravenna Home Tolt Upholstered Storage Ottoman Bench, 48\"W, Charcoal",
    "brand": "Ravenna Home",
    "color": "Charcoal",
    "mount": "floor",
    "dimensions": [1.2693, 0.4379, 0.4463]
  },
  {
    "id": "abo-b07dbhckhy",
    "asin": "B07DBHCKHY",
    "modelUrl": "/models/abo-b07dbhckhy.glb",
    "category": "chair",
    "aboType": "CHAIR",
    "name": "Amazon Brand – Ravenna Home Tufted Armless English Roll Traditional Accent Chair, 26.8\"W, Merlot Red",
    "brand": "Ravenna Home",
    "color": "Merlot",
    "mount": "floor",
    "dimensions": [0.5816, 0.75, 0.6049]
  },
  {
    "id": "abo-b07f2hnx7w",
    "asin": "B07F2HNX7W",
    "modelUrl": "/models/abo-b07f2hnx7w.glb",
    "category": "stool",
    "aboType": "STOOL_SEATING",
    "name": "Ravenna Home Luna Rustic Wood Stool, 2-Pack",
    "brand": "Ravenna Home",
    "color": null,
    "mount": "floor",
    "dimensions": [0.4258, 1.098, 0.504]
  },
  {
    "id": "abo-b07f2x8k62",
    "asin": "B07F2X8K62",
    "modelUrl": "/models/abo-b07f2x8k62.glb",
    "category": "chair",
    "aboType": "CHAIR",
    "name": "Amazon Brand – Ravenna Home Radford Modern Curved Arm Accent Chair, 28.15\"W",
    "brand": "Ravenna Home",
    "color": null,
    "mount": "floor",
    "dimensions": [0.715, 1.01, 0.8634]
  },
  {
    "id": "abo-b07hkgy4yz",
    "asin": "B07HKGY4YZ",
    "modelUrl": "/models/abo-b07hkgy4yz.glb",
    "category": "lamp",
    "aboType": "LAMP",
    "name": "Amazon Brand – Rivet Mid-Century Table Lamp with Bulb, 18\"H, Matte White",
    "brand": "Rivet",
    "color": "Grey",
    "mount": "tabletop",
    "dimensions": [0.299, 0.4543, 0.3406]
  },
  {
    "id": "abo-b07hsbd8dm",
    "asin": "B07HSBD8DM",
    "modelUrl": "/models/abo-b07hsbd8dm.glb",
    "category": "dresser",
    "aboType": "CABINET",
    "name": "Amazon Brand – Stone & Beam Traditional Buffet Storage Cabinet - 68 Inch, Brown",
    "brand": "Stone & Beam",
    "color": "Brown",
    "mount": "floor",
    "dimensions": [1.7078, 0.8201, 0.5223]
  },
  {
    "id": "abo-b07hsf6z8g",
    "asin": "B07HSF6Z8G",
    "modelUrl": "/models/abo-b07hsf6z8g.glb",
    "category": "stool",
    "aboType": "STOOL_SEATING",
    "name": "Amazon Brand – Stone & Beam Kinsley Kitchen Counter Height Stool, 38\"H, Washed Denim",
    "brand": "Stone & Beam",
    "color": "Washed Denim",
    "mount": "floor",
    "dimensions": [0.4977, 0.9812, 0.6083]
  },
  {
    "id": "abo-b07hsh4zr2",
    "asin": "B07HSH4ZR2",
    "modelUrl": "/models/abo-b07hsh4zr2.glb",
    "category": "dresser",
    "aboType": "DRESSER",
    "name": "Amazon Brand – Rivet Kingston Modern Dresser 19.69\"W, White",
    "brand": "Rivet",
    "color": "White",
    "mount": "floor",
    "dimensions": [0.5026, 0.5679, 0.4135]
  },
  {
    "id": "abo-b07hsky87x",
    "asin": "B07HSKY87X",
    "modelUrl": "/models/abo-b07hsky87x.glb",
    "category": "table",
    "aboType": "TABLE",
    "name": "Amazon Brand – Rivet Modern End Table, 19.3 Inch Width, Natural and Gold",
    "brand": "Rivet",
    "color": null,
    "mount": "floor",
    "dimensions": [0.5305, 0.7058, 0.5771]
  },
  {
    "id": "abo-b07hsl4ts1",
    "asin": "B07HSL4TS1",
    "modelUrl": "/models/abo-b07hsl4ts1.glb",
    "category": "dresser",
    "aboType": "DRESSER",
    "name": "Amazon Brand – Rivet Kingston Modern Chest of Drawers 35.43\"W, White",
    "brand": "Rivet",
    "color": "White",
    "mount": "floor",
    "dimensions": [0.9048, 0.7214, 0.4567]
  },
  {
    "id": "abo-b07hslqy2f",
    "asin": "B07HSLQY2F",
    "modelUrl": "/models/abo-b07hslqy2f.glb",
    "category": "shelf",
    "aboType": "SHELF",
    "name": "Amazon Brand – Rivet Modern Corner Floating Triangle 5 Shelf Wall Unit Decor - 36 Inch, Natural Wood and Gold",
    "brand": "Rivet",
    "color": null,
    "mount": "floor",
    "dimensions": [0.5639, 0.9131, 0.2941]
  },
  {
    "id": "abo-b07hz5rt3y",
    "asin": "B07HZ5RT3Y",
    "modelUrl": "/models/abo-b07hz5rt3y.glb",
    "category": "sofa",
    "aboType": "SOFA",
    "name": "Amazon Brand – Stone & Beam Blaine Modern Loveseat Sofa, 55.9\"W, Light Grey",
    "brand": "Stone & Beam",
    "color": "Light Grey",
    "mount": "floor",
    "dimensions": [1.5033, 0.9807, 0.9854]
  },
  {
    "id": "abo-b07jkjstl4",
    "asin": "B07JKJSTL4",
    "modelUrl": "/models/abo-b07jkjstl4.glb",
    "category": "other",
    "aboType": "PILLOW",
    "name": "Amazon Brand – Rivet Modern Geometric Throw Pillow - 18 x 18 Inch, Blue",
    "brand": "Rivet",
    "color": "Blue",
    "mount": "tabletop",
    "dimensions": [0.5359, 0.5064, 0.2287]
  },
  {
    "id": "abo-b07jlzj94r",
    "asin": "B07JLZJ94R",
    "modelUrl": "/models/abo-b07jlzj94r.glb",
    "category": "other",
    "aboType": "PILLOW",
    "name": "Amazon Brand – Stone & Beam Classic Ticking Stripe Throw Pillow - 17 x 17 Inch, Indigo",
    "brand": "Stone & Beam",
    "color": "Indigo",
    "mount": "tabletop",
    "dimensions": [0.4679, 0.4445, 0.1385]
  },
  {
    "id": "abo-b07mbfd87n",
    "asin": "B07MBFD87N",
    "modelUrl": "/models/abo-b07mbfd87n.glb",
    "category": "lamp",
    "aboType": "LAMP",
    "name": "Amazon Brand – Ravenna Home Faux Wood Table Lamp, Bulb Included, 18\"H, White",
    "brand": "Ravenna Home",
    "color": "White",
    "mount": "tabletop",
    "dimensions": [0.2082, 0.4553, 0.2082]
  },
  {
    "id": "abo-b07mbfdwnm",
    "asin": "B07MBFDWNM",
    "modelUrl": "/models/abo-b07mbfdwnm.glb",
    "category": "lamp",
    "aboType": "LAMP",
    "name": "Amazon Brand – Ravenna Home Round Base Floor Lamp with LED Light Bulb, 58\"H, Dark Bronze",
    "brand": "Ravenna Home",
    "color": "Dark Bronze",
    "mount": "floor",
    "dimensions": [0.2864, 1.4622, 0.2864]
  },
  {
    "id": "abo-b07mm5h3hx",
    "asin": "B07MM5H3HX",
    "modelUrl": "/models/abo-b07mm5h3hx.glb",
    "category": "table",
    "aboType": "TABLE",
    "name": "Ravenna Home Classic Plank-Top Console Table with Large Drawer, 42\"W, Black Wood",
    "brand": "Ravenna Home",
    "color": null,
    "mount": "floor",
    "dimensions": [1.062, 0.768, 0.373]
  },
  {
    "id": "abo-b07nyshh9w",
    "asin": "B07NYSHH9W",
    "modelUrl": "/models/abo-b07nyshh9w.glb",
    "category": "table",
    "aboType": "TABLE",
    "name": "Ravenna Home Classic Plank-Top End Table, 18\"W, Espresso Wood",
    "brand": "Ravenna Home",
    "color": "Espresso",
    "mount": "floor",
    "dimensions": [0.6025, 0.6053, 0.4598]
  },
  {
    "id": "abo-b07ppnncm2",
    "asin": "B07PPNNCM2",
    "modelUrl": "/models/abo-b07ppnncm2.glb",
    "category": "shelf",
    "aboType": "SHELF",
    "name": "AmazonBasics Modern 5-Tier Ladder Bookshelf Organizer with Solid Rubber Wood Frame, White",
    "brand": "AmazonBasics",
    "color": "White",
    "mount": "floor",
    "dimensions": [0.636, 1.7795, 0.3413]
  },
  {
    "id": "abo-b07qd6v1vt",
    "asin": "B07QD6V1VT",
    "modelUrl": "/models/abo-b07qd6v1vt.glb",
    "category": "desk",
    "aboType": "DESK",
    "name": "Amazon Brand – Rivet Classic Desk, 39.4\"W, Dark Espresso",
    "brand": "Rivet",
    "color": "Dark Espresso",
    "mount": "floor",
    "dimensions": [1.0008, 0.7622, 0.5485]
  },
  {
    "id": "abo-b07qx2bydh",
    "asin": "B07QX2BYDH",
    "modelUrl": "/models/abo-b07qx2bydh.glb",
    "category": "desk",
    "aboType": "DESK",
    "name": "AmazonBasics Gaming Computer Desk with Storage for Controller, Headphone & Speaker - Black",
    "brand": "AmazonBasics",
    "color": "Black",
    "mount": "floor",
    "dimensions": [1.2899, 0.88, 0.58]
  },
  {
    "id": "abo-b07rqmsjrx",
    "asin": "B07RQMSJRX",
    "modelUrl": "/models/abo-b07rqmsjrx.glb",
    "category": "mirror",
    "aboType": "HOME_MIRROR",
    "name": "Amazon Basics Rectangular Wall Mirror - 20\" x 28\", Peaked Trim, Walnut",
    "brand": "Amazon Basics",
    "color": "Walnut",
    "mount": "wall",
    "dimensions": [0.508, 0.711, 0.039]
  },
  {
    "id": "abo-b07tmh6289",
    "asin": "B07TMH6289",
    "modelUrl": "/models/abo-b07tmh6289.glb",
    "category": "chair",
    "aboType": "CHAIR",
    "name": "AmazonBasics LeatherSoft Kids/Youth Recliner with Armrest Storage, 5+ Age Group, Light Blue",
    "brand": "AmazonBasics",
    "color": "Light Blue",
    "mount": "floor",
    "dimensions": [0.6801, 0.7018, 0.709]
  },
  {
    "id": "abo-b082xlc9b4",
    "asin": "B082XLC9B4",
    "modelUrl": "/models/abo-b082xlc9b4.glb",
    "category": "lamp",
    "aboType": "LAMP",
    "name": "Amazon Brand – Rivet Scandinavian Task Lamp, 19\"H, Matte Black",
    "brand": "Rivet",
    "color": "Black",
    "mount": "tabletop",
    "dimensions": [0.2866, 0.4826, 0.1524]
  },
  {
    "id": "abo-b084t9x9nn",
    "asin": "B084T9X9NN",
    "modelUrl": "/models/abo-b084t9x9nn.glb",
    "category": "table",
    "aboType": "TABLE",
    "name": "Amazon Brand – Ravenna Home Modern Farmhouse Coffee Table, 40\"W, Antique Gray Pine",
    "brand": "Ravenna Home",
    "color": "Antique Gray",
    "mount": "floor",
    "dimensions": [1.0164, 0.456, 0.5594]
  }
];

export const MODELS_BY_ID = new Map(CATALOG_MODELS.map((m) => [m.id, m]));
