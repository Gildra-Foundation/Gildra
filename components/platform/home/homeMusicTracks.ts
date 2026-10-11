import type { HomeThemeId } from "./homeThemes";

export const homeMusicTracks = {
  arthas: { src: "/assets/wow/music/arthas.mp3", title: "Arthas, My Son", source: "https://youtu.be/ZRsToniFCYo" },
  illidan: { src: "/assets/wow/music/illidan.mp3", title: "Illidan", source: "https://youtu.be/I0dWOiMq4FQ" },
  garek: { src: "/assets/wow/music/garek.mp3", title: "Forsaken Kingdom · Capital City Ruins", source: "https://youtu.be/ie7ydvttgMY" },
  varok: { src: "/assets/wow/music/varok.mp3", title: "Saurfang’s Funeral", source: "https://youtu.be/_g098g9FrCM" },
} satisfies Record<HomeThemeId, { src: string; title: string; source: string }>;
