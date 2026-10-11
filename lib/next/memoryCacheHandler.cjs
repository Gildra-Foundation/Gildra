// Next.js data and page cache that never writes to disk.
//
// The web container mounts /app/.next/cache as a small tmpfs. With Next's
// default handler every cached fetch() (catalog API, Wowhead tooltips) became a
// file there; on 2026-10-11 about 450k entries filled the mount and optimized
// images were then cached as empty files. This is Next's own FileSystemCache
// with flushToDisk forced off: fetch and ISR entries stay in its in-memory LRU
// (cacheMaxMemorySize), prerendered pages are still read from the build output,
// and the image optimizer keeps its own bounded disk cache
// (images.maximumDiskCacheSize in next.config.ts).
const FileSystemCache = require("next/dist/server/lib/incremental-cache/file-system-cache").default;

module.exports = class MemoryCacheHandler extends FileSystemCache {
  constructor(context) {
    super({ ...context, flushToDisk: false });
  }
};
