import type { CatalogItem } from "./catalogItem";

// Hand-authored catalog items, measured off the live IKEA product page by a
// person. The build NEVER touches this file, and an entry here overrides the
// generated row with the same id — so re-running scripts/build-catalog.mjs to
// refresh prices and links cannot undo a correction made here.
//
// Every item below has all three axes read from the page's Measurements tab,
// so measuredAxes lists all three and verified is true. Dimensions are
// [width, height, depth] in METRES, height in the middle.
//
// To add more: run scripts/add-manual.mjs after filling in its MEASURED table.
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
    "id": "ikea-70489011",
    "name": "GLOSTAD Loveseat",
    "brand": "IKEA",
    "category": "sofa",
    "priceCents": 16900,
    "productUrl": "https://www.ikea.com/us/en/p/glostad-loveseat-knisa-dark-gray-70489011/",
    "imageUrl": "https://www.ikea.com/us/en/images/products/glostad-loveseat-knisa-dark-gray__1577178_pe1033002_s5.jpg",
    "dimensions": [
      1.47,
      0.77,
      0.79
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
  }
];
