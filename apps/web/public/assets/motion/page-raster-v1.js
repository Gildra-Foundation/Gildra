/* No DOM insertion, network, storage or page cache. The one-shot SVG image is
   inert; the private port returns only its bounded bitmap to its parent. */
addEventListener("message", function connect(event) {
  if (event.source !== parent || event.data !== "gildra-page-raster-v1" || event.ports.length !== 1) return;
  removeEventListener("message", connect);
  const port = event.ports[0];
  port.onmessage = async ({ data }) => {
    if (data.type === "probe") {
      const start = performance.now();
      port.postMessage({ type:"probe-begin", epoch:performance.timeOrigin + start });
      // Prove the parent's event loop can run while this sandbox is busy. Legacy
      // shared-thread frames are rejected before a real page is ever rasterised.
      // Both time and iteration limits keep the probe finite under fake clocks.
      let value = 1;
      for (let i = 0; i < 2000000; i++) {
        value = Math.sin(value + i);
        if (i % 2048 === 0 && performance.now() - start >= 32) break;
      }
      port.postMessage({ type:"probe-end", duration:performance.now() - start, value });
      return;
    }
    if (data.type !== "raster" || typeof data.svg !== "string" || data.svg.length > 9_000_000 || !Number.isInteger(data.id)) return;
    const image = new Image(); let bitmap;
    try {
      image.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(data.svg);
      await image.decode();
      const width = Math.max(1, Math.min(1024, data.width)), height = Math.max(1, Math.min(1024, data.height));
      const canvas = new OffscreenCanvas(width, height);
      canvas.getContext("2d").drawImage(image, 0, 0, width, height);
      bitmap = canvas.transferToImageBitmap();
      port.postMessage({ type:"bitmap", id:data.id, bitmap }, [bitmap]);
    } catch { bitmap?.close(); port.postMessage({ type:"failed", id:data.id }); }
    finally { image.src = ""; }
  };
  port.postMessage({ type:"connected" });
});
