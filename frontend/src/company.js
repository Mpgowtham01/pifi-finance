// Who this software belongs to, in one place. The sidebar, the login card and
// the browser tab all read it from here; the printed reports take the company
// name from the branch record instead, because that is what the old system
// printed and a branch may carry its own.
export const company = {
  name: 'Thangarathnam Finance',
  // Shown where there is no room for the full name, such as the collapsed
  // sidebar's tooltip.
  short: 'Thangarathnam',
  // The crest from the system being replaced (public/logo.png). Replace the
  // file to change it; it is square, so it stays square wherever it is drawn.
  logo: '/logo.png',
}
