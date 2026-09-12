/**
 * FoodRescue — curated food photography (Unsplash CDN).
 * Every URL is verified reachable; used as listing photos, category fallbacks,
 * and decorative section backgrounds. All loading is lazy + graceful
 * (components fall back to emoji/gradient art if a URL ever fails).
 */

const u = (id, w = 800) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&q=70`;

/** Default photo per listing category (used when a listing has no imageUrl). */
export const CATEGORY_IMAGES = {
  "Prepared Food": u("1574894709920-11b28e7367e3"), // baked pasta trays
  Bakery: u("1509440159596-0249088772ff"), // fresh sourdough loaves
  Produce: u("1512621776951-a57141f2eefd"), // vibrant vegetables & greens
  Dairy: u("1550583724-b2692b85b150"), // yogurt bowl with berries
  "Packaged Goods": u("1583258292688-d0213dc5a3a8"), // pantry jars & staples
};

/** Decorative food-scene shot for section backgrounds / hero collage. */
export const HERO_IMAGES = {
  spread: u("1484723091739-30a097e8f929", 1600), // community brunch table
  lasagna: u("1574894709920-11b28e7367e3", 800),
  bread: u("1509440159596-0249088772ff", 800),
  bagels: u("1551183053-bf91a1d81141", 800), // toast with jam & fruit
};

export const ABOUT_IMAGES = {
  volunteers: u("1593113598332-cd288d649433", 900), // volunteers packing food crates
  community: u("1469571486292-0ba58a3f068b", 900), // shared community dinner
  market: u("1542838132-92c53300491e", 900), // fresh market produce
};

export default CATEGORY_IMAGES;
