import type { Lang } from "@/lib/i18n";

// Original isolated voices; the continuous soundtrack is the scene clock.
export const illidanLeadIn = 3000;
export const illidanBackground = "/assets/wow/music/illidan-background-v1.mp3";
export const illidanScenes = {
  "ru": {
    "src": "/assets/wow/music/illidan-scene-ru-v2.mp3",
    "voiceDuration": 17000,
    "quoteEnd": 19220,
    "words": [
      {
        "start": 3000,
        "end": 3140
      },
      {
        "start": 3140,
        "end": 4000
      },
      {
        "start": 4640,
        "end": 4880
      },
      {
        "start": 4880,
        "end": 5540
      },
      {
        "start": 5540,
        "end": 5860
      },
      {
        "start": 5860,
        "end": 6300
      },
      {
        "start": 6300,
        "end": 6940
      },
      {
        "start": 7700,
        "end": 7920
      },
      {
        "start": 7920,
        "end": 8120
      },
      {
        "start": 8120,
        "end": 8540
      },
      {
        "start": 8540,
        "end": 8920
      },
      {
        "start": 8920,
        "end": 9160
      },
      {
        "start": 9160,
        "end": 9840
      },
      {
        "start": 9840,
        "end": 10480
      },
      {
        "start": 10480,
        "end": 10720
      },
      {
        "start": 10720,
        "end": 11760
      },
      {
        "start": 12640,
        "end": 12720
      },
      {
        "start": 12720,
        "end": 13140
      },
      {
        "start": 13140,
        "end": 13340
      },
      {
        "start": 13340,
        "end": 13720
      },
      {
        "start": 13720,
        "end": 15100
      },
      {
        "start": 15100,
        "end": 15980
      },
      {
        "start": 16340,
        "end": 16380
      },
      {
        "start": 16380,
        "end": 16880
      },
      {
        "start": 17220,
        "end": 17500
      },
      {
        "start": 17500,
        "end": 17980
      },
      {
        "start": 17980,
        "end": 18180
      },
      {
        "start": 18180,
        "end": 18760
      },
      {
        "start": 18760,
        "end": 18880
      },
      {
        "start": 18880,
        "end": 19220
      }
    ]
  },
  "en": {
    "src": "/assets/wow/music/illidan-scene-en-v2.mp3",
    "voiceDuration": 13880,
    "quoteEnd": 16000,
    "words": [
      {
        "start": 3070,
        "end": 3220
      },
      {
        "start": 3220,
        "end": 3380
      },
      {
        "start": 3380,
        "end": 3880
      },
      {
        "start": 3880,
        "end": 4480
      },
      {
        "start": 4480,
        "end": 4860
      },
      {
        "start": 4860,
        "end": 5440
      },
      {
        "start": 5440,
        "end": 5980
      },
      {
        "start": 7060,
        "end": 7340
      },
      {
        "start": 7340,
        "end": 7880
      },
      {
        "start": 7880,
        "end": 8260
      },
      {
        "start": 8260,
        "end": 8540
      },
      {
        "start": 8540,
        "end": 8880
      },
      {
        "start": 8880,
        "end": 9240
      },
      {
        "start": 9240,
        "end": 9520
      },
      {
        "start": 9520,
        "end": 9640
      },
      {
        "start": 9640,
        "end": 9720
      },
      {
        "start": 9720,
        "end": 9940
      },
      {
        "start": 10800,
        "end": 11100
      },
      {
        "start": 11100,
        "end": 11360
      },
      {
        "start": 11360,
        "end": 11600
      },
      {
        "start": 11600,
        "end": 11800
      },
      {
        "start": 11800,
        "end": 12120
      },
      {
        "start": 12120,
        "end": 12540
      },
      {
        "start": 13020,
        "end": 13200
      },
      {
        "start": 13200,
        "end": 13440
      },
      {
        "start": 13440,
        "end": 13700
      },
      {
        "start": 13700,
        "end": 13840
      },
      {
        "start": 13840,
        "end": 14000
      },
      {
        "start": 14000,
        "end": 14280
      },
      {
        "start": 14280,
        "end": 14600
      },
      {
        "start": 14600,
        "end": 14940
      },
      {
        "start": 14940,
        "end": 15420
      },
      {
        "start": 15420,
        "end": 15720
      },
      {
        "start": 15720,
        "end": 16000
      }
    ]
  }
} satisfies Record<Lang, { src: string; voiceDuration: number; quoteEnd: number; words: { start: number; end: number }[] }>;
