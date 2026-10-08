# Arthas scene audio smoothing v2

Outputs: arthas-scene-ru-v2.mp3, arthas-scene-en-v2.mp3, arthas-music-scene-base-v2.mp3. All are192 kbps MP3,44.1 kHz stereo, with stripped metadata and decoded length157.993424s.

The user asked for softer transitions, a2–3 times more audible quill, and gradual score volume changes. The user specifically clarified that voice joins should be changed only in EN. RU feeds the exact unchanged normalized v1 MP3 stem from home-arthas-scene-review/voice-analysis/arthas-voice-ru.mp3, with the same-2dB layer gain and exact original timing. EN feeds a separately prepared normalized v2 WAV stem with natural speech-free source ambience bridging the550ms join; its source passages, phonemes,10.07s duration and word timings are retained. See ../voice-analysis provenance for the EN repair.

The supplied score is still trimmed from34.5s, voice and quill still start at5.0s. Quote ends/signature timings remain RU15.71/16.31/17.40s and EN14.91/15.51/16.74s. Pause before signature stays600ms. No additional voice play is added.

Score: unchanged-3dB base gain,2.4s half-sine startup, smoothstep down to35% over1.8s (3.2–5.0s), smoothstep back over2.8s after the signature, and2.4s half-sine tail fade. Scene and music-only files have identical startup/tail envelopes and music gain, so playback swaps use the same master gain and soft boundaries.

Quill: steady writing gain0.35→0.875, signature0.5→1.25, exactly2.5× amplitude (+7.9588dB) in the interior. Additional200ms half-sine onset/exit edges avoid a sudden scratch entry. Recording remains the real CC0 marcoman89/Freesound quill asset documented in SOURCE.md.

Safety limiter ceiling-1.5dB,5ms attack,100ms release, latency compensated; encoder uses192kbps to minimize additional MP3 encoding loss. Music is encoded directly from the original user file, not from the previously encoded scene/base. Exact filters/scripts and timing JSON are retained here. mix-level-summary-v2.json contains actual decoded levels, isolated stem window measurements, comparison with v1 quill, music baseline equality, boundaries and duration checks.


# Quill writing effect

- Recording: Quill pen writing on hard paper various speed.wav
- Author: marcoman89
- Source page: https://freesound.org/people/marcoman89/sounds/194905/
- Public high-quality preview: https://cdn.freesound.org/previews/194/194905_3545480-hq.mp3
- License: CC0 1.0 Public Domain Dedication, verified on source page 2026-10-04.
- License URL: https://creativecommons.org/publicdomain/zero/1.0/
- Source describes a real quill writing slowly and then faster on hard paper.

Edits: mono, 44.1 kHz, 112 kbps MP3; gently removed sub-180Hz handling rumble and above-6.6kHz hiss, raised quiet recording by 17dB, and added 25ms/80ms edge fades. Writing loop uses source 20.0–34.0s (14.0s), chosen from steady scratches without the later louder handling clicks. Signature excerpt uses source 29.2–31.0s (1.8s).


# English Arthas voice smoothing

Only EN stem changed. RU v1 files and all previous analysis files remain unchanged.

The old EN stem joined two gameplay recordings with a literal-zero550ms gap. This abruptly removed the supplied game ambience and reintroduced a different ambient state at the second phrase.

` smooth_en.py ` rebuilds the exact source cuts251.28–254.52 and261.50–267.78. The same550ms gap now continues the speech-free original game ambience following the first phrase; its final120ms crossfades with the original speech-free ambience immediately before the second phrase. Both boundaries therefore continue real neighboring source samples. A raisedcosine60ms startfade ends before the first spoken word at80ms; an80ms endfade begins9.99s, after lastword9.91s.

Voice speed and placement remain unchanged. Correlation to the prior unnormalized spoken regions is≥0.999999999 before gainprocessing; total length is exactly444087samples at44100Hz=10.07s. `arthas-voice-en-v2-timing.json` retains all original cues verbatim.

The output uses a fixed gain and a short peaklimiter with delaycompensation, avoiding modulation of the speech level. Final normalized WAV is-17.88LUFS/-1.19dBTP; MP3-18.14LUFS/-1.36dBTP. `verification.json` records objective loudness, sample count, gap RMS, seam jumps, and speech correlation.

Actual human ear playback was unavailable in this runtime; waveform/level diagnostics and local faster-whisper ASR supply the checks.
