import './style.css';
import { showGallery } from './gallery/gallery';
import { showLibrary } from './library/library';
import { showPlay } from './play/play';
import { h } from './util/dom';

const app = document.getElementById('app')!;
const navLibrary = h('a', { href: '#/', class: 'nav-link' }, '🖼️ Pictures');
const navArt = h('a', { href: '#/art', class: 'nav-link' }, '⭐ My Art');
const header = h(
  'header',
  { class: 'site-header' },
  h('a', { href: '#/', class: 'logo', 'aria-label': 'Color Pop home' },
    h('span', { class: 'logo-mark' }, h('span', {}, '1'), h('span', {}, '2'), h('span', {}, '3')),
    h('span', { class: 'logo-text' }, 'Color Pop')),
  h('nav', {}, navLibrary, navArt),
);
const main = h('main', { class: 'view' });
app.replaceChildren(header, main);

let dispose: () => void = () => {};
let routeSeq = 0;

async function route() {
  const seq = ++routeSeq;
  dispose();
  dispose = () => {};
  const path = location.hash.replace(/^#/, '') || '/';
  const play = path.match(/^\/play\/(.+)$/);
  document.body.classList.toggle('playing', !!play);
  navLibrary.classList.toggle('active', path === '/');
  navArt.classList.toggle('active', path === '/art');
  window.scrollTo(0, 0);

  const container = h('div', { class: 'view-inner' });
  let next: () => void;
  if (play) next = await showPlay(container, decodeURIComponent(play[1]));
  else if (path === '/art') next = await showGallery(container);
  else next = showLibrary(container);

  // If she navigated again while this view was loading, throw it away.
  if (seq !== routeSeq) {
    next();
    return;
  }
  main.replaceChildren(container);
  dispose = next;
}

window.addEventListener('hashchange', route);
route();

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
