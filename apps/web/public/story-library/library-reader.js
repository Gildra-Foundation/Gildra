(() => {
  const cover = document.querySelector('#openBook');
  const status = document.querySelector('#readerStatus');
  let ready;

  function prepareReader() {
    if (ready) return ready;
    ready = (async () => {
      const response = await fetch('/story-library/manuscript.html');
      if (!response.ok) throw new Error('The volume could not be loaded.');
      const page = new DOMParser().parseFromString(await response.text(), 'text/html');
      const reader = page.querySelector('#reader');
      if (!reader) throw new Error('The volume has no reader.');
      // The library and the character page share the same complete manuscript.
      reader.querySelectorAll('[src]').forEach(image => {
        image.src = new URL(image.getAttribute('src'), location.origin + '/').href;
      });
      const reading = document.createElement('dialog');
      reading.id = 'libraryReading';
      reading.className = 'library-reading';
      reading.setAttribute('aria-label', document.documentElement.lang === 'en' ? 'Anduin Wrynn: story in Russian' : 'История Андуина Ринна');
      reading.append(reader);
      document.body.append(reading, page.querySelector('#heldBook'), page.querySelector('#phoneBook'));
      await Promise.all([...reader.querySelectorAll('img')].map(image => image.decode().catch(() => {})));
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = '/story-library/reader-runtime.js?v=20261023';
        script.onload = resolve;
        script.onerror = () => { script.remove(); reject(new Error('Reader unavailable')); };
        document.body.append(script);
      });
      cover.removeEventListener('click', firstOpen);
    })().catch(error => {
      ['libraryReading', 'heldBook', 'phoneBook'].forEach(id => document.getElementById(id)?.remove());
      ready = null;
      throw error;
    });
    return ready;
  }

  async function firstOpen() {
    cover.setAttribute('aria-busy', 'true');
    try {
      await prepareReader();
      status.textContent = '';
      window.dispatchEvent(new Event('library:open'));
    } catch {
      status.textContent = document.documentElement.lang === 'en' ? 'The book could not be loaded. Select it to try again.' : 'Не удалось достать книгу. Нажмите на неё ещё раз.';
    } finally {
      cover.removeAttribute('aria-busy');
    }
  }
  cover.addEventListener('click', firstOpen);
  ['pointerenter', 'focus'].forEach(event => cover.addEventListener(event, () => prepareReader().catch(() => {}), {once: true}));
  const prefetch = () => prepareReader().catch(() => {});
  if ('requestIdleCallback' in window) requestIdleCallback(prefetch, {timeout: 1500});
  else window.addEventListener('load', prefetch, {once: true});
})();
