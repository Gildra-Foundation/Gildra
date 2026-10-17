import { transitionSoundVolume } from "../platform/home/useSoundPreferences";

/** A brief brittle crack, synthesized locally; silent unless scene sound is on. */
export function iceCrackSound(delaySeconds = .34) {
  const volume = transitionSoundVolume();
  if (!volume || typeof AudioContext === "undefined") return () => {};
  let context: AudioContext;
  try { context = new AudioContext(); } catch { return () => {}; }
  const stop = () => { void context.close().catch(() => {}); };
  const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * .24), context.sampleRate);
  const samples = buffer.getChannelData(0);
  for (let index = 0; index < samples.length; index++) {
    samples[index] = (Math.random() * 2 - 1) * Math.exp(-index / (context.sampleRate * .045));
  }
  const source = context.createBufferSource();
  source.buffer = buffer;
  const filter = context.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.value = 1500;
  const gain = context.createGain();
  gain.gain.value = volume * .24;
  source.connect(filter).connect(gain).connect(context.destination);
  // Creation/resume happens during the navigation gesture, before the crack.
  void context.resume().then(() => {
    if (context.state !== "running") return;
    source.start(context.currentTime + delaySeconds);
    source.onended = stop;
  }).catch(stop);
  return stop;
}
