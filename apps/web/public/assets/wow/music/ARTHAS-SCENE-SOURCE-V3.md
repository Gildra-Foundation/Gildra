# Arthas scene clean voice and supplied writing sound v3

The only writing/signature source in this mix is the new user-provided attachment:
/home/debian/.codex/attachments/d4a392bc-4e38-4071-a089-d369e3ebef64/quick-pencil-signature-sound.mp3
It decodes to46824 mono samples@44100Hz =1.061768707s, with-30.3dBFS RMS and-8.2dBFS peak. No prior external writing recording is an input to the new sound preparation or final mix. Source SHA256 is retained in pencil-preparation-v3.json.

Writing uses mild pitch-preserving tempo/gain variants of the supplied sample,45ms crossfades between cycles, and50ms smooth onset/exit edges. It pauses with the spoken/ink phrase gaps, using exact original word cues plus40ms/45ms margins; nearby word groups merge into a natural writing phrase. The writing stems are10.71s RU and9.91s EN, normalized to-32.5dBFS RMS with short peaks controlled. Signatures play the supplied effect once, gently stretched to1.09/1.23s, at-30.5dBFS RMS with80ms soft edges. Light highpass130Hz/lowpass7600Hz and soft2.5:1 transient compression retain the supplied texture.

RU voice is the exact original v1 normalized MP3, unchanged and with unchanged-2dB layer gain. EN voice is the separately isolated/enhanced v3 normalized WAV; see ../voice-analysis provenance/verification. No extra speech is synthesized, no new words or timing is introduced.

Music remains exactly the approved v2 envelope: source begins34.5s,2.4s half-sine rise,1.8s smoothstep down3.2–5.0s to35%,2.8s restoration after the signature,2.4s half-sine tail; baseline-3dB. Voice/writing starts5.0s, RU quote ends15.71/signature16.31–17.40, EN quote ends14.91/signature15.51–16.74. Quote-to-signature pause600ms. The music-only base is unchanged v2; no replacement base is produced.

Final files: arthas-scene-ru-v3.mp3 and arthas-scene-en-v3.mp3,192kbps44.1kHz stereo, stripped metadata,157.993424s decoded length. Limiter ceiling-1.5dB, latency compensated. Timing and source paths are in arthas-scene-mix-timing-v3.json. Reproduction scripts, exact final filters and isolated/window/peak measurements are retained in this directory.

Final measurement PASS: prepared mono writing/signature is explicitly duplicated into both stereo channels in the final mix (avoiding a default3dB mono-rematrix loss). Writing is-32.5003dBFS RMS in both language windows, signature-30.5002/-30.5003; writing1.50/1.78dB more present than the prior v2 layer. Writing remains10.14dB RU /8.01dB EN below the respective voice and1.36/1.19dB below the ducked score. Score baseline25–45s exactlymatches unchanged v2 base (0.000000dB RMS difference). All final decoded lengths157.993424s, no clipping; final hashes/peaks are in handoff-v3.json. The EN voice agent independently verifies every original spoken word and0ms phrase lag after isolation.


# Clean English Arthas voice v3

The user-provided Warcraft3 English MP3 remains the sole voice source. No speech synthesis, substitute performance, or Russian voice processing.

Real learned separation:
1. Decode the original unfiltered stereo context251.0–268.5s, retaining surrounding phonemes/ambience for model context.
2. Demucs `htdemucs_ft` four fine-tuned models,1shift,50% overlap,4CPUthreads: retain only the vocals stem.
3. DeepFilterNet3 speech enhancement with postfilter and `pad=True` explicit STFT/modeldelay compensation. Models/caches and libraries are local to this taskfolder.
4. After full-context enhancement, cut251.28–254.52s and261.50–267.78s and join with the same550ms literal-silence gap. Per-cut raisedcosine60msentrance/80msexit fades stay outside spoken phonemes. No background bridge.
5. Fixed normalization gain and delay-compensated peak protection, output PCM24-bit44.1kHzstereo and256kbpsMP3.

Finalfiles `arthas-voice-en-v3.wav`/`.mp3`: exactly444087decoded samples=10.07s; original word cues unchanged. WAV-18.26LUFS/-1.50dBTP;MP3-18.26LUFS/-1.47dBTP.

Verification:
- Local faster-whisper small CPU confirms all26originalwords in order, with no extra words (`verify-clean.log`,`en-v3-asr.json`).
- Full-context voice waveform and envelope cross-correlation report0.0ms lag in both passages after modeldelay compensation.
- Real background attenuation is measured in source speech-free windows before cutfades/silence insertion, with the cleaned speechlevel matched to the original. CombinedDemucs+DF3 averages44.0dBattenuation across4windows(range20.7–63.2dB), versusDemucsalone31.9dBandDF3alone39.8dB. This is learned isolation, not an EQ/noisegate or ambience masking.
- Absence of100%residual background beneath overlapping phonemes cannot be established from this mixed source; the standaloneMP3 is provided for user listening. Earplayback was unavailable in this runtime; checks are ASR and waveform/level measurements.

Primarydocs:
- https://github.com/facebookresearch/demucs
- https://github.com/Rikorose/DeepFilterNet

See `isolate_en.py`,`prepare_candidates.py`,`finalize_en.py`,`verify_clean.py`,`verification.json`,`background-attenuation.json` for reproducibility.
