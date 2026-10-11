export interface EmojiItem {
  char: string;
  title: string;
  keywords: string;
}

export interface EmojiCategory {
  id: string;
  label: string;
  items: EmojiItem[];
}

// "emoji title/extra search words|…" keeps this list easy to edit.
const RAW: [string, string, string][] = [
  ['animals', '🐶 Animals',
    '🐶 dog/puppy|🐱 cat/kitten|🐭 mouse|🐹 hamster|🐰 bunny/rabbit|🦊 fox|🐻 bear|🐼 panda|🐨 koala|🐯 tiger|🦁 lion|🐮 cow|🐷 pig|🐸 frog|🐵 monkey|🐔 chicken|🐧 penguin|🐦 bird|🐤 chick|🦆 duck|🦉 owl|🦄 unicorn|🐝 bee|🐛 caterpillar|🦋 butterfly|🐌 snail|🐞 ladybug|🐢 turtle|🐍 snake|🦖 t-rex/dinosaur|🦕 dinosaur/brontosaurus|🐙 octopus|🦑 squid|🦀 crab|🐠 tropical fish|🐟 fish|🐬 dolphin|🐳 whale|🦈 shark|🐊 crocodile|🦓 zebra|🦒 giraffe|🐘 elephant|🦛 hippo|🦏 rhino|🐪 camel|🦘 kangaroo|🐎 horse|🦩 flamingo|🦚 peacock|🦜 parrot|🐿️ chipmunk/squirrel|🦔 hedgehog|🦥 sloth|🦦 otter|🐲 dragon|🐉 dragon|🦭 seal|🐇 rabbit|🐈 cat|🐕 dog|🦙 llama|🐑 sheep|🐐 goat|🦌 deer|🦫 beaver'],
  ['food', '🍓 Food',
    '🍎 apple|🍐 pear|🍊 orange|🍋 lemon|🍌 banana|🍉 watermelon|🍇 grapes|🍓 strawberry|🫐 blueberries|🍒 cherries|🍑 peach|🥭 mango|🍍 pineapple|🥥 coconut|🥝 kiwi|🍅 tomato|🥑 avocado|🥕 carrot|🌽 corn|🥦 broccoli|🍄 mushroom|🥐 croissant|🥨 pretzel|🧀 cheese|🥞 pancakes|🧇 waffle|🍔 burger/hamburger|🍟 fries|🍕 pizza|🌭 hot dog|🌮 taco|🌯 burrito|🍣 sushi|🍙 rice ball|🍦 ice cream|🍧 shaved ice|🍨 ice cream|🍩 donut/doughnut|🍪 cookie|🎂 birthday cake|🍰 cake|🧁 cupcake|🥧 pie|🍫 chocolate|🍬 candy|🍭 lollipop|🍮 pudding|🍯 honey|🥛 milk|🧃 juice box|🧋 bubble tea|🍿 popcorn|🥤 soda/cup drink'],
  ['nature', '🌻 Nature',
    '🌸 cherry blossom/flower|🌺 hibiscus/flower|🌻 sunflower|🌼 blossom/flower|🌷 tulip|🌹 rose|🪷 lotus|🌱 seedling/plant|🌲 pine tree|🌳 tree|🌴 palm tree|🌵 cactus|🍀 clover/lucky|🍁 maple leaf|🍂 fallen leaves/autumn|🌈 rainbow|☀️ sun|🌤️ sun and cloud|⛅ cloud and sun|🌙 moon|🌛 moon face|⭐ star|🌟 glowing star|⚡ lightning|❄️ snowflake|⛄ snowman|☃️ snowman|🔥 fire|💧 droplet/water|🌊 wave/ocean|🌍 earth/globe|🌋 volcano|🏔️ snowy mountain|🏝️ island/beach|🪐 planet/saturn|☄️ comet|🌪️ tornado|🍄 mushroom|🐚 shell'],
  ['faces', '😀 Faces',
    '😀 grin/smile|😃 smile/happy|😄 laugh|😁 grin|😆 laughing|😅 sweat smile|🤣 rolling laughing|😂 tears of joy|🙂 slight smile|😉 wink|😊 blush|😇 angel/halo|🥰 in love/hearts|😍 heart eyes|🤩 star struck|😘 kiss|😋 yummy|😛 tongue|😜 winking tongue|🤪 zany/silly|😎 cool/sunglasses|🤓 nerd/glasses|🥳 party|🤗 hug|🤔 thinking|😴 sleeping|🥶 cold|🥵 hot|😱 scream|😤 huff|😭 crying|😡 angry|🤠 cowboy|🤡 clown|👻 ghost|👽 alien|🤖 robot|💩 poop|😺 smiling cat|😻 cat heart eyes|🙈 see no evil/monkey|🎃 pumpkin/jack o lantern'],
  ['fantasy', '🧚 Fantasy',
    '🧚 fairy|🧜‍♀️ mermaid|🧙 wizard|🦸 superhero|🧞 genie|🧛 vampire|👸 princess|🤴 prince|🎅 santa|🤶 mrs claus|🧝 elf|👑 crown|💎 gem/diamond|🔮 crystal ball|🪄 magic wand|🏰 castle|🏯 japanese castle|🎠 carousel horse|🦄 unicorn|🐉 dragon|🌈 rainbow|⭐ star|🪅 pinata|🎁 gift/present|🎈 balloon|🎉 party popper|🎊 confetti ball|🧸 teddy bear|🪁 kite|🪀 yo-yo|🎀 bow/ribbon'],
  ['travel', '🚀 Vehicles',
    '🚗 car|🚕 taxi|🚙 suv|🚌 bus|🚎 trolley|🏎️ race car|🚓 police car|🚑 ambulance|🚒 fire truck|🚐 van|🛻 pickup truck|🚚 truck|🚜 tractor|🛵 scooter|🏍️ motorcycle|🚲 bike/bicycle|🛴 kick scooter|🚂 train/locomotive|🚃 train car|🚄 bullet train|🚁 helicopter|✈️ airplane/plane|🛩️ small plane|🚀 rocket|🛸 ufo/flying saucer|⛵ sailboat|🚤 speedboat|🛳️ ship|⚓ anchor|🎡 ferris wheel|🎢 roller coaster|🗽 statue of liberty|🗼 tower|🏠 house|🏡 house with garden|⛺ tent/camping|🎪 circus tent|⛲ fountain|🏟️ stadium|🗿 moai statue'],
  ['fun', '⚽ Sports & Fun',
    '⚽ soccer ball|🏀 basketball|🏈 football|⚾ baseball|🥎 softball|🎾 tennis|🏐 volleyball|🏉 rugby|🎱 8 ball/pool|🏓 ping pong|🏸 badminton|🥅 goal|⛸️ ice skate|🛹 skateboard|🛼 roller skate|🎿 ski|🏆 trophy|🥇 gold medal|🎯 bullseye/target|🎮 game controller/video|🕹️ joystick|🎲 dice|🧩 puzzle piece|♟️ chess pawn|🎨 paint palette/art|🎭 theater masks|🎤 microphone|🎧 headphones|🎸 guitar|🎹 piano/keyboard|🥁 drum|🎺 trumpet|🎻 violin|🪇 maracas|🩰 ballet shoes|🤸 cartwheel|🏄 surfing|🏊 swimming'],
  ['objects', '💡 Things',
    '⌚ watch|📱 phone|💻 laptop|📷 camera|🔭 telescope|🔬 microscope|💡 light bulb|🔦 flashlight|🕯️ candle|📚 books|📖 book|✏️ pencil|🖍️ crayon|🖌️ paintbrush|✂️ scissors|📌 pin|📎 paperclip|🎒 backpack|👓 glasses|🕶️ sunglasses|👒 sun hat|🎩 top hat|🧢 cap|👟 sneaker|👠 high heel|👗 dress|👕 t-shirt|🧦 socks|🧤 gloves|🧣 scarf|💍 ring|☂️ umbrella|🔑 key|🧲 magnet|⏰ alarm clock|🪴 potted plant|🛁 bathtub|🧽 sponge|🧺 basket|🪣 bucket|🔔 bell|📬 mailbox|🧭 compass|🗝️ old key|💰 money bag|🪙 coin'],
  ['symbols', '❤️ Hearts & Shapes',
    '❤️ red heart|🧡 orange heart|💛 yellow heart|💚 green heart|💙 blue heart|💜 purple heart|🩷 pink heart|🩵 light blue heart|🤎 brown heart|💖 sparkling heart|💗 growing heart|💝 heart with ribbon|💘 heart with arrow|💕 two hearts|💞 spinning hearts|☮️ peace|☯️ yin yang|♻️ recycle|⚛️ atom|🔶 orange diamond|🔷 blue diamond|🔴 red circle|🟣 purple circle|🟩 green square|💯 hundred|✅ check|❓ question|❗ exclamation|💤 sleep/zzz|💥 boom|💫 dizzy star|✨ sparkles|🎵 music note|🎶 music notes|🏁 checkered flag|🚩 flag|🏳️‍🌈 rainbow flag'],
];

export const EMOJI_CATEGORIES: EmojiCategory[] = RAW.map(([id, label, list]) => ({
  id,
  label,
  items: list.split('|').map((entry) => {
    const space = entry.indexOf(' ');
    const [title, extra = ''] = entry.slice(space + 1).split('/');
    return { char: entry.slice(0, space), title: title.charAt(0).toUpperCase() + title.slice(1), keywords: `${title} ${extra}`.toLowerCase() };
  }),
}));

export const ALL_EMOJI: EmojiItem[] = (() => {
  const seen = new Set<string>();
  return EMOJI_CATEGORIES.flatMap((c) => c.items).filter((e) => (seen.has(e.char) ? false : (seen.add(e.char), true)));
})();
