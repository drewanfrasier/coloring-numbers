const urls = import.meta.glob('./builtins/*.svg', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

const TITLES: Record<string, string> = {
  balloon: 'Hot Air Balloon',
  butterfly: 'Butterfly',
  castle: 'Castle',
  cat: 'Kitty Cat',
  clownfish: 'Clownfish',
  cupcake: 'Cupcake',
  dinosaur: 'Dinosaur',
  fox: 'Fox',
  house: 'Cozy House',
  icecream: 'Ice Cream',
  mushroom: 'Happy Mushroom',
  owl: 'Owl',
  penguin: 'Penguin',
  rainbow: 'Rainbow',
  rocket: 'Rocket Ship',
  sailboat: 'Sailboat',
  strawberry: 'Strawberry',
  sunflower: 'Sunflower',
  turtle: 'Turtle',
  whale: 'Whale',
};

export interface Builtin {
  id: string;
  title: string;
  url: string;
}

export const BUILTINS: Builtin[] = Object.entries(urls)
  .map(([path, url]) => {
    const id = path.replace(/^.*\/([\w-]+)\.svg$/, '$1');
    return { id, title: TITLES[id] ?? id, url };
  })
  .sort((a, b) => a.title.localeCompare(b.title));
