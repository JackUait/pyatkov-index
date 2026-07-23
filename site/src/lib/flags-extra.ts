// ---------------------------------------------------------------------------
// The four cards react-svg-country-flags does not ship.
//
// Macao, Taiwan, Saint Kitts and Nevis and Kosovo all issue passports the index
// ranks, so the package's blank card would leave four rows looking broken. These
// are drawn to match the package exactly: a 21x15 viewBox, the same 2px-radius
// rounded card clipped by a mask, the same 10%-black inset hairline on top, and
// the same level of detail — at this size a flag is read by its field colour and
// one silhouette, so the emblems are simplified to what survives 20 pixels wide.
//
// They go through flagMarkup's normalisation like every other card: it strips
// the width/height, namespaces the mask ids and adds the class and aria-hidden.
// ---------------------------------------------------------------------------

/** The card itself: a 21x15 rect with 2px corners. Masks and fills both use it. */
const CARD =
  'M19 0H2C0.89543 0 0 0.89543 0 2V13C0 14.1046 0.89543 15 2 15H19C20.1046 15 21 14.1046 21 13V2C21 0.89543 20.1046 0 19 0Z';

/** The hairline the package strokes over every flag so pale fields keep an edge. */
const EDGE =
  'M19 0.5H2C1.17157 0.5 0.5 1.17157 0.5 2V13C0.5 13.8284 1.17157 14.5 2 14.5H19C19.8284 14.5 20.5 13.8284 20.5 13V2C20.5 1.17157 19.8284 0.5 19 0.5Z';

function card(id: string, field: string, emblem: string): string {
  return (
    `<svg width="21" height="15" viewBox="0 0 21 15" fill="none" xmlns="http://www.w3.org/2000/svg">` +
    `<mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="21" height="15">` +
    `<path d="${CARD}" fill="white"/></mask>` +
    `<g mask="url(#${id})">` +
    `<path d="${CARD}" fill="${field}"/>` +
    emblem +
    `<path d="${EDGE}" stroke="black" stroke-opacity="0.1"/>` +
    `</g></svg>`
  );
}

// Macao: five yellow stars arcing over a white lotus, its bridge and the water.
const MO = card(
  'mask0_x_mo',
  '#00785E',
  '<path fill="#FFFF00" d="M10.5 4.35L10.713 5.006L11.404 5.006L10.845 5.412L11.058 6.069L10.5 5.663L9.942 6.069L10.155 5.412L9.596 5.006L10.287 5.006Z"/>' +
    '<path fill="#FFFF00" d="M8.221 5.333L8.361 5.762L8.811 5.762L8.447 6.027L8.586 6.455L8.221 6.19L7.857 6.455L7.996 6.027L7.632 5.762L8.082 5.762Z"/>' +
    '<path fill="#FFFF00" d="M12.779 5.333L12.918 5.762L13.368 5.762L13.004 6.027L13.143 6.455L12.779 6.19L12.414 6.455L12.553 6.027L12.189 5.762L12.639 5.762Z"/>' +
    '<path fill="#FFFF00" d="M6.853 6.701L6.993 7.13L7.443 7.13L7.079 7.395L7.218 7.823L6.853 7.558L6.489 7.823L6.628 7.395L6.264 7.13L6.714 7.13Z"/>' +
    '<path fill="#FFFF00" d="M14.147 6.701L14.286 7.13L14.736 7.13L14.372 7.395L14.511 7.823L14.147 7.558L13.782 7.823L13.921 7.395L13.557 7.13L14.007 7.13Z"/>' +
    // Lotus: an upright centre petal flanked by two sweeping outer ones.
    '<path fill="white" d="M10.5 6.95C11.35 7.95 11.35 9.35 10.5 10.25C9.65 9.35 9.65 7.95 10.5 6.95Z"/>' +
    '<path fill="white" d="M10.33 10.32C9.13 10.17 8.23 9.37 8.03 8.37C9.23 8.52 10.13 9.32 10.33 10.32Z"/>' +
    '<path fill="white" d="M10.67 10.32C11.87 10.17 12.77 9.37 12.97 8.37C11.77 8.52 10.87 9.32 10.67 10.32Z"/>' +
    // The Nobre de Carvalho bridge over three lines of water.
    '<path stroke="white" stroke-width="0.42" fill="none" d="M7.2 12.25C8.3 10.95 9.5 10.95 10.5 12.25C11.5 10.95 12.7 10.95 13.8 12.25"/>' +
    '<path stroke="white" stroke-width="0.36" fill="none" d="M6.7 13.15C7.9 12.65 9.3 13.65 10.5 13.15C11.7 12.65 13.1 13.65 14.3 13.15"/>',
);

