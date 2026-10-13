import type { Lang } from "@/lib/i18n";

// Offsets come from the supplied original voices; the mixed audio is the scene clock.
export const arthasLeadIn = 3000;
export const arthasBackground = "/assets/wow/music/arthas-choir-v2.mp3";
export const arthasScenes = {
  "ru": {
    "src": "/assets/wow/music/arthas-scene-ru-v4.mp3",
    "voiceDuration": 10850.0,
    "quoteEnd": 13710,
    "words": [
      {
        "start": 3060,
        "end": 3340
      },
      {
        "start": 3340,
        "end": 3520
      },
      {
        "start": 3520,
        "end": 4080
      },
      {
        "start": 4080,
        "end": 4380
      },
      {
        "start": 4380,
        "end": 4480
      },
      {
        "start": 4480,
        "end": 4640
      },
      {
        "start": 4640,
        "end": 5240
      },
      {
        "start": 5380,
        "end": 5580
      },
      {
        "start": 5580,
        "end": 5760
      },
      {
        "start": 5760,
        "end": 6100
      },
      {
        "start": 6100,
        "end": 6560
      },
      {
        "start": 6560,
        "end": 6800
      },
      {
        "start": 6800,
        "end": 7160
      },
      {
        "start": 8020,
        "end": 8170
      },
      {
        "start": 8170,
        "end": 8550
      },
      {
        "start": 8550,
        "end": 8810
      },
      {
        "start": 9630,
        "end": 9850
      },
      {
        "start": 9850,
        "end": 10030
      },
      {
        "start": 10030,
        "end": 10550
      },
      {
        "start": 11130,
        "end": 11170
      },
      {
        "start": 11170,
        "end": 11450
      },
      {
        "start": 11450,
        "end": 11630
      },
      {
        "start": 11630,
        "end": 11970
      },
      {
        "start": 11970,
        "end": 12070
      },
      {
        "start": 12070,
        "end": 12210
      },
      {
        "start": 12210,
        "end": 12350
      },
      {
        "start": 12350,
        "end": 12650
      },
      {
        "start": 13170,
        "end": 13470
      },
      {
        "start": 13470,
        "end": 13710
      }
    ]
  },
  "en": {
    "src": "/assets/wow/music/arthas-scene-en-v4.mp3",
    "voiceDuration": 10070.0,
    "quoteEnd": 12910,
    "words": [
      {
        "start": 3080,
        "end": 3200
      },
      {
        "start": 3200,
        "end": 3380
      },
      {
        "start": 3380,
        "end": 3660
      },
      {
        "start": 3660,
        "end": 4080
      },
      {
        "start": 4080,
        "end": 4460
      },
      {
        "start": 4460,
        "end": 4800
      },
      {
        "start": 4800,
        "end": 5120
      },
      {
        "start": 5120,
        "end": 5360
      },
      {
        "start": 5360,
        "end": 5580
      },
      {
        "start": 5580,
        "end": 6080
      },
      {
        "start": 6870,
        "end": 7190
      },
      {
        "start": 7190,
        "end": 7370
      },
      {
        "start": 7370,
        "end": 7590
      },
      {
        "start": 8390,
        "end": 8710
      },
      {
        "start": 8710,
        "end": 9010
      },
      {
        "start": 9010,
        "end": 9270
      },
      {
        "start": 9270,
        "end": 9590
      },
      {
        "start": 9590,
        "end": 9790
      },
      {
        "start": 9790,
        "end": 10030
      },
      {
        "start": 10030,
        "end": 10270
      },
      {
        "start": 10270,
        "end": 10590
      },
      {
        "start": 10810,
        "end": 10890
      },
      {
        "start": 10890,
        "end": 11190
      },
      {
        "start": 12010,
        "end": 12310
      },
      {
        "start": 12310,
        "end": 12510
      },
      {
        "start": 12510,
        "end": 12910
      }
    ]
  }
} satisfies Record<Lang, { src: string; voiceDuration: number; quoteEnd: number; words: { start: number; end: number }[] }>;
