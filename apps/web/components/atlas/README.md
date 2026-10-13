# components/atlas — the app's side of the atlas kit

The kit itself is the workspace package [`@gildra/atlas-ui`](../../packages/atlas-ui/README.md).
This folder only adapts it to the site:

- `index.ts` re-exports the kit and hands it the blurred placeholders of the site's paintings;
- `AtlasFrame.tsx` is the kit's `AtlasFrameShell` with the site's scenes
  (`lib/atlas/scenes.ts`) and legal line (`lib/games/registry.ts`);
- `gallery/` is the `/dev/atlas` kit gallery.

Pages keep importing `@/components/atlas`.
