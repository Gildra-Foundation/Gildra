# Homepage scenes: three-second intro

This revision shortens the music-only opening from 5.000 s to 3.000 s in RU and EN. It is freshly mixed from the original music and finalized lossless voice/pencil stems; no previous composite MP3 is re-encoded.

The music offset moves forward by exactly 2 s (Arthas: 34.5 → 36.5 s; Illidan: 0 → 2 s), and every absolute voice, word-writing and signature cue moves earlier by exactly 2 s. This retains the original music under the dialogue, including Arthas’s choir entry at the start of his line. Relative speech timing and voice duration are unchanged.

Smooth startup fade: 1.2 s, half-sine. Music ducks over 1.8 s before the voice to 35%, then returns over 2.8 s after the signature. Tail fade remains 2.4 s. Base music: −3 dB; voice: −2 dB; pencil stereo duplication at unity. Prepared writing RMS: −32.5 dBFS; signature RMS: −30.5 dBFS. The supplied pencil recording is the only writing-effect source. Signature begins 600 ms after the final word; author timing is unchanged.

Background-only assets remain unchanged: `arthas-choir-v2.mp3`, `illidan-background-v1.mp3`, and original hero music files.

## Timing and validation

| Version | Voice begins | Quote ends | Signature begins | Signature lasts | True peak |
| --- | ---: | ---: | ---: | ---: | ---: |
| arthas-ru-v4 | 3.000 s | 13.710 s | 14.310 s | 1.090 s | -2.9 dBFS |
| arthas-en-v4 | 3.000 s | 12.910 s | 13.510 s | 1.230 s | -1.9 dBFS |
| illidan-ru-v2 | 3.000 s | 19.220 s | 19.820 s | 1.510 s | -3.1 dBFS |
| illidan-en-v2 | 3.000 s | 16.000 s | 16.600 s | 1.370 s | -3.1 dBFS |

Decoded full tracks contain no clipping/nonfinite samples; each is exactly 2 s shorter than its predecessor. All word cues were checked against their predecessors. Waveform correlation verifies the shifted narration/score and returns a best lag of 0 ms for all four scenes. Opening and closing boundary samples approach zero.

## Source files and checksums

- arthas music: `/home/debian/Gildra-integrated/public/assets/wow/music/arthas.mp3`
  - SHA-256: `f7c464f02e8b38b6ca2d6487e36ad25496b777925266e87944d748a699ca68cf`
- arthas ru voiceFile: `/home/debian/Gildra-integrated/tmp/home-arthas-scene-review/voice-analysis/arthas-voice-ru.wav`
  - SHA-256: `aec59f126654959f75caf158cb58852549e6058fea49e5993391b80e72b6ca39`
- arthas ru writingFile: `/home/debian/Gildra-integrated/tmp/home-arthas-scene-clean/sound-analysis/pencil-writing-ru-v3.wav`
  - SHA-256: `489aa01931312aa9655f1b86b0618b3ce1dfacaacf7c34e977ccf97a5d867fec`
- arthas ru signatureFile: `/home/debian/Gildra-integrated/tmp/home-arthas-scene-clean/sound-analysis/pencil-signature-ru-v3.wav`
  - SHA-256: `bc86bcac0141afadb62871e1d8f0a8681255066a99ace36f1ef24feac2b9d1fd`
- arthas en voiceFile: `/home/debian/Gildra-integrated/tmp/home-arthas-scene-clean/voice-analysis/arthas-voice-en-v3.wav`
  - SHA-256: `8d9e8654c654ff0272c58dffe2ee6c56eb0a01d26a5a45ba13dba7b203dd36b6`
- arthas en writingFile: `/home/debian/Gildra-integrated/tmp/home-arthas-scene-clean/sound-analysis/pencil-writing-en-v3.wav`
  - SHA-256: `4aca96634ef8a810b9e4816c2aea8d3f945817ba62731461d6defe0ebb4ea720`
