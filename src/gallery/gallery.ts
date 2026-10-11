import type { Progress } from '../puzzle/types';
import { allProgress, deletePicture } from '../storage/db';
import { h } from '../util/dom';

type Filter = 'all' | 'progress' | 'done';

export async function showGallery(root: HTMLElement): Promise<() => void> {
  let items = (await allProgress()).sort((a, b) => b.updatedAt - a.updatedAt);
  let filter: Filter = 'all';

  const grid = h('div', { class: 'art-grid' });
  const tabs = h('div', { class: 'chips' });

  const card = (p: Progress) => {
    const actions = h('div', { class: 'art-actions' });
    const askDelete = () => {
      actions.replaceChildren(
        h('span', {}, 'Delete?'),
        h('button', { class: 'mini danger', onClick: async () => {
          await deletePicture(p.id);
          items = items.filter((i) => i.id !== p.id);
          render();
        } }, 'Yes'),
        h('button', { class: 'mini', onClick: () => actions.replaceChildren(trash) }, 'No'),
      );
    };
    const trash = h('button', { class: 'mini', title: 'Delete', 'aria-label': `Delete ${p.title}`, onClick: askDelete }, '🗑');
    actions.append(trash);
    return h(
      'div',
      { class: 'art-card' },
      h('a', { href: `#/play/${p.id}`, class: 'art-thumb' },
        p.thumbnail ? h('img', { src: p.thumbnail, alt: '' }) : h('span', { class: 'muted' }, 'No preview yet'),
        p.completed ? h('span', { class: 'badge' }, '✓ Done') : null),
      h('div', { class: 'art-meta' },
        h('div', {}, h('strong', {}, p.title),
          h('div', { class: 'progress small' }, h('span', { class: 'progress-fill', style: { width: `${p.percent}%` } }), h('span', { class: 'progress-text' }, p.completed ? 'Finished' : `${p.percent}%`))),
        actions),
    );
  };

  const render = () => {
    tabs.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', String((c as HTMLElement).dataset.f === filter)));
    const list = items.filter((p) => (filter === 'all' ? true : filter === 'done' ? p.completed : !p.completed));
    if (!list.length) {
      grid.replaceChildren(
        h('div', { class: 'empty' },
          h('p', {}, items.length ? 'Nothing here yet.' : 'Your pictures will show up here once you start coloring.'),
          h('a', { class: 'btn primary', href: '#/' }, 'Pick a picture')),
      );
      return;
    }
    grid.replaceChildren(...list.map(card));
  };

  for (const [f, label] of [['all', 'All'], ['progress', 'In progress'], ['done', 'Finished']] as [Filter, string][]) {
    tabs.append(h('button', { class: 'chip', 'data-f': f, onClick: () => { filter = f; render(); } }, label));
  }
  render();

  root.replaceChildren(h('div', { class: 'gallery' }, h('div', { class: 'section-head' }, h('h2', {}, 'My Art'), tabs), grid));
  return () => {};
}
