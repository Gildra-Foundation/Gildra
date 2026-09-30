export const lairMediaBySlug = {
  "nymrissa-wavecaller": {
    portrait: "/assets/wow/lairs/bosses/nymrissa.jpg",
    map: "/assets/wow/lairs/maps/nymrissa.jpg",
    accent: "#4aa9d8",
  },
  luashal: {
    portrait: "/assets/wow/lairs/bosses/luashal.jpg",
    map: "/assets/wow/lairs/maps/luashal.jpg",
    accent: "#e8bd55",
  },
  cragpine: {
    portrait: "/assets/wow/lairs/bosses/cragpine.jpg",
    map: "/assets/wow/lairs/maps/cragpine.jpg",
    accent: "#95b95a",
  },
  thormbelan: {
    portrait: "/assets/wow/lairs/bosses/thormbelan.jpg",
    map: "/assets/wow/lairs/maps/thormbelan.jpg",
    accent: "#cfb350",
  },
  predaxas: {
    portrait: "/assets/wow/lairs/bosses/predaxas.jpg",
    map: "/assets/wow/lairs/maps/predaxas.jpg",
    accent: "#a981d6",
  },
} as const;

export function getLairMedia(slug: string) {
  return lairMediaBySlug[slug as keyof typeof lairMediaBySlug];
}
