const path = require('path');

const hitomi = {
  urlFromUrlFromHash: (gId, image) => hitomi.urlFromUrl(hitomi.urlFromHash(gId, image)),
  urlFromHash: (gId, image) => ((!image.hash)
    ? `https://a.hitomi.la/galleries/${gId}/${image.name}`
    : `https://a.hitomi.la/images/${hitomi.fullPathFromHash(image.hash)}${path.extname(image.name)}`),
  fullPathFromHash: (hash) => ((hash.length < 3) ? hash : hash.replace(/^.*(..)(.)$/, `$2/$1/${hash}`)),
  urlFromUrl: (url, base) => url.replace(/\/\/..?\.hitomi\.la\//, `//${hitomi.subDomainFromUrl(url, base)}.hitomi.la/`),
  subDomainFromUrl: (url, base) => {
    const subDomain = base || 'a';
    let m = /\/galleries\/\d*(\d)\//.exec(url);
    let b = 10;
    if (!m) {
      b = 16;
      m = /\/images\/[0-9a-f]\/([0-9a-f]{2})\//.exec(url);
      if (!m) return subDomain;
    }

    const g = parseInt(m[1], b);
    if (Number.isNaN(g)) return subDomain;

    return `${hitomi.subDomainFromGalleryId(g)}${subDomain}`;
  },
  subDomainFromGalleryId: (g) => String.fromCharCode(
    97 + (g % 3 /* common.js > number_of_frontends */),
  ),
};

module.exports = hitomi;
