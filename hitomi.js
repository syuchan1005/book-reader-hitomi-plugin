const hitomi = {
  urlFromUrlFromHash: (gId, image) => hitomi.urlFromUrl(hitomi.urlFromHash(gId, image)),
  urlFromHash: (gId, image) => {
    const ext = image.name.split('.').pop();
    const dir = 'images';

    return `https://a.hitomi.la/${dir}/${hitomi.fullPathFromHash(image.hash)}.${ext}`;
  },
  fullPathFromHash: (hash) => ((hash.length < 3) ? hash : hash.replace(/^.*(..)(.)$/, `$2/$1/${hash}`)),
  urlFromUrl: (url, base) => url.replace(/\/\/..?\.hitomi\.la\//, `//${hitomi.subDomainFromUrl(url, base)}.hitomi.la/`),
  subDomainFromUrl: (url, base) => {
    const retval = base || 'a';
    const b = 16;
    let numberOfFrontend = 3;

    const r = /\/[0-9a-f]\/([0-9a-f]{2})\//;
    const m = r.exec(url);
    if (!m) return retval;

    let g = parseInt(m[1], b);
    if (!Number.isNaN(g)) {
      if (g < 0x30) {
        numberOfFrontend = 2;
      }
      if (g < 0x09) {
        g = 1;
      }
      return hitomi.subDomainFromGalleryId(g, numberOfFrontend) + retval;
    }

    return retval;
  },
  subDomainFromGalleryId: (g, numberOfFrontend = 3) => String.fromCharCode(
    97 + (g % numberOfFrontend),
  ),
};

module.exports = hitomi;
