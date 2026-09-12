import type { CatalogItem } from "./catalogItem";

// Hand-authored catalog items, measured off live IKEA product pages by a
// person. The build NEVER touches this file, and an entry here overrides the
// generated row with the same id — so re-running scripts/build-catalog.mjs to
// refresh prices and links cannot undo a correction made here.
//
// measuredAxes lists ONLY the axes a retailer actually stated. IKEA's listing
// cards give width x height for drawer units and width x depth for desks, and
// rarely give all three, so an unstated axis is filled from the stand-in
// model and deliberately left out of that list.
//
// Regenerate with: node scripts/add-verified.mjs
export const MANUAL_ITEMS: CatalogItem[] = [
  {
    "id": "ikea-30515917",
    "name": "HOVET Mirror",
    "brand": "IKEA",
    "category": "mirror",
    "priceCents": 16999,
    "productUrl": "https://www.ikea.com/us/en/p/hovet-mirror-black-30515917/",
    "imageUrl": "https://www.ikea.com/us/en/images/products/hovet-mirror-black__1100010_pe866038_s5.jpg",
    "dimensions": [
      0.781,
      1.959,
      0.06
    ],
    "modelId": "abo-b07rqmsjrx",
    "mount": "wall",
    "dominantHex": "#2B2B2D",
    "styleTags": [
      "mirror",
      "black",
      "ikea"
    ],
    "measuredAxes": [
      "width",
      "height",
      "depth"
    ],
    "verified": true
  },
  {
    "id": "ikea-19445469",
    "name": "LOBERGET / MALSKÄR Swivel chair",
    "brand": "IKEA",
    "category": "chair",
    "priceCents": 5999,
    "productUrl": "https://www.ikea.com/us/en/p/loberget-malskaer-swivel-chair-white-s19445469/",
    "imageUrl": "https://www.ikea.com/us/en/images/products/loberget-malskaer-swivel-chair-white__1078458_pe857202_s5.jpg",
    "dimensions": [
      0.67,
      0.899,
      0.67
    ],
    "modelId": "abo-b07dbhckhy",
    "mount": "floor",
    "dominantHex": "#F2F2F0",
    "styleTags": [
      "chair",
      "white",
      "ikea"
    ],
    "measuredAxes": [
      "width",
      "height",
      "depth"
    ],
    "verified": true
  },
  {
    "id": "ikea-60416925",
    "name": "KYRRE Stool",
    "brand": "IKEA",
    "category": "stool",
    "priceCents": 1999,
    "productUrl": "https://www.ikea.com/us/en/p/kyrre-stool-birch-60416925/",
    "imageUrl": "https://www.ikea.com/us/en/images/products/kyrre-stool-birch__1488024_pe1003293_s5.jpg",
    "dimensions": [
      0.419,
      0.451,
      0.479
    ],
    "modelId": "abo-b07hsf6z8g",
    "mount": "floor",
    "dominantHex": "#DFCCA8",
    "styleTags": [
      "stool",
      "birch",
      "ikea"
    ],
    "measuredAxes": [
      "width",
      "height",
      "depth"
    ],
    "verified": true
  },
  {
    "id": "ikea-80618531",
    "name": "SALTMYRAN Loveseat",
    "brand": "IKEA",
    "category": "sofa",
    "priceCents": 29900,
    "productUrl": "https://www.ikea.com/us/en/p/saltmyran-loveseat-oereryd-gray-beige-80618531/",
    "imageUrl": "https://www.ikea.com/us/en/images/products/saltmyran-loveseat-oereryd-gray-beige__1576105_pe1032229_s5.jpg",
    "dimensions": [
      1.47,
      0.771,
      0.791
    ],
    "modelId": "abo-b07hz5rt3y",
    "mount": "floor",
    "dominantHex": "#8A8D8F",
    "styleTags": [
      "sofa",
      "gray",
      "ikea"
    ],
    "measuredAxes": [
      "width",
      "height",
      "depth"
    ],
    "verified": true
  },
  {
    "id": "ikea-80395248",
    "name": "NEIDEN Bed frame, Twin",
    "brand": "IKEA",
    "category": "bed",
    "priceCents": 8900,
    "productUrl": "https://www.ikea.com/us/en/p/neiden-bed-frame-pine-80395248/",
    "imageUrl": "https://www.ikea.com/us/en/images/products/neiden-bed-frame-pine__0749131_pe745500_s5.jpg",
    "dimensions": [
      1.01,
      0.651,
      1.949
    ],
    "modelId": "abo-b07b4z6pyt",
    "mount": "floor",
    "dominantHex": "#D6BC8E",
    "styleTags": [
      "bed",
      "pine",
      "ikea"
    ],
    "measuredAxes": [
      "width",
      "height",
      "depth"
    ],
    "verified": true
  },
  {
    "id": "ikea-10601124",
    "name": "CENTERHALV Office chair",
    "brand": "IKEA",
    "category": "chair",
    "priceCents": 19999,
    "productUrl": "https://www.ikea.com/us/en/p/centerhalv-office-chair-black-10601124/",
    "imageUrl": "https://www.ikea.com/us/en/images/products/centerhalv-office-chair-black__1408739_pe971989_s5.jpg",
    "dimensions": [
      0.689,
      1.299,
      0.66
    ],
    "modelId": "abo-b07dbhckhy",
    "mount": "floor",
    "dominantHex": "#2B2B2D",
    "styleTags": [
      "chair",
      "black",
      "ikea"
    ],
    "measuredAxes": [
      "width",
      "height",
      "depth"
    ],
    "verified": true
  },
  {
    "id": "ikea-30533493",
    "name": "EKENÄSET Armchair",
    "brand": "IKEA",
    "category": "chair",
    "priceCents": 29900,
    "productUrl": "https://www.ikea.com/us/en/p/ekenaeset-armchair-kilanda-light-beige-30533493/",
    "imageUrl": "https://www.ikea.com/us/en/images/products/ekenaeset-armchair-kilanda-light-beige__1109687_pe870153_s5.jpg",
    "dimensions": [
      0.641,
      0.759,
      0.781
    ],
    "modelId": "abo-b075x33rzk",
    "mount": "floor",
    "dominantHex": "#C9C6BE",
    "styleTags": [
      "chair",
      "beige",
      "ikea"
    ],
    "measuredAxes": [
      "width",
      "height",
      "depth"
    ],
    "verified": true
  },
  {
    "id": "ikea-60595936",
    "name": "GLOSTAD Ottoman",
    "brand": "IKEA",
    "category": "ottoman",
    "priceCents": 5000,
    "productUrl": "https://www.ikea.com/us/en/p/glostad-ottoman-knisa-dark-gray-60595936/",
    "imageUrl": "https://www.ikea.com/us/en/images/products/glostad-ottoman-knisa-dark-gray__1577731_pe1033478_s5.jpg",
    "dimensions": [
      0.679,
      0.41,
      0.581
    ],
    "modelId": "abo-b07dbgv427",
    "mount": "floor",
    "dominantHex": "#8A8D8F",
    "styleTags": [
      "ottoman",
      "gray",
      "ikea"
    ],
    "measuredAxes": [
      "width",
      "height",
      "depth"
    ],
    "verified": true
  },
  {
    "id": "ikea-70437814",
    "name": "BARLAST Floor lamp",
    "brand": "IKEA",
    "category": "lamp",
    "priceCents": 999,
    "productUrl": "https://www.ikea.com/us/en/p/barlast-floor-lamp-black-white-70437814/",
    "imageUrl": "https://www.ikea.com/us/en/images/products/barlast-floor-lamp-black-white__0957676_pe805130_s5.jpg",
    "dimensions": [
      0.33,
      1.499,
      0.33
    ],
    "modelId": "abo-b07dbdv3fh",
    "mount": "floor",
    "dominantHex": "#F2F2F0",
    "styleTags": [
      "lamp",
      "white",
      "ikea"
    ],
    "measuredAxes": [
      "width",
      "height",
      "depth"
    ],
    "verified": true
  },
  {
    "id": "ikea-90541536",
    "name": "ÖKENSAND Floor lamp",
    "brand": "IKEA",
    "category": "lamp",
    "priceCents": 8999,
    "productUrl": "https://www.ikea.com/us/en/p/oekensand-floor-lamp-beech-white-90541536/",
    "imageUrl": "https://www.ikea.com/us/en/images/products/oekensand-floor-lamp-beech-white__1187892_pe899535_s5.jpg",
    "dimensions": [
      0.483,
      1.549,
      0.483
    ],
    "modelId": "abo-b07dbdv3fh",
    "mount": "tabletop",
    "dominantHex": "#F2F2F0",
    "styleTags": [
      "lamp",
      "white",
      "ikea"
    ],
    "measuredAxes": [
      "width",
      "height",
      "depth"
    ],
    "verified": true
  },
  {
    "id": "ikea-70096377",
    "name": "FADO Table lamp",
    "brand": "IKEA",
    "category": "lamp",
    "priceCents": 2999,
    "productUrl": "https://www.ikea.com/us/en/p/fado-table-lamp-white-70096377/",
    "imageUrl": "https://www.ikea.com/us/en/images/products/fado-table-lamp-white__0606976_pe682645_s5.jpg",
    "dimensions": [
      0.254,
      0.229,
      0.254
    ],
    "modelId": "abo-b07hkgy4yz",
    "mount": "tabletop",
    "dominantHex": "#F2F2F0",
    "styleTags": [
      "lamp",
      "white",
      "ikea"
    ],
    "measuredAxes": [
      "width",
      "height",
      "depth"
    ],
    "verified": true
  },
  {
    "id": "ikea-10135659",
    "name": "MARIUS Stool",
    "brand": "IKEA",
    "category": "stool",
    "priceCents": 899,
    "productUrl": "https://www.ikea.com/us/en/p/marius-stool-black-10135659/",
    "imageUrl": "https://www.ikea.com/us/en/images/products/marius-stool-black__0727386_pe735638_s5.jpg",
    "dimensions": [
      0.4,
      0.451,
      0.4
    ],
    "modelId": "abo-b07hsf6z8g",
    "mount": "floor",
    "dominantHex": "#2B2B2D",
    "styleTags": [
      "stool",
      "black",
      "ikea"
    ],
    "measuredAxes": [
      "width",
      "height",
      "depth"
    ],
    "verified": true
  },
  {
    "id": "ikea-40559166",
    "name": "TIPHEDE Rug, flatwoven",
    "brand": "IKEA",
    "category": "rug",
    "priceCents": 3999,
    "productUrl": "https://www.ikea.com/us/en/p/tiphede-rug-flatwoven-natural-black-40559166/",
    "imageUrl": "https://www.ikea.com/us/en/images/products/tiphede-rug-flatwoven-natural-black__0772066_pe755879_s5.jpg",
    "dimensions": [
      2.21,
      0.01,
      2.794
    ],
    "modelId": "abo-b0735t6948",
    "mount": "floor",
    "dominantHex": "#2B2B2D",
    "styleTags": [
      "rug",
      "black",
      "ikea"
    ],
    "measuredAxes": [
      "width",
      "height",
      "depth"
    ],
    "verified": true
  },
  {
    "id": "ikea-80635451",
    "name": "ÄRENDE Rug, high pile",
    "brand": "IKEA",
    "category": "rug",
    "priceCents": 6999,
    "productUrl": "https://www.ikea.com/us/en/p/aerende-rug-high-pile-off-white-80635451/",
    "imageUrl": "https://www.ikea.com/us/en/images/products/aerende-rug-high-pile-off-white__1495132_pe1004961_s5.jpg",
    "dimensions": [
      1.6,
      0.032,
      2.311
    ],
    "modelId": "abo-b0735t6948",
    "mount": "floor",
    "dominantHex": "#F2F2F0",
    "styleTags": [
      "rug",
      "white",
      "ikea"
    ],
    "measuredAxes": [
      "width",
      "height",
      "depth"
    ],
    "verified": true
  },
  {
    "id": "ikea-90607688",
    "name": "STOENSE Rug, low pile",
    "brand": "IKEA",
    "category": "rug",
    "priceCents": 24999,
    "productUrl": "https://www.ikea.com/us/en/p/stoense-rug-low-pile-green-90607688/",
    "imageUrl": "https://www.ikea.com/us/en/images/products/stoense-rug-low-pile-green__1405714_pe970548_s5.jpg",
    "dimensions": [
      2.388,
      0.019,
      3.048
    ],
    "modelId": "abo-b0735t6948",
    "mount": "floor",
    "dominantHex": "#4A5D4E",
    "styleTags": [
      "rug",
      "green",
      "ikea"
    ],
    "measuredAxes": [
      "width",
      "height",
      "depth"
    ],
    "verified": true
  },
  {
    "id": "ikea-40541421",
    "name": "HOLMERUD Side table",
    "brand": "IKEA",
    "category": "table",
    "priceCents": 5999,
    "productUrl": "https://www.ikea.com/us/en/p/holmerud-side-table-oak-effect-40541421/",
    "imageUrl": "https://www.ikea.com/us/en/images/products/holmerud-side-table-oak-effect__1193662_pe901564_s5.jpg",
    "dimensions": [
      0.8,
      0.521,
      0.311
    ],
    "modelId": "abo-b07mm5h3hx",
    "mount": "floor",
    "dominantHex": "#C8A87C",
    "styleTags": [
      "table",
      "oak",
      "ikea"
    ],
    "measuredAxes": [
      "width",
      "height",
      "depth"
    ],
    "verified": true
  },
  {
    "id": "ikea-00104291",
    "name": "LACK Coffee table",
    "brand": "IKEA",
    "category": "table",
    "priceCents": 2999,
    "productUrl": "https://www.ikea.com/us/en/p/lack-coffee-table-black-brown-00104291/",
    "imageUrl": "https://www.ikea.com/us/en/images/products/lack-coffee-table-black-brown__57537_pe163119_s5.jpg",
    "dimensions": [
      0.898,
      0.451,
      0.549
    ],
    "modelId": "abo-b084t9x9nn",
    "mount": "floor",
    "dominantHex": "#2B2B2D",
    "styleTags": [
      "table",
      "black",
      "ikea"
    ],
    "measuredAxes": [
      "width",
      "height",
      "depth"
    ],
    "verified": true
  },
  {
    "id": "ikea-00473546",
    "name": "ALEX Drawer unit",
    "brand": "IKEA",
    "category": "desk",
    "priceCents": 9500,
    "productUrl": "https://www.ikea.com/us/en/p/alex-drawer-unit-white-00473546/",
    "imageUrl": "https://www.ikea.com/us/en/images/products/alex-drawer-unit-white__0977775_pe813763_s5.jpg",
    "dimensions": [
      0.359,
      0.699,
      0.548
    ],
    "modelId": "abo-b07qd6v1vt",
    "mount": "floor",
    "dominantHex": "#F2F2F0",
    "styleTags": [
      "desk",
      "white",
      "ikea"
    ],
    "measuredAxes": [
      "width",
      "height"
    ],
    "verified": false
  },
  {
    "id": "ikea-s49480188",
    "name": "NEIDEN Bed frame, Full",
    "brand": "IKEA",
    "category": "bed",
    "priceCents": 10900,
    "productUrl": "https://www.ikea.com/us/en/p/neiden-bed-frame-pine-s49480188/",
    "imageUrl": null,
    "mount": "floor",
    "dominantHex": "#D6BC8E",
    "styleTags": [
      "bed",
      "pine",
      "ikea"
    ],
    "dimensions": [
      1.391,
      0.651,
      1.949
    ],
    "modelId": "abo-b07b4z6pyt",
    "measuredAxes": [
      "width",
      "height",
      "depth"
    ],
    "verified": true
  },
  {
    "id": "ikea-10192824",
    "name": "MICKE Desk, 28 3/4\"",
    "brand": "IKEA",
    "category": "desk",
    "priceCents": 6999,
    "productUrl": "https://www.ikea.com/us/en/p/micke-desk-white-10192824/",
    "imageUrl": null,
    "mount": "floor",
    "dominantHex": "#F2F2F0",
    "styleTags": [
      "desk",
      "white",
      "ikea"
    ],
    "dimensions": [
      0.73,
      0.762,
      0.498
    ],
    "modelId": "abo-b07qd6v1vt",
    "measuredAxes": [
      "width",
      "depth"
    ],
    "verified": false
  },
  {
    "id": "ikea-s09291378",
    "name": "MICKE Corner workstation",
    "brand": "IKEA",
    "category": "desk",
    "priceCents": 29999,
    "productUrl": "https://www.ikea.com/us/en/p/micke-corner-workstation-white-s09291378/",
    "imageUrl": null,
    "mount": "floor",
    "dominantHex": "#F2F2F0",
    "styleTags": [
      "desk",
      "corner",
      "ikea"
    ],
    "dimensions": [
      1,
      0.737,
      1.419
    ],
    "modelId": "abo-b075x41rld",
    "measuredAxes": [
      "width",
      "depth"
    ],
    "verified": false
  },
  {
    "id": "ikea-30484075",
    "name": "ALEX Drawer unit with 9 drawers",
    "brand": "IKEA",
    "category": "dresser",
    "priceCents": 22999,
    "productUrl": "https://www.ikea.com/us/en/p/alex-drawer-unit-with-9-drawers-white-30484075/",
    "imageUrl": null,
    "mount": "floor",
    "dominantHex": "#F2F2F0",
    "styleTags": [
      "dresser",
      "white",
      "ikea"
    ],
    "dimensions": [
      0.359,
      1.159,
      0.413
    ],
    "modelId": "abo-b07hsh4zr2",
    "measuredAxes": [
      "width",
      "height"
    ],
    "verified": false
  },
  {
    "id": "ikea-40473547",
    "name": "ALEX Drawer unit on casters",
    "brand": "IKEA",
    "category": "dresser",
    "priceCents": 22999,
    "productUrl": "https://www.ikea.com/us/en/p/alex-drawer-unit-on-casters-white-40473547/",
    "imageUrl": null,
    "mount": "floor",
    "dominantHex": "#F2F2F0",
    "styleTags": [
      "dresser",
      "white",
      "ikea"
    ],
    "dimensions": [
      0.67,
      0.66,
      0.413
    ],
    "modelId": "abo-b07hsh4zr2",
    "measuredAxes": [
      "width",
      "height"
    ],
    "verified": false
  },
  {
    "id": "ikea-90484077",
    "name": "ALEX Drawer unit/drop file storage",
    "brand": "IKEA",
    "category": "dresser",
    "priceCents": 12999,
    "productUrl": "https://www.ikea.com/us/en/p/alex-drawer-unit-drop-file-storage-white-90484077/",
    "imageUrl": null,
    "mount": "floor",
    "dominantHex": "#F2F2F0",
    "styleTags": [
      "dresser",
      "white",
      "ikea"
    ],
    "dimensions": [
      0.359,
      0.699,
      0.413
    ],
    "modelId": "abo-b07hsh4zr2",
    "measuredAxes": [
      "width",
      "height"
    ],
    "verified": false
  },
  {
    "id": "ikea-90301225",
    "name": "BRIMNES Bookcase",
    "brand": "IKEA",
    "category": "shelf",
    "priceCents": 14900,
    "productUrl": "https://www.ikea.com/us/en/p/brimnes-bookcase-white-90301225/",
    "imageUrl": "https://www.ikea.com/us/en/images/products/brimnes-bookcase-white__1590279_pe1038918_s5.jpg",
    "dimensions": [
      0.6,
      1.899,
      0.349
    ],
    "modelId": "abo-b07ppnncm2",
    "mount": "floor",
    "dominantHex": "#F2F2F0",
    "styleTags": [
      "shelf",
      "white",
      "ikea"
    ],
    "measuredAxes": [
      "width",
      "height",
      "depth"
    ],
    "verified": true
  },
  {
    "id": "ikea-40597234",
    "name": "LINDBYN Mirror",
    "brand": "IKEA",
    "category": "mirror",
    "priceCents": 10999,
    "productUrl": "https://www.ikea.com/us/en/p/lindbyn-mirror-black-40597234/",
    "imageUrl": "https://www.ikea.com/us/en/images/products/lindbyn-mirror-black__1374978_pe960159_s5.jpg",
    "dimensions": [
      0.6,
      1.699,
      0.042
    ],
    "modelId": "abo-b07b8nw6gg",
    "mount": "wall",
    "dominantHex": "#2B2B2D",
    "styleTags": [
      "mirror",
      "black",
      "ikea"
    ],
    "measuredAxes": [
      "width",
      "height"
    ],
    "verified": false
  }
];