- arthas en signatureFile: `/home/debian/Gildra-integrated/tmp/home-arthas-scene-clean/sound-analysis/pencil-signature-en-v3.wav`
  - SHA-256: `f471478ea8169a7a9bff0909898b570a978943e7ca1131781821371883d83edb`
- Original pencil recording: `/home/debian/.codex/attachments/d4a392bc-4e38-4071-a089-d369e3ebef64/quick-pencil-signature-sound.mp3`
  - SHA-256: `dba6e851350cd26b12e0455839cc0eca50a93d2897103424a259df445565eb9a`
- illidan music: `/home/debian/Gildra-integrated/public/assets/wow/music/illidan.mp3`
  - SHA-256: `9fd851477d903b0dfd0fbf2a1ca1b32f181590b960ae977a8ad6a73b71280f56`
- illidan ru voiceFile: `/home/debian/Gildra-integrated/tmp/home-illidan-scene-20261004/audio/illidan-voice-ru-v1.wav`
  - SHA-256: `cb80b05e230aebf5fd9c40aebdd1ec6a4238d040b7e1d32c052d2136b5999731`
- illidan ru writingFile: `/home/debian/Gildra-integrated/tmp/home-illidan-scene-20261004/audio/pencil-writing-ru-v1.wav`
  - SHA-256: `ac993e3a3c7750a4f42674601541b98893f74e9741c614f5adbc61abe8ace0ff`
- illidan ru signatureFile: `/home/debian/Gildra-integrated/tmp/home-illidan-scene-20261004/audio/pencil-signature-ru-v1.wav`
  - SHA-256: `7b06576af9f604895ac0016ee0813965249972c3917a93ac77e439fdc96eb011`
- illidan en voiceFile: `/home/debian/Gildra-integrated/tmp/home-illidan-scene-20261004/audio/illidan-voice-en-v1.wav`
  - SHA-256: `161c9c3d9f7d36ca0ac06d079bf1cd932dd375ee9fb7f1f516fe09f11aceac02`
- illidan en writingFile: `/home/debian/Gildra-integrated/tmp/home-illidan-scene-20261004/audio/pencil-writing-en-v1.wav`
  - SHA-256: `3bae571bc1358ef5a80784dedb9a1b37b8575330b5ff0830b6b9fc4b7e2b68dd`
- illidan en signatureFile: `/home/debian/Gildra-integrated/tmp/home-illidan-scene-20261004/audio/pencil-signature-en-v1.wav`
  - SHA-256: `6410923d05f0051a8e9b0c3f16c4614c82c594ece6d641e4aed5bb62f2711f07`
- Original pencil recording: `/home/debian/.codex/attachments/d4a392bc-4e38-4071-a089-d369e3ebef64/quick-pencil-signature-sound.mp3`
  - SHA-256: `dba6e851350cd26b12e0455839cc0eca50a93d2897103424a259df445565eb9a`

## Output checksums

- `arthas-scene-ru-v4.mp3`: `c9f1be35b5000b983b765e34da4bb871e15098d8f70ff1d6496039cfeec7249a`
- `arthas-scene-en-v4.mp3`: `73367133bcc57236c022240776af4727122cb45270afafa081a391b307a4464d`
- `illidan-scene-ru-v2.mp3`: `45cb0325bce303ee5f9c7c416e8ced3b35cd9c99a54de48ec279d5205bd6b684`
- `illidan-scene-en-v2.mp3`: `1f7f7776cc54f85e1a255fb8cf80fe173e455682c0d5fde74ce866c034abc9ab`

## Reproduction and evidence

- Mixer: `/home/debian/Gildra-integrated/tmp/home-scene-three-second-20261004/audio/prepare_three_second.py`
- Verification: `/home/debian/Gildra-integrated/tmp/home-scene-three-second-20261004/audio/verify_three_second.py`
- Results: `/home/debian/Gildra-integrated/tmp/home-scene-three-second-20261004/audio/verification.json`
- Full manifests and exact ffmpeg filter graphs sit beside the output files.
