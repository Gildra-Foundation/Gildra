# Arthas opening scene premix

Files:
- arthas-scene-ru-v1.mp3
- arthas-scene-en-v1.mp3
- arthas-music-scene-base-v1.mp3 (trimmed, score only for reduced motion and subsequent loops)

192 kbps MP3, stereo44.1kHz, metadata stripped; each decodes to157.993424s of PCM. Trim starts34.5s into the supplied Arthas music file (decoded source192.493424s). This gives5.0s before the approximate39.5–40.0s first choir entrance. Voice and quill startat5.0s of scene. Final dialogue is the two user-provided passages cut and normalized by voice-analysis (see its README/sourcecuts). No synthesized dialogue.

Precise timings are in arthas-scene-mix-timing.json. RU quote ends15.71s, signature starts16.31s and lasts1.09s. EN quote ends14.91s, signature starts15.51s and lasts1.23s. Author pause600ms. The file contains dialogue only once. Subsequent replay of the score should use the music-only base.

Mix: score-3dB for source peak headroom; voice-2dB from normalized suppliedclips; score smoothstepsdown to35% between4.65–5.0s and returns over350ms after signature finishes. Quill35% of processed loop duringwriting and50% of processedsignature excerpt. Voice/quill/signature are positioned by exactsample delays (44.1kHz) into the decoded music. Safety limiter-1dB ceiling,5ms attack100ms release, latency compensated. Encoding cannot improve source MP3 quality, but192kbps minimizes an additional encode loss.

SOURCE.md records the real quill recording license/source (CC0). mix-level-summary.json records decoded EBU loudness/truepeak verification. prepare_scene_mix.py plus mix-ru-filter.txt/mix-en-filter.txt fully reproduce the edits. No source or public files were edited by this producer.

# Quill writing effect

- Recording: Quill pen writing on hard paper various speed.wav
- Author: marcoman89
- Source page: https://freesound.org/people/marcoman89/sounds/194905/
- Public high-quality preview: https://cdn.freesound.org/previews/194/194905_3545480-hq.mp3
- License: CC0 1.0 Public Domain Dedication, verified on source page 2026-10-04.
- License URL: https://creativecommons.org/publicdomain/zero/1.0/
- Source describes a real quill writing slowly and then faster on hard paper.

Edits: mono, 44.1 kHz, 112 kbps MP3; gently removed sub-180Hz handling rumble and above-6.6kHz hiss, raised quiet recording by 17dB, and added 25ms/80ms edge fades. Writing loop uses source 20.0–34.0s (14.0s), chosen from steady scratches without the later louder handling clicks. Signature excerpt uses source 29.2–31.0s (1.8s).

# Arthas supplied voice cuts

All source audio is the user-provided MP3s; no external voice source or synthetic voice. Local faster-whisper small CPU ASR established and verified the speech text and word timings. FFmpeg7.0.2 imageio-ffmpeg binary performed sample-accurate decoding/cuts.

- RU: original138.32–142.73 and159.11–165.00,550ms gap; decoded duration10.85s. Last spoken word ends10.71s.
- EN: original251.28–254.52 and261.50–267.78,550ms gap; decoded duration10.07s. Last spoken word ends9.91s.
-8ms endpoint ramps avoid clicks. No speed change. EN uses85Hz highpass and11kHz lowpass; its source gameplay ambience remains.
- Final MP3 files use192kbps stereo44.1kHz, metadata stripped. Two-pass EBU loudness normalization: RU-16.26LUFS/-4.24dBTP; EN-17.83LUFS/-1.62dBTP (peak constrained). WAV files are intermediate unnormalized cuts; use MP3 for final mix.
- `arthas-voice-timing.json` includes cue times relative to final voiceclip, exact PCM duration, and sourcecuts. Prefix scene voiceoffset5.0s for ink timestamps. Native MP3 metadata can report extra padding; decoded lengths above are gapless sample durations.
- RU says "приму на себя проклятие", requiring the two extra words in homepage quote. All other RU andEN words match current homepage phrase (including "К черту людей!"/"Damn the men!").