// Taiwan: a white twelve-rayed sun on the blue canton of a red field.
const TW = card(
  'mask0_x_tw',
  '#FE0000',
  '<path fill="#000095" d="M0 0H10.5V7.5H0V0Z"/>' +
    // The sun spans three quarters of the canton's height, per the ROC spec.
    '<path fill="white" d="M5.25 1.03L5.602 2.436L6.61 1.394L6.212 2.788L7.606 2.39L6.564 3.398L7.97 3.75L6.564 4.102L7.606 5.11L6.212 4.712L6.61 6.106L5.602 5.064L5.25 6.47L4.898 5.064L3.89 6.106L4.288 4.712L2.894 5.11L3.936 4.102L2.53 3.75L3.936 3.398L2.894 2.39L4.288 2.788L3.89 1.394L4.898 2.436Z"/>' +
    '<circle cx="5.25" cy="3.75" r="1.36" fill="white"/>',
);

// Saint Kitts and Nevis: a yellow-edged black band, two stars on it, green
// above the hoist and red below the fly. The band runs corner to corner, so
// every polygon is cut from the line y = 15 - (15/21)x.
const KN = card(
  'mask0_x_kn',
  '#009E49',
  '<path fill="#CE1126" d="M4.76 15L21 3.4V15Z"/>' +
    '<path fill="#FCD116" d="M0 11.6L16.24 0H21V3.4L4.76 15H0Z"/>' +
    '<path fill="#000000" d="M0 12.95L18.13 0H21V2.05L2.87 15H0Z"/>' +
    '<path fill="white" d="M7 8.55L7.326 9.552L8.379 9.552L7.527 10.171L7.852 11.173L7 10.554L6.148 11.173L6.473 10.171L5.621 9.552L6.674 9.552Z"/>' +
    '<path fill="white" d="M13.2 4.121L13.526 5.123L14.579 5.123L13.727 5.743L14.052 6.745L13.2 6.125L12.348 6.745L12.673 5.743L11.821 5.123L12.874 5.123Z"/>',
);

// Kosovo: the country's gold silhouette under an arc of six white stars.
const XK = card(
  'mask0_x_xk',
  '#244AA5',
  '<path fill="white" d="M7.8 3.203L7.962 3.701L8.485 3.701L8.062 4.008L8.223 4.506L7.8 4.199L7.377 4.506L7.538 4.008L7.115 3.701L7.638 3.701Z"/>' +
    '<path fill="white" d="M8.831 2.744L8.993 3.242L9.516 3.242L9.093 3.549L9.255 4.047L8.831 3.739L8.408 4.047L8.57 3.549L8.147 3.242L8.67 3.242Z"/>' +
    '<path fill="white" d="M9.936 2.51L10.097 3.007L10.62 3.007L10.197 3.315L10.359 3.812L9.936 3.505L9.512 3.812L9.674 3.315L9.251 3.007L9.774 3.007Z"/>' +
    '<path fill="white" d="M11.064 2.51L11.226 3.007L11.749 3.007L11.326 3.315L11.488 3.812L11.064 3.505L10.641 3.812L10.803 3.315L10.38 3.007L10.903 3.007Z"/>' +
    '<path fill="white" d="M12.169 2.744L12.33 3.242L12.853 3.242L12.43 3.549L12.592 4.047L12.169 3.739L11.745 4.047L11.907 3.549L11.484 3.242L12.007 3.242Z"/>' +
    '<path fill="white" d="M13.2 3.203L13.362 3.701L13.885 3.701L13.462 4.008L13.623 4.506L13.2 4.199L12.777 4.506L12.938 4.008L12.515 3.701L13.038 3.701Z"/>' +
    // The country's outline, traced coarsely: the northern spur, the eastern
    // bulge past Gjilan, the southern point at Dragash and the straight western
    // border along the Sharr and Prokletije ranges.
    '<path fill="#D0A650" d="M9.9 6.2L10.6 6.76L11.75 7.432L13 8.552L12.4 9.672L11.6 10.68L11 11.8L10 11.016L9.1 9.896L8.25 9.112L8.5 8.104L9.2 7.096Z"/>',
);

export const EXTRA_FLAGS: Record<string, string> = { MO, TW, KN, XK };
