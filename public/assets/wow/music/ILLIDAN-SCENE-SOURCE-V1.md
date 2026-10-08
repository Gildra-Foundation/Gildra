# Illidan cinematic homepage scene v1

The user supplied both already isolated original performances. The original voices remain the sole speech sources. No voice synthesis, replacement performance, noise removal, EQ, or denoising was applied to speech.

## Sources

- RU: `/home/debian/Downloads/dialogue-isolated-2/dialogue.mp3`; SHA-256 `874bcb91736739e3c7908996183ee82d2c1ab85b4c3827edeb582009bab51373`.
- EN: `/home/debian/Downloads/dialogue-isolated/dialogue.mp3`; SHA-256 `00c46cf8f0beb071594107e2160e14848f08f8c97892e27319a3e789cbd9d9b2`.
- Music: existing `illidan.mp3`; SHA-256 `9fd851477d903b0dfd0fbf2a1ca1b32f181590b960ae977a8ad6a73b71280f56`. The source is unchanged.
- Pencil: `/home/debian/.codex/attachments/d4a392bc-4e38-4071-a089-d369e3ebef64/quick-pencil-signature-sound.mp3`; SHA-256 `dba6e851350cd26b12e0455839cc0eca50a93d2897103424a259df445565eb9a`. It is the user's quick pencil recording, replacing the older quill sound.

## Timeline and mix

- Exactly 5.000 s of music before writing/narration; single continuous mixed soundtrack drives the word animations.
- Music begins at source offset 0; the source has only about 0.1 s of initial silence. No music passage was removed.
- EN speech trims only the initial 1.120 s of silence, leaving 70 ms before the waveform onset at 1.190 s. The complete initial “I” remains present. RU speech keeps offset 0.
- Source speech is normalized with fixed gain only to approximately −17 LUFS, followed by the same −2 dB scene voice gain used for Arthas. RU edge fade is just 2 ms because speech begins at the file boundary; EN fade is 20 ms within preserved silence. An 80 ms end fade affects the quiet tail.
- Word timestamps use local faster-whisper small with waveform corrections. The RU ASR fragments “под лицом” are one displayed “подлецом” cue. User text “по прежнему” retains two words. RU “После” begins at waveform onset 1.640 s, rather than the model's incorrect 1.000 s. EN first “I” begins at 1.190 s source time.
- Existing exact quote text is preserved, including user spelling “тюрмы”; there are 30 RU cues and 34 EN cues. Punctuation is displayed but has no separate audio cue.
- Pencil texture: 130 Hz highpass / 7600 Hz lowpass, gentle 2.5:1 compression of the supplied effect only; cycle tempo/gain variations with 45 ms crossfades. It plays within word groups and fades across speech pauses. Mono pencil is duplicated to stereo at unity gain to prevent unintended downmix attenuation.
- Writing is −32.50 dBFS RMS; signature is −30.50 dBFS RMS, matching the final Arthas scene. Signature plays once with a mild tempo adjustment.
- Quote completion → 600 ms pause → signature. Signature follows the existing 70 ms per author character plus 180 ms duration convention.
- Music has −3 dB base gain, 2.4 s sine-shaped entrance/tail, a smooth 1.8 s transition to 35% gain before speech, and smooth 2.8 s recovery after the signature. Cubic smoothstep envelopes have zero slope at ramp boundaries.
- Scene mixing sums the unchanged continuous music, voice, writing, and signature without automatic amix normalization or dropout transitions. A delay-compensated limiter provides a −1.5 dBFS ceiling before 192 kbps MP3 encoding.
- Music-only background uses identical source timing and smooth entrance/tail. Scene and background retain all 190.055329 s of the music source.

## Final verification

- RU: voice file duration 17.000 s; final ink 21.220 s; signature 21.820–23.330 s; final MP3 -19.9 LUFS / -3.1 dBTP; SHA-256 `10ba91c5e50dcb91bf859ddb763600f5753b3e30b59a84d7bece45f65ddc29a1`.
- EN: voice file duration 13.880 s; final ink 18.000 s; signature 18.600–19.970 s; final MP3 -19.9 LUFS / -3.1 dBTP; SHA-256 `b557b33a22d91a63af3d8a54c2b4d14d44e8f812d02c7111ff2fa42a4fb4769e`.
- Background: -19.4 LUFS / -2.7 dBTP; SHA-256 `c5701dc141bfc1244ce14b5ab955402e07e71e7b90a5eafe3725a3bdb4afa341`.
- Decoded duration is exactly 8,381,440 stereo frames at 44.1 kHz for all three MP3s. Samples are finite; no decoded clipping; the first 32 samples are zero and final 32 samples below 2.2e−8.
- Scene music at 30–45 s matches the music-only background RMS to 0.000 dB in both languages.
- ASR of final prepared voices confirms the complete English performance including the first “I”; Russian ASR repeats recognizable model errors for “подлецом” and “над мной”, so the supplied unchanged voice and exact user text remain authoritative. English “ten thousand” may be represented as “10,000” by ASR.
- Ear playback was unavailable in this worker runtime. Checks are speech recognition, waveform, loudness/true-peak, and deterministic sample-duration measurements.

Reproducibility: `prepare_scene.py`, `verify_audio.py`, `illidan-scene-timing-v1.json`, `verification.json`, source/final transcript JSON, and filter graphs are in the task audio folder.
