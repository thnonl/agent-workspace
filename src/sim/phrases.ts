/**
 * Everything the office people say without being told what to say: greetings at the door, the thought that comes
 * with every break, the lines while they eat, goodbyes, small talk. Every pool is long so it does not get boring;
 * `pick` never returns the same line twice in a row from one pool.
 */

const lastOf = new WeakMap<readonly unknown[], number>();

export function pick<T>(pool: readonly T[]): T {
  if (pool.length === 1) return pool[0];
  let i = Math.floor(Math.random() * pool.length);
  if (i === lastOf.get(pool)) i = (i + 1 + Math.floor(Math.random() * (pool.length - 1))) % pool.length;
  lastOf.set(pool, i);
  return pool[i];
}

// ------------------------------------------------------------------ at the door
// The director is always the first one in and the last one out: they open up an empty office, staff walk in to a
// boss who is already at the desk (and perhaps some colleagues), and staff say goodbye to a boss who stays behind.
const OPEN_MORNING = ['Good morning, office! Lights on.', 'Morning! Coffee on, laptop open.', 'First one in again. Let’s open up.', 'Good morning! Let me set things up before the team arrives.'];
const OPEN_AFTERNOON = ['Good afternoon! Let’s open the office.', 'Afternoon! Lights on, laptop open.', 'Opening up. Quiet in here – for now.', 'Good afternoon, office! Let’s see what today brings.'];
const OPEN_EVENING = ['Good evening, office! Late start today.', 'Evening! Just me and the lamps – let’s begin.', 'Opening up for the night shift.', 'Good evening! Quiet in here. Perfect for focus.'];
const OPEN_ANY = ['Doors open. Who will be first to join me?', 'Lights on, everything is ready. Let’s start.', 'Let me get settled, the team will be here soon.', 'Hello, empty office! Let’s make it a good day.'];
/** the director arrives and somebody is already inside (the page was opened mid-run) */
const HELLO_DIRECTOR = ['Hello, everyone! Let’s get started.', 'Welcome, team! Here we go.', 'Let’s make it a good one, team.', 'Settle in, everyone. We have work to do.', 'Hi team! Lots to do today.'];

const BOSS_MORNING = ['Good morning, boss!', 'Morning, boss! Ready when you are.', 'Morning, boss. Coffee first?', 'Good morning, boss – what’s on the list?'];
const BOSS_AFTERNOON = ['Good afternoon, boss!', 'Afternoon, boss! What did I miss?', 'Hi boss, sorry I’m a bit late.', 'Good afternoon, boss – where do we stand?'];
const BOSS_EVENING = ['Good evening, boss!', 'Evening, boss. Burning the midnight oil again?', 'Evening, boss! Time for some focus.', 'Good evening, boss – still at it?'];
const HELLO_BOSS = ['Hello, boss!', 'Hi boss, I’m in!', 'Good to see you, boss.', 'Reporting for duty, boss!', 'Ready when you are, boss.'];
/** staff arrives and other staff already sit at their desks */
const HELLO_BOSS_TEAM = ['Hi boss, hi team!', 'Hey boss, hey team – what did I miss?', 'Hello boss, hello team!', 'Reporting in, boss. Hi, everyone!'];

/** staff arrives and greets a colleague (by name) instead of the boss */
const HELLO_MATE: ((name: string) => string)[][] = [
  [(n) => `Morning, ${n}!`, (n) => `Good morning, ${n}! Coffee yet?`, (n) => `Hey ${n}, morning!`, (n) => `Morning, ${n} – you look awake. Suspicious.`],
  [(n) => `Afternoon, ${n}!`, (n) => `Hi ${n}! Did I miss anything?`, (n) => `Hey ${n}, good afternoon!`, (n) => `Afternoon, ${n}. How is it going?`],
  [(n) => `Evening, ${n}!`, (n) => `Hi ${n}, still here? Me too.`, (n) => `Good evening, ${n}! Night shift, huh?`, (n) => `Hey ${n}, late one today.`],
];
const HELLO_MATE_ANY: ((name: string) => string)[] = [(n) => `Hi ${n}!`, (n) => `Hey ${n}, I’m in!`, (n) => `Hello, ${n}!`, (n) => `Good to see you, ${n}.`, (n) => `${n}! Save me a seat.`];

/** `mate`: the name of the colleague a member of staff greets instead of the boss (the one who greets is picked at random, see Actor) */
export function greetingLine(director: boolean, hour: number, colleagues = 0, mate?: string): string {
  const part = hour < 12 ? 0 : hour < 18 ? 1 : 2;
  if (!director && mate) return pick(Math.random() < 0.7 ? HELLO_MATE[part] : HELLO_MATE_ANY)(mate);
  if (director) {
    if (colleagues > 0) return pick(HELLO_DIRECTOR);
    return pick(Math.random() < 0.7 ? [OPEN_MORNING, OPEN_AFTERNOON, OPEN_EVENING][part] : OPEN_ANY);
  }
  const r = Math.random();
  if (colleagues > 0 && r < 0.4) return pick(HELLO_BOSS_TEAM);
  return pick(r < 0.7 ? [BOSS_MORNING, BOSS_AFTERNOON, BOSS_EVENING][part] : HELLO_BOSS);
}

// ------------------------------------------------------------- going home
const BYE_DIRECTOR = [
  'Everyone has gone home. Locking up. Good night!', 'Last one out – lights off. See you tomorrow!', 'All quiet now. Turning off the lights. Good night!',
  'That’s a wrap. Office closed. Take care!', 'Lights out, doors locked. Good night, office!', 'All done here. Off I go!',
  'Quiet office, good work today. Locking up!', 'The team is gone, so I’m next. Good night!',
];
const BYE_BOSS = [
  'Heading home, boss. See you tomorrow!', 'I’m off, boss. Good night!', 'Done for today, boss. Bye!', 'Laptop closed, brain closed. Bye, boss!',
  'See you next time, boss!', 'Good night, boss – don’t stay too late!', 'Packing up, boss. Bye!', 'That’s a wrap for me, boss. Have a good one!',
];
/** staff leaves and other staff are still at their desks */
const BYE_BOSS_TEAM = ['Bye boss, bye team!', 'Heading out, boss. See you, everyone!', 'Night, boss. Night, everyone!', 'Good work, all. Bye, boss!', 'Off I go. Bye, boss and team!'];
export const goodbyeLine = (director: boolean, colleagues = 0) =>
  pick(director ? BYE_DIRECTOR : colleagues > 0 && Math.random() < 0.45 ? BYE_BOSS_TEAM : BYE_BOSS);

// ------------------------------------------------------- thoughts before a break
const WANDER = [
  'Time to stretch my legs', 'Let me walk around a bit', 'My legs are falling asleep – a little walk', 'A short stroll will clear my head',
  'Let me see what the office looks like', 'Time to move around for a minute', 'I’ll take a lap around the room', 'A walk always helps me think',
  'Sitting too long is bad for you – up I go', 'Let me check on the plants on the way', 'A quick wander, then back',
];
const SOFA = [
  'Going to rest on the sofa for a bit', 'Just five minutes on the sofa…', 'That sofa looks so comfy', 'A little sit-down would be nice',
  'Let me rest my eyes on the sofa', 'Sofa time!', 'I deserve a moment on the couch', 'Time to sink into the sofa', 'Five minutes… maybe ten.',
  'The sofa is calling my name',
];
const WATCH = [
  (n: string) => `Let me see how ${n} is doing`, (n: string) => `I wonder what ${n} is working on`, (n: string) => `${n} looks busy – let me peek`,
  (n: string) => `Going to see what ${n} is typing`, (n: string) => `Maybe ${n} needs a cheerleader`, (n: string) => `Let me cheer ${n} on`,
  (n: string) => `Time to look over ${n}’s shoulder`, (n: string) => `${n} is on a roll – I want to watch`,
];
const WINDOW = [
  'Some fresh air by the window', 'I’ll enjoy the view for a moment', 'Let me look outside for a bit', 'What’s the weather doing out there?',
  'A little daydreaming at the window', 'I’ll check the sky', 'The window looks inviting', 'Let me see who’s outside', 'Time to rest my eyes on something far away',
  'A breath of fresh air, please',
];
const PET = [
  'Aww, a kitty! Time for a cuddle', 'Who’s a good cat? I’m coming!', 'The cat looks lonely – I’ll say hi', 'I must pet that cat right now',
  'Look at that fluffy face!', 'Kitty, kitty, kitty…', 'Cat break! Best kind of break', 'I bet she wants a scratch behind the ears', 'A cuddle will make my day',
  'That tail needs a pat, I mean the cat does',
];
const WATER = [
  'Getting a cold glass of water', 'Time for a glass of water', 'Staying hydrated – off to the cooler', 'I need a drink of water',
  'A cup of cold water sounds great', 'Water break!', 'My throat is dry – water time', 'Let me fill a cup at the cooler',
];
const COFFEE = [
  'Time for a fresh coffee', 'I need a coffee, stat', 'Coffee break!', 'One more coffee won’t hurt',
  'The coffee machine is calling me', 'A hot coffee would be perfect right now', 'Coffee first, thinking later', 'Let me grab a cup of coffee',
  'That smell of coffee is too tempting',
];
const READ = [
  (b: string) => `Time to read “${b}”`, (b: string) => `Let me read a bit of “${b}”`, (b: string) => `“${b}” – I’ve been meaning to finish it`,
  (b: string) => `I’ll grab “${b}” from the shelf`, (b: string) => `A few pages of “${b}” will do me good`, (b: string) => `Is “${b}” still on the shelf? Let’s see`,
  (b: string) => `Quiet moment – “${b}”, here I come`, (b: string) => `I’ll pick up “${b}” for a moment`,
];
const FISH = [
  'Let’s watch the fish swim', 'I wonder what the fish are up to', 'The fish always calm me down', 'Time to visit the fish',
  'Let me see if the fish have had breakfast', 'Fish TV is the best TV', 'I’ll count the fish', 'Bubbles and fish – perfect for a break',
  'Let’s see if the little orange one is hiding', 'A minute with the fish should do it',
];
const WASH = [
  'Off to wash my face', 'A splash of water will wake me up', 'Time to freshen up', 'Let me wash my hands',
  'A cold splash on the face – that’ll help', 'I’ll tidy myself up a bit', 'Quick trip to the sink', 'I need to wake up a little',
];
const PLANTS = [
  'The plants look thirsty – time to water them', 'Someone must water the plants', 'The plants need a drink', 'Let me give the plants some water',
  'That plant is getting droopy – watering time', 'I’ll be the plant person for a minute', 'Green things need water too', 'Watering can, where are you?',
  'The plants will thank me later', 'Time to take care of the greenery',
];
const COOK = [
  'I’m hungry – let’s cook some noodles', 'Time to cook something tasty', 'Something smells good already…', 'Noodles sound perfect right now',
  'Let me make a quick snack', 'My stomach is rumbling – to the stove!', 'I’ll cook a little something', 'A hot meal will fix everything',
  'Let me whip up some noodles', 'Cooking break! The best kind', 'The stove is free – time to cook', 'I’ll make a bowl of something warm',
];
const BOX = [
  'Time to punch some stress away', 'Let me take it out on the dummy', 'Round one! Ding ding!', 'A few jabs will clear my head',
  'That punching dummy is calling my name', 'Boxing break! Hit me, dummy', 'I need to hit something (nicely)', 'Float like a butterfly, sting like a bee',
  'Let me throw a few combos', 'Bugs fear the right hook',
];
const LIFT = [
  'Time for a few curls', 'Let me pump some iron (tiny iron)', 'Gotta keep these arms in shape', 'Bicep day! Every day is bicep day',
  'A little lifting between tasks', 'Let me grab the dumbbells', 'Feel the burn… just a little', 'Strong arms, strong code',
  'Ten reps, then back to work', 'Gains break!',
];
const CHAT = [
  (n: string) => `Let me have a chat with ${n}`, (n: string) => `I’ll go and talk to ${n}`, (n: string) => `${n} looks free – time for a chat`,
  (n: string) => `Maybe ${n} has news`, (n: string) => `Let me see what ${n} thinks`, (n: string) => `I’ll drop by ${n}’s desk`,
  (n: string) => `A friendly word with ${n} won’t hurt`, (n: string) => `${n} could use some company`,
];

const MUSIC = [
  'Time for some tunes 🎧', 'Headphones on, world off', 'Just one playlist…', 'Lo-fi and chill', 'This song is a banger', 'A little music keeps the brain going',
  'Let me drown out the silence', 'Queue the playlist',
];
const VIDEO = [
  'Just one quick video…', 'Let me check YouTube for a minute', 'Everyone says this video is hilarious', 'Five minutes of cat videos',
  'Tutorial time (totally work related)', 'Found a great video essay', 'Quick break: YouTube', 'One video, then back to it',
];
const BROWSE = [
  'Let me type something up while I wait', 'Might as well tidy my notes', 'Time to catch up on emails', 'Scrolling through the docs for fun',
  'Let me polish some old code', 'Writing a few notes for later', 'Reading the changelog… again', 'A little typing never hurt',
];
const GAME = [
  'Just one round…', 'Boss level – wish me luck', 'A quick game while the build runs', 'High score incoming', 'I’m only testing the graphics',
  'One more run, then work', 'Time to play (research)', 'Let me beat my own record',
];
const CALL = [
  'Video call time 🎥', 'Quick call with the family', 'Catching up with an old friend', 'Hello? Can you hear me?', 'A call to say hi', 'Let me ring a friend',
  'Face time with the folks', 'My camera is on, hair is fine',
];
const SHOP = [
  'Just looking at the shops…', 'This chair would look great here', 'Browsing for a gift', 'Add to cart? Maybe', 'A little window shopping 🛒',
  'Free delivery, you say?', 'Let me check the prices', 'My cart is already full',
];
const MAIL = [
  'Time to clear the inbox', 'Let me answer a few emails', 'Forty unread emails…', 'A quick reply and done', 'Any mail from the client?', 'Inbox zero is the goal',
  'Newsletters, newsletters everywhere', 'One more email to write',
];
const PARCEL = ['Delivery! 📦', 'Is that my package?', 'Somebody rang the bell!', 'A parcel for us!', 'Ooh, a delivery at the door', 'Let me grab that box'];
const TIDY = [
  'This place needs tidying up', 'Let me put this where it belongs', 'Somebody left this in the way', 'A tidy office, a tidy mind',
  'I’ll move that out of the walkway', 'Time for a little tidy-up', 'This box has been in the way all week', 'That pot is in a silly spot',
  'Let me clear a path', 'A bit of order never hurt',
];
const SMOKE = ['Just a quick smoke break', 'Fresh air and a cigarette', 'One cigarette, then back to work', 'Stepping out for a puff'];
const SLEEP = ['So sleepy… a little nap', 'Just resting my eyes', 'Power nap time', 'Five minutes of sleep…', 'Zzz… wake me when there is work'];

const LOUNGE = [
  'Time to sink into the bean bag', 'Bean bag, here I come!', 'Lying down for a bit – I can still work from there', 'The bean bag is calling me',
  'Horizontal mode: on', 'A little lie-down on the bean bag', 'I’ll take the bean bag, thank you', 'Five minutes flat on the bean bag',
  'Best seat in the office: the bean bag', 'Bean bag under the back, eyes on the ceiling',
];

// ------------------------------------- a game at the game machine
const PLAY: Record<string, string[]> = {
  arcade: ['One more round of Space Blasters!', 'High score, here I come', 'Insert coin… ready, player one', 'Just one quick game, honest', 'Those aliens won’t blast themselves'],
  arcadeDuo: ['Anyone up for a duel?', 'Player one, ready!', 'One round of the old fighting game', 'Time to defend my high score'],
  pinball: ['Pinball time – watch those flippers', 'Multiball, please!', 'Tilt? Never.', 'One ball, three lives, no mercy'],
  clawMachine: ['That plush bunny is mine', 'This time the claw grabs it', 'Just one try, I can feel it', 'The claw owes me a toy'],
  airHockey: ['Air hockey, who dares?', 'A quick match of air hockey', 'Fastest puck in the office'],
  foosball: ['Foosball break!', 'Spin those little players', 'Goalkeeper, don’t fail me now'],
  danceMachine: ['Dance break!', 'Time to show my moves', 'Arrow storm, let’s go', 'My legs need this'],
  consoleTv: ['A quick round on the console', 'One match, then back to work', 'Controller in hand, worries gone', 'Who wants a round of kart racing?'],
  racingSim: ['Vroom vroom – lap time', 'Let me beat my best lap', 'Pole position, here I come', 'Seat belt on, brain off'],
  vrStation: ['Off to another world for a bit', 'VR goggles on!', 'Let’s fight some virtual robots', 'Don’t mind me waving at nothing'],
  pingPong: ['Ping-pong, anyone?', 'Time for a quick rally', 'My backhand needs practice'],
  hoops: ['Shooting some hoops', 'Three-pointer time', 'Nothing but net', 'Let’s break the basket record'],
  psConsole: ['A match on the big screen!', 'PS time – who’s in?', 'One race from the couch', 'Couch co-op, anyone?', 'Controller charged, let’s go', 'Sofa, controller, big TV: perfect'],
};
const PLAY_BOSS = ['Even the boss needs a break', 'This is research. Serious research.', 'Team building, technically', 'The boss is allowed one game. Or two.'];
const PLAY_JOIN: ((n: string) => string)[] = [(n) => `Mind if I join, ${n}?`, (n) => `${n}, prepare to lose!`, (n) => `Room for one more, ${n}?`, (n) => `Rematch, ${n}!`, (n) => `Two players, ${n}? Let’s go!`];
const PLAY_VERSUS = ['Goal!', 'No way!', 'Gotcha!', 'Lucky shot…', 'Best of three?', 'You’re going down!', 'That doesn’t count!', 'Ha! Too slow!', 'Okay, okay, you’re good'];
const PLAY_END_WIN = ['New high score!', 'Got it! Look at this!', 'Still the champion', 'Yes! Did you see that?'];
const PLAY_END_LOSE = ['So close…', 'Argh, one more time later', 'The machine cheats, I swear', 'Next time. Definitely next time.'];
export const playLines = {
  /** deciding to play: `partner` = the colleague already at the machine (joining them), `boss`: the director */
  start: (machine: string, partner?: string, boss = false): [string, string] =>
    [partner ? pick(PLAY_JOIN)(partner) : boss && Math.random() < 0.4 ? pick(PLAY_BOSS) : pick(PLAY[machine] ?? PLAY.arcade), 'game'],
  versus: (): [string, string] => [pick(PLAY_VERSUS), 'game'],
  end: (won: boolean): [string, string] => [pick(won ? PLAY_END_WIN : PLAY_END_LOSE), 'game'],
};

// ------------------------------------- grumbles at the computer while there is no task
const TIRED = [
  'So tired today… *yawn*', 'My eyes hurt from this screen', 'I need a holiday. A long one.', 'Is it home time yet?', 'My back is killing me',
  'Running on two hours of sleep', 'Brain is buffering…', 'Too tired to even scroll', 'One more coffee and I might survive', 'Why is Monday so long? Wait, is it Monday?',
  'I could sleep right here on the keyboard', 'Exhausted, and nothing has even started', 'My neck is stiff from staring at this', 'Somebody wake me when the task comes',
  'Low battery: me, not the laptop', 'Need… more… sleep', 'This chair is too comfy, I’m fading', 'Sigh… long day',
];
const NET_SLOW = [
  'Ugh, the Wi-Fi is so slow today 🐌', 'Why is the internet crawling again?', 'This page is taking forever to load…', 'The loading spinner and I are best friends now',
  'Is the network down? Hello?', 'One bar of Wi-Fi. One!', 'Buffering… buffering… still buffering', 'Who is downloading the whole internet?',
  'My ping is higher than my salary', 'The video keeps freezing on the same face', 'Refresh. Refresh. Refresh. Nothing.', 'The router needs a nap too, apparently',
  'Packets lost somewhere between here and the cloud', 'Dial-up called, it wants its speed back', 'Slow network, slow brain, slow day', 'Did somebody unplug the router again?',
];

/** sitting at the computer with no task: tired, or the network is slow (`net` = the network one) */
export const grumbleLine = (net = Math.random() < 0.5): [string, string] => (net ? [pick(NET_SLOW), 'browse'] : [pick(TIRED), 'sleep']);

const PHONE = [
  'Scrolling my phone 📱', 'Just a quick scroll through my phone 📱', 'Let me check my phone 📱', 'Scrolling my phone 📱 – five minutes',
  'Anything new on my phone? 📱', 'A little doomscroll never hurt 📱', 'Checking what my friends posted 📱', 'Phone break! 📱',
  'Let me catch up on my feed 📱',
];

/**
 * What somebody wants to look at while scrolling the phone: built from an opener and a target, so two people (or one
 * person twice) rarely think the same sentence. The last few targets are skipped.
 */
const SCROLL_TARGETS: [string, string][] = [
  ['the group chat', '💬'], ['the weather for tomorrow', '⛅'], ['my bank balance', '💰'], ['the football scores', '⚽'],
  ['where my parcel is', '📦'], ['the news', '📰'], ['my horoscope', '🔮'], ['a recipe for dinner', '🍳'],
  ['the stock prices', '📈'], ['what my friends posted', '👥'], ['cheap flights', '✈️'], ['my step count', '👟'],
  ['a new playlist', '🎧'], ['the memes of the day', '😂'], ['my unread mail', '✉️'], ['a video about cats', '🐱'],
  ['the cinema times', '🎬'], ['the traffic home', '🚗'], ['my food delivery', '🛵'], ['the sale at my favourite shop', '🛍️'],
  ['who liked my photo', '❤️'], ['the latest tech gossip', '💻'], ['my camera roll', '🖼️'], ['a funny thread', '😂'],
  ['the lunch menu nearby', '🍜'], ['a podcast for the commute', '🎙️'], ['the price of that keyboard', '⌨️'], ['my savings goal', '🐷'],
  ['a map to the new café', '🗺️'], ['the birthday reminders', '🎂'], ['the group photo from last weekend', '📸'], ['a workout video', '🏋️'],
  ['how many unread messages I have', '🔔'], ['my alarm for tomorrow', '⏰'], ['a review of that new phone', '⭐'], ['the bus times', '🚌'],
  ['a tutorial on something I will never try', '🎓'], ['my fantasy league', '🏆'], ['the holiday photos', '🏖️'], ['the headlines', '📰'],
];
const SCROLL_OPENERS: ((x: string) => string)[] = [
  (x) => `I wonder what is new in ${x}`, (x) => `Let me check ${x}`, (x) => `Quick look at ${x}…`,
  (x) => `I should really check ${x}`, (x) => `Time to see ${x}`, (x) => `Did anything happen to ${x}?`,
  (x) => `Just want to see ${x}, then work`, (x) => `Now, where was ${x}…`, (x) => `Hmm, I haven’t looked at ${x} today`,
  (x) => `One peek at ${x} won’t hurt`, (x) => `Let me find ${x}`, (x) => `I bet there is something in ${x}`,
  (x) => `Right, ${x} next`, (x) => `Wait, I need to check ${x}`, (x) => `Maybe ${x} has an update`,
];
const SCROLL_FULL: [string, string][] = [
  ['Who texted me? Somebody texted me.', '💬'], ['I swear I felt it buzz', '📳'], ['Only one notification, I promise', '🔔'],
  ['Just refreshing it once more…', '🔄'], ['Is it already Friday on my phone?', '📅'], ['Nothing new. Let me refresh again.', '🔄'],
  ['Ten minutes, then I will work. Honest.', '⏰'], ['My thumb has a mind of its own', '👍'],
  ['Scroll, scroll, scroll… more scrolling', '♾️'], ['Why is there never anything good at the top?', '🤔'],
];
const recentScroll: string[] = [];
/** always ends with an icon for what is looked at, then the smartphone */
function scrollLine(): string {
  if (Math.random() < 0.15) { const [t, e] = pick(SCROLL_FULL); return `${t} ${e}📱`; }
  let x = pick(SCROLL_TARGETS);
  for (let i = 0; i < 6 && recentScroll.includes(x[0]); i++) x = pick(SCROLL_TARGETS);
  recentScroll.push(x[0]);
  if (recentScroll.length > 12) recentScroll.shift();
  return `${pick(SCROLL_OPENERS)(x[0])} ${x[1]}📱`;
}

const WC_HURRY = [
  'Nature calls – and it is shouting!', 'Gotta run, back in a minute!', 'Emergency! Out of my way!', 'Too much coffee… hurrying!',
  'Excuse me, urgent business!', 'Quick, quick, quick!', 'I should not have had that third cup',
];
const WC_PLAIN = ['Nature calls', 'A quick trip to the restroom', 'Back in a few minutes', 'Restroom break', 'Excuse me for a moment'];
const WC_PHONE = [
  'Restroom break – and a little scroll 📱', 'The best signal in the office is in there 📱', 'Taking my phone for a long sit 📱',
  'Time for a restroom break… and my feed 📱', 'Five minutes of peace and a phone 📱',
];
const WC_BOOK = [
  'Restroom break with a good book', 'The restroom is my library', 'A chapter or two in there, I think', 'Bringing something to read',
  'Reading time, in the quietest room',
];
const WC_NONE = ['Just going to sit and think', 'The quietest spot in the office', 'A moment of peace, please', 'Back soon – no phone, no worries', 'A quiet break in the restroom'];
const WASH_HANDS = ['Washing my hands, of course', 'Always wash your hands!', 'Soap time – twenty seconds', 'A clean pair of hands', 'Over to the sink to wash up', 'Hygiene first!'];
const TABLE_COFFEE = [
  'Coffee at the round table – nice', 'Time to sit down with a hot coffee', 'A cup of coffee and a proper seat', 'Let me drink this one sitting down',
  'Coffee break at the table', 'A calm coffee at the round table', 'Anybody joining me for coffee?',
];
const TABLE_MEAL = [
  'Lunch at the round table', 'Time for a proper meal – at a table', 'Let me eat sitting down for once', 'Noodles at the round table!',
  'Snack time, table for one (or more)', 'Food always tastes better at a table', 'I brought a bowl to the round table',
];

// ------------------------------------------ the box is open: a remark on what was in it
const UNBOXED_NAME: Record<string, string> = {
  bookshelf: 'a bookshelf', plant: 'a plant', tallPlant: 'a big plant', cactus: 'a cactus', cooler: 'a water cooler', coffee: 'a coffee machine', sofa: 'a sofa',
  beanbag: 'a beanbag', floorLamp: 'a floor lamp', printer: 'a printer', bin: 'a bin', fishtank: 'a fish tank', coatRack: 'a coat rack', armchair: 'an armchair',
  fileCabinet: 'a file cabinet', copier: 'a copier', meetingSet: 'a meeting table', whiteboardStand: 'a whiteboard', boxes: 'more boxes', serverRack: 'a server rack',
  fridge: 'a fridge', vending: 'a vending machine', trolley: 'a trolley', recycle: 'a recycling bin', loungeSet: 'a lounge set', credenza: 'a sideboard',
  sink: 'a sink', stove: 'a stove', punchDummy: 'a punching dummy', dumbbells: 'a set of dumbbells', toilet: 'a toilet',
  arcade: 'an arcade machine', arcadeDuo: 'a two-player arcade', pinball: 'a pinball machine', clawMachine: 'a claw machine', airHockey: 'an air hockey table',
  foosball: 'a foosball table', danceMachine: 'a dance machine', consoleTv: 'a game console', racingSim: 'a racing simulator', vrStation: 'a VR station',
  pingPong: 'a ping-pong table', hoops: 'a basketball arcade', psConsole: 'a PS5 and a big TV', psWall: 'a PS5 and a wall TV',
};
const UNBOXED = [
  (n: string) => `Wow, ${n}! The office just got an upgrade`,
  (n: string) => `So that’s what was in the box: ${n}!`,
  (n: string) => `${n[0].toUpperCase()}${n.slice(1)}! Exactly what we needed`,
  (n: string) => `Look at that – ${n}! Who ordered it?`,
  (n: string) => `Ooh, ${n}. It looks even better than the photo`,
  (n: string) => `${n[0].toUpperCase()}${n.slice(1)}… and it fits! Amazing`,
  (n: string) => `I love it, ${n} suits this place`,
];
const UNBOXED_ANY = ['Oh nice, it’s something good!', 'Wow, it really came in one piece!', 'That’s lovely – look at it!', 'Best delivery ever'];

const FETCH_COFFEE = [
  'Fresh coffee, coming right up', 'Let me fill a cup', 'The machine is calling my name', 'One cup, to go', 'Coffee first – and then somewhere comfy',
  'I’ll take a cup back with me', 'The smell alone is worth the walk',
];
const FETCH_MEAL = [
  'Something from the fridge, then lunch at the table', 'Let me warm up my lunch', 'The fridge has leftovers, I can smell them', 'Microwave time!',
  'I’m starving – lunch break', 'Who left a container in the fridge? Mine, I hope', 'A bowl from the fridge and a seat at the table',
];
const CARRY_TO: Record<'desk' | 'table' | 'sofa', string[]> = {
  desk: ['Back to my desk with this', 'I’ll drink it at my desk', 'A cup at the desk makes the code run faster'],
  table: ['The round table is the best place for this', 'Taking this to the table', 'Let me sit down at the round table with it'],
  sofa: ['The sofa is where this belongs', 'A cup on the sofa – perfect', 'I’ll enjoy this somewhere soft'],
};

export const thoughts = {
  fetchCoffee: (): [string, string] => [pick(FETCH_COFFEE), 'coffee'],
  fetchMeal: (): [string, string] => [pick(FETCH_MEAL), 'eat'],
  /** with the cup / bowl in the hand: where it goes */
  carryTo: (to: 'desk' | 'table' | 'sofa', meal: boolean): [string, string] => [pick(CARRY_TO[to]), meal ? 'eat' : 'coffee'],
  /** after opening a box: what was in it (`kind` is the kind of the prop; unknown: any remark) */
  unboxed: (kind?: string): [string, string] => [kind && UNBOXED_NAME[kind] ? pick(UNBOXED)(UNBOXED_NAME[kind]) : pick(UNBOXED_ANY), 'parcel'],
  toilet: (mode: 'phone' | 'book' | 'none', hurry: boolean) => pick(hurry ? WC_HURRY : mode === 'phone' ? WC_PHONE : mode === 'book' ? WC_BOOK : Math.random() < 0.5 ? WC_NONE : WC_PLAIN),
  washHands: () => pick(WASH_HANDS),
  tableCoffee: () => pick(TABLE_COFFEE),
  tableMeal: () => pick(TABLE_MEAL),
  phone: () => pick(PHONE),
  /** while the phone is in the hand: what they want to look at on it */
  scroll: () => scrollLine(),
  wander: () => pick(WANDER),
  sofa: () => pick(SOFA),
  lounge: () => pick(LOUNGE),
  watch: (name: string) => pick(WATCH)(name),
  window: () => pick(WINDOW),
  pet: () => pick(PET),
  water: () => pick(WATER),
  coffee: () => pick(COFFEE),
  read: (book: string) => pick(READ)(book),
  fish: () => pick(FISH),
  wash: () => pick(WASH),
  plants: () => pick(PLANTS),
  cook: () => pick(COOK),
  box: () => pick(BOX),
  lift: () => pick(LIFT),
  chat: (name: string) => pick(CHAT)(name),
  parcel: () => pick(PARCEL),
  music: () => pick(MUSIC),
  game: () => pick(GAME),
  call: () => pick(CALL),
  shop: () => pick(SHOP),
  mail: () => pick(MAIL),
  video: () => pick(VIDEO),
  browse: () => pick(BROWSE),
  tidy: () => pick(TIDY),
  smoke: () => pick(SMOKE),
  sleep: () => pick(SLEEP),
};

// ------------------------------------------ the director answers a message from the user
const ACK = [
  'Got it — I’ll get the team on it.', 'Understood, starting now.', 'On it, boss!', 'Copy that. Let me split this up.', 'Sure thing, working on it.',
  'Okay, leave it to us.', 'Roger that! We’re on it.', 'Message received. Let’s go!', 'Alright, I’ll take care of it.', 'Noted! Give us a moment.',
  'Will do — starting right away.', 'Good, I know what to do.', 'Consider it done. Well, almost.', 'Got it, the team is on the way.',
  'Understood. Sit back, we’ve got this.', 'Sounds good. Let me get started.', 'Right, I’ll brief the team.', 'Perfect, that’s clear. On it!',
  'Thanks! Let me look into it.', 'Okay, I’m on it. Stay tuned!',
];
/** said after reading a message on the smartphone */
const ACK_CALL = [
  'Yes, I’ve got it. I’ll get the team on it.', 'Understood — I’ll message you if anything comes up.', 'Okay, noted. We’re starting now.',
  'Yes, yes, I see it. Leave it with me.', 'Got it, thanks for the message. We’re on it!', 'Alright, I’ll brief the team right away.',
  'Sure, no problem. Talk soon!',
];
export const pickAck = (via: 'call' | 'email' = 'email') => pick(via === 'call' ? ACK_CALL : ACK);

// ---------------------------------------------------------- cooking and eating
const SERVE = [
  'Order up!', 'Noodles are ready!', 'Just right – into the bowl!', 'Perfect, look at that!', 'Careful, it’s hot!',
  'A little pepper and done!', 'Looks even better than it smells', 'Plating time!',
];
const EAT = [
  'Mmm, smells great! Itadakimasu!', 'Dinner is served!', 'Freshly cooked – time to eat!', 'Bon appétit, me!', 'First bite… so good!',
  'Hot, but worth it!', 'Nothing beats homemade noodles', 'Slurp! Delicious.', 'I could do this every day', 'Chef’s kiss!',
  'Eating right at the stove – the best seat in the house', 'Yum! Needs nothing.',
];
export const serveLine = () => pick(SERVE);
export const eatLine = () => pick(EAT);

// ------------------------------------------------------------------ hand-over
const REPORT_OK = [
  'All done! Here is my report.', 'Finished! The report is here.', 'Done and dusted – here you go.', 'Task complete. Report for you, boss.',
  'All wrapped up. Have a look!', 'That’s done. Here are my notes.', 'Ready! Everything is in the report.', 'Finished, and it went well.',
];
const REPORT_FAIL = [
  'Sorry, I could not finish this one.', 'I got stuck on this one, sorry.', 'That one did not work out, boss.', 'I tried, but it fought back.',
  'Sorry – this one beat me.', 'It failed. The report says why.',
];
export const reportLine = (failed: boolean) => pick(failed ? REPORT_FAIL : REPORT_OK);

// ------------------------------------------------- the whole session is done
// The director does not read the closing message out (it is on the summary paper); they only announce that the work is finished.
const DONE_OK = [
  'And that’s a wrap! Everything is done.', 'All done, team. Good work today!', 'Finished! Everything went through.', 'That’s the last one. We’re done here!',
  'Work complete. Nice job, everyone!', 'Done and dusted. Well played, team!', 'Everything is ticked off the list!', 'We did it – all finished!',
  'That’s everything. Time to breathe out.', 'All tasks complete. Beautiful work!', 'Mission accomplished, team!', 'The job is done. Great teamwork!',
  'Wrapped up, packed up, done!', 'Nothing left on the list. Lovely!', 'Finished ahead of my coffee getting cold.', 'That went smoothly. All done!',
  'And… done! Give yourselves a pat on the back.', 'Everything is finished. High fives all around!', 'The desk is clear. That’s a wrap!',
  'All finished – what a team!', 'Just like that, it’s done.', 'Boom. Finished.', 'Job complete. Time for a well-earned rest.',
  'We’ve crossed the finish line!', 'All done here. Thank you, everybody!', 'That’s the whole thing – done!', 'Done! The team really delivered.',
  'Last item checked. Excellent!', 'Case closed. Good work, all.', 'It’s finished, and it looks good.',
];
const DONE_FAILED = [
  'We’re done – though a few things did not work out.', 'Finished, but not everything went to plan.', 'All wrapped up, with a couple of bumps along the way.',
  'The work is over. Some parts fought back.', 'Done for now – a few tasks stumbled, though.', 'That’s the end of it. Not perfect, but finished.',
  'We got through it, bruises and all.', 'Wrapped up. Some of it failed, so keep an eye on it.',
];
const DONE_BIG = [
  'That was a big one – and it’s finished!', 'Long run, but we’re done. Well done, everyone!', 'A lot of work, all done. What a team!',
  'Phew, that was a marathon. Finished!', 'So many tasks, and every one is finished!', 'A busy one, but the whole list is done.',
];
/** an optional second line that points at the summary paper */
const DONE_HINT = [
  'The summary is ready whenever you are.', 'The details are on the summary sheet.', 'Have a look at the summary when you have a moment.',
  'I left the summary on the desk for you.', 'The full story is on the paper.', 'Summary’s ready – take a look!', 'Everything is written up on the summary sheet.',
];
/** what the director says when a session has finished all its work (one or two short lines) */
export function doneLines(failed: number, tasks: number): string[] {
  const main = pick(failed > 0 ? DONE_FAILED : tasks >= 8 ? (Math.random() < 0.6 ? DONE_BIG : DONE_OK) : DONE_OK);
  return Math.random() < 0.4 ? [main, pick(DONE_HINT)] : [main];
}

// ------------------------------------------------------------------ small talk
/** the first line is said by whoever walks over, then they take turns */
export const CHAT_SCRIPTS: (readonly string[])[] = [
  ['Did you see the cat on the sofa?', 'Yes! So fluffy.', 'I think she likes the sunny spot.', 'Can’t blame her!'],
  ['Coffee later?', 'Definitely, I need it.', 'The new beans are really good.', 'I’ll bring you a cup!'],
  ['How is your day going?', 'Slowly, but nicely.', 'Same here. Quiet is good.', 'Enjoy it while it lasts!'],
  ['Any plans for the weekend?', 'Sleeping, mostly.', 'Sounds perfect.', 'Ha, and you?'],
  ['Have you tried the noodles from the stove?', 'Not yet, are they good?', 'Best in the office!', 'Then I’m next.'],
  ['Nice weather outside!', 'I saw it from the window.', 'We should take a walk.', 'After this break!'],
  ['Which book did you pick last time?', 'Something about cats, of course.', 'Of course!', 'Lend it to me?'],
  ['Have you seen how the fish are doing?', 'The orange one is a show-off.', 'He does laps all day.', 'Goals, honestly.'],
  ['Do you think the plants like us?', 'They like the water more.', 'I watered them yesterday.', 'Then we’re their favourites.'],
  ['Is it just me, or is it quiet today?', 'Quiet is good for focus.', 'Until the pings start.', 'Let’s not jinx it.'],
  ['What are you working on?', 'Something with a lot of files.', 'Sounds exciting.', 'It is, in a tiring way.'],
  ['I could really use a nap.', 'The sofa is free.', 'Don’t tempt me!', 'Ten minutes, nobody will know.'],
  ['Did you hear the door earlier?', 'I thought it was the wind.', 'Or the cat.', 'The cat, for sure.'],
  ['Who is on lunch duty today?', 'I think it’s the noodle team.', 'That is the best team.', 'Save me a bowl!'],
  ['I love this desk lamp.', 'It gives such warm light.', 'Great for late hours.', 'Don’t say late hours…'],
  ['Have you tidied your desk lately?', 'Define tidied.', 'Fewer papers on the floor.', 'I like my system.'],
  ['What do you think of the new layout?', 'Cozy. I like the rug.', 'The windows are nice too.', 'Best office ever.'],
  ['Feels like it’s been a long day.', 'Has it? Time flies for me.', 'Maybe you’re having fun.', 'Maybe I am!'],
  ['Do you ever talk to the cat?', 'Every day.', 'Does she answer?', 'With her whole body.'],
  ['I saw a bird outside.', 'A big one?', 'A small one, very confident.', 'Bold bird. I approve.'],
  ['Got any good music recommendations?', 'Lo-fi, always.', 'Rain sounds too?', 'Rain sounds are great.'],
  ['Can you believe how fast the tasks come in?', 'They keep us on our toes.', 'I like the variety.', 'Same, except on Mondays.'],
  ['How is the coffee today?', 'Strong. Dangerous.', 'Perfect then.', 'I’ll have a second cup.'],
  ['Do you prefer mornings or evenings here?', 'Evenings, the lamps are cozy.', 'Mornings, the light is great.', 'We can agree on lamps.'],
  ['I want a bigger plant.', 'Where would it go?', 'Next to the sofa.', 'Then the cat would climb it.'],
  ['Have you stretched today?', 'Only my patience.', 'Come on, stand up with me.', 'Fine, a tiny stretch.'],
  ['Someone left a mug on my desk.', 'Was it you?', 'Probably yesterday’s me.', 'Yesterday’s you is messy.'],
  ['Have you tried the fridge snacks?', 'There are snacks?', 'Second shelf.', 'You just changed my life.'],
  ['This break is nice.', 'Short, but sweet.', 'Every bit counts.', 'Back to work soon.'],
  ['I think the director likes us.', 'Why do you say that?', 'They always smile.', 'Or they’re just tired.'],
  ['Do you ever dream of a bigger window?', 'Every single day.', 'With a view of the sea.', 'And a hammock.'],
  ['Did you catch the sunset?', 'Only the last bit.', 'It turned everything orange.', 'The room looked amazing.'],
  ['What’s your favourite spot in the office?', 'By the bookshelf.', 'Mine is the sofa.', 'Obvious.'],
];

/** small talk at the round table: whoever feels like it says one, the others listen */
export const TABLE_LINES: string[] = [
  'This coffee is exactly what I needed.', 'Is that your usual order?', 'Pass the sugar, please.', 'I could sit here all afternoon.', 'Did you try the noodles from the stove?',
  'The round table is the best seat in the house.', 'What was the last thing you worked on?', 'Have you seen the cat today?', 'Is it just me, or is it quiet?',
  'I should drink more water.', 'The weather looks lovely from here.', 'Did you sleep well?', 'Nice mug!', 'This is my favourite part of the day.',
  'What are you having?', 'Careful, it is hot!', 'I could really go for a nap.', 'We should do this more often.', 'Tell me a joke.',
  'Ha, that is a good one!', 'Do you ever get tired of bugs?', 'I like how everyone gets along here.', 'Any plans after work?',
  'The lamps look cozy tonight.', 'Honestly, the director is a good boss.', 'One more cup and I am done. Maybe.', 'Is the printer working again?',
  'What do you think the cat is dreaming of?', 'I think the plants are growing.', 'More coffee? I will get it.', 'This table wobbles a bit, no?',
  'Mmm, that smells good.', 'You eat like a bird!', 'No, you have it all wrong!', 'Hahaha, stop it!', 'Wait, what happened next?',
];

// ------------------------------------------------------------------ the silly pools
// The same pools again, with a lot more jokes in them (developer humour, cats, coffee, noodles). They are added to the
// plain lines above, so the office is sometimes sensible and often not.
OPEN_MORNING.push('Good morning, empty chairs. I’m the only one who wants to be here.', 'Morning! The coffee machine and I have a pact: it stays warm, I stay upright.', 'Office unlocked. Nobody tell the coffee I’m early.');
OPEN_AFTERNOON.push('Afternoon! I came in right after lunch, like a true professional.', 'Good afternoon! Fully charged. By which I mean 4%.', 'Opening up. The snacks are still safe, I checked.');
OPEN_EVENING.push('Evening! Who needs sleep when you have a desk lamp?', 'Night shift: me, the lamps and my questionable decisions.', 'Good evening! The bugs come out at night, so do I.');
OPEN_ANY.push('Booting up… me, not the laptop.', 'Who needs a team when you have vibes and a deadline?', 'Doors open. Somebody please bring noodles.', 'The office is mine. Nobody touch the thermostat.');
HELLO_DIRECTOR.push('Hello, team! Please act busy, the boss is watching. (I’m the boss.)', 'Welcome, everybody! Yes, there will be work. No, there will not be cake.', 'Gather round, team – today’s plan is “don’t break anything”.');

BOSS_MORNING.push('Morning, boss! I come bearing zero excuses.', 'Good morning, boss! I am here. Physically, at least.', 'Morning, boss! Did you miss me? Don’t lie.');
BOSS_AFTERNOON.push('Afternoon, boss! My motivation is still buffering.', 'Hi boss! I came through the door like a professional.', 'Afternoon, boss! Just checking whether it’s Friday yet.');
BOSS_EVENING.push('Evening, boss. Overtime already? Bold of you.', 'Evening, boss! I brought my second wind. It’s small.', 'Good evening, boss – I only came for the lamp light.');
HELLO_BOSS.push('Boss! I’m in. Please pretend to be surprised.', 'Hi boss! Nothing is on fire. Yet.', 'Hello, boss! I bring vibes and no deliverables.', 'Reporting for duty, boss. The duty may be optional.');
HELLO_BOSS_TEAM.push('Hi boss, hi team – yes, I made it, yes, barely.', 'Hey all! What did I miss? Please say “nothing”.', 'Hello boss, hello team, hello Wi-Fi.');

BYE_DIRECTOR.push('Office closed. The coffee machine is on its own now.', 'Lights off. Cat, you’re in charge.', 'Going home to do the same thing, but on the sofa.', 'Good night! If anything breaks, it wasn’t me.');
BYE_BOSS.push('I’m out, boss. Whatever happens, it works on my machine.', 'Bye boss! Don’t push to prod without me.', 'Logging off. My brain did it an hour ago.', 'Clocking out. Please don’t read the git log.');
BYE_BOSS_TEAM.push('Bye all! Try not to break prod.', 'Off I go – keep the cat fed, team!', 'Night team! Don’t stay for the bugs.');

WANDER.push(
  'Walking meeting with myself. Agenda: legs.', 'Step count isn’t going to cheat itself', 'If I look busy while walking, it counts as work', 'My chair filed a complaint. I’m walking it off.',
  'Stretching my legs before they unionise', 'Brb, pretending to go somewhere important', 'Stack trace of my steps: desk → nowhere → desk', 'Going to “check on something”. Nothing specific.',
);
SOFA.push(
  'Horizontal debugging session', 'Research shows naps improve code. I read that. Somewhere.', 'Gravity is stronger near the sofa', 'Testing the sofa in production',
  'Ctrl+Z on being awake', 'Cushion-driven development', 'Sofa meeting. Attendees: me.', 'I’m not lazy, I’m in power-saving mode',
);
WATCH.push(
  (n: string) => `Checking if ${n} is actually typing or just vibing`, (n: string) => `${n} is typing so fast. Suspicious.`, (n: string) => `Pair programming with ${n}, but only spiritually`,
  (n: string) => `Peeking at ${n}’s screen. For science.`, (n: string) => `Looking over ${n}’s shoulder – it’s called mentoring`, (n: string) => `Is ${n} using tabs or spaces? I need to know`,
  (n: string) => `Code review with my eyes: ${n} edition`,
);
WINDOW.push(
  'Staring into the distance like a movie hero', 'Touching grass (through glass)', 'Loading outdoors… 12%', 'Checking whether outside is still deployed',
  'I’m not daydreaming, I’m buffering', 'Outside has great graphics. Wish it had a keyboard.', 'Window.exe has started', 'Looking at the sky. No bugs up there.',
);
PET.push(
  'Emergency cat mission', 'This cat has not been reviewed by me yet', 'Merging with the cat branch', 'Must. Pet. Cat. Priority: P0',
  'Cat detected. Productivity: paused', 'Scratching behind ears – best refactor ever', 'I’m not procrastinating, I’m doing cat maintenance', 'Do I have permission to pet this cat? Yes. Yes I do.',
);
WATER.push(
  'Hydrate or diedrate', 'Refilling my human tank', 'Water: the original energy drink', 'Garbage-collecting my thirst',
  'Drinking water so my coffee feels less alone', 'Staying fluid. Like my architecture.', 'H2O, my favourite import', 'Quick hydration check. Result: dry.',
);
COFFEE.push(
  'Coffee: the real compiler', 'My blood type is espresso', 'No coffee, no commits', 'Installing caffeine… please wait',
  'Runtime error: coffee not found', 'A coffee a day keeps the bugs away. Maybe.', 'This is my fourth. Or fifth. Don’t tell anyone.', 'Coffee first, opinions later',
);
READ.push(
  (b: string) => `“${b}” is mostly pictures, right? No? Okay.`, (b: string) => `Reading “${b}” to look smart`, (b: string) => `Skimming “${b}” like it’s documentation`,
  (b: string) => `Let me pretend to understand “${b}”`, (b: string) => `Bookmarking “${b}”, because my brain is full`, (b: string) => `I’ll read “${b}” and forget it by lunch`,
  (b: string) => `Speedrunning “${b}”`,
);
FISH.push(
  'Fish don’t have deadlines. Must be nice.', 'Checking if the fish are in stand-up', 'Synchronised swimming review', 'They’re just like us: going in circles',
  'Fish TV has no ads. Underrated.', 'Blub blub. That’s all I’ve got.', 'Testing whether fish understand YAML', 'Sir, your bubbles are showing',
);
WASH.push(
  'Hand washing: the only code review that matters', 'Ctrl+Alt+Wash', 'I’ve been touching keyboards. It was time.', 'Rinse and repeat – like my git history',
  'Splashing my face to restart the brain', 'Cleaning up my act. And my hands.', 'Going to the sink to think', 'Turning myself off and on again – with water',
);
PLANTS.push(
  'Plants: my only reliable uptime', 'I talk to the plants. They don’t talk back, unlike QA.', 'Watering the plants. Photosynthesis as a service.', 'This plant has more growth than my career',
  'If the plant dies, it was a dependency issue', 'Leafy friends need hydration too', 'Giving the plants a drink. They give me oxygen. Fair trade.', 'The fern and I have a love-hate relationship',
);
COOK.push(
  'Noodles: the real deployment pipeline', 'Cooking is just debugging with heat', 'Ramen-driven development', 'Smells like a good idea. Or noodles.',
  'Hot noodles, cold takes', 'Adding chili for the stack traces', 'Boiling water is my only advanced skill', 'I’m not hungry, I’m refuelling my compiler',
);
BOX.push(
  'Punching bugs, one at a time', 'Every hit is a closed ticket', 'This dummy is actually my backlog', 'Dummy, meet Monday',
  'I’m not angry, I’m doing cardio', 'Rocky theme intensifies', 'Feature request denied. By fist.', 'Taking feedback… physically',
);
LIFT.push(
  'Lifting tiny weights for tiny commits', 'Gym bro energy, desk job body', 'Deadlift? I can barely git lift', 'My biceps are two-story-point tasks',
  'No pain, no merge', 'One rep, two reps… I lost count. It’s fine.', 'Leg day skipped, sitting counts', 'Bench press? I only bench-mark.',
);
CHAT.push(
  (n: string) => `I’m going to gossip with ${n}. For work reasons.`, (n: string) => `${n} has snacks, I can feel it`, (n: string) => `Time to distract ${n}. Wish me luck`,
  (n: string) => `Hey ${n}, got a minute? It’s about lunch.`, (n: string) => `Let me ask ${n} whether it works on their machine`, (n: string) => `Stand-up with ${n}, sit-down edition`,
  (n: string) => `I’ll go say hi to ${n} before I forget how talking works`,
);
PARCEL.push('Is it the keyboard I ordered at 3 a.m.?', 'A box! Hopefully not another cable', 'That’s either snacks or regret', 'Package for… probably me', 'Free dopamine, delivered to the door');
SMOKE.push('Stepping out to “think about architecture”', 'A quick puff between commits', 'Fresh air and questionable choices', 'Going to stare at the wall outside');
SLEEP.push('Recharging my battery. 3% left.', 'Rest mode on. Ping me when it compiles.', 'I’m not sleeping, I’m thinking with my eyes closed', 'Zzz… sudo wake me up', 'Loading dreams… 99%', 'Five more minutes, mum');
PHONE.push(
  'Scrolling for “research” 📱', 'Doomscrolling is a skill. I’m very good. 📱', 'One 40-second cat video, for morale 📱', 'One more reel… 📱',
  'My screen time report is judging me 📱', 'Checking the group chat, 37 unread 📱', 'Looking up how to centre a div 📱',
);

ACK.push(
  'On it! I’ll pretend it was my idea.', 'Got it. Delegating… I mean, leading.', 'Yes chef! I mean, yes boss.', 'Understood. I’ll ask the team nicely.',
  'Affirmative. The bugs should be afraid.', 'Noted, filed, and immediately worried about.', 'Sure. How hard can it be? (Famous last words.)', 'Alright, consider me motivated. Mostly.',
  'I’ll add it to the list – at the top, in bold, in red.', 'Say no more. Well, say a bit more, but I’ll manage.', 'Roger, roger. Wait, which one was Roger?',
);
ACK_CALL.push(
  'Ping! Yes. Uh-huh. Yes. Mhm. Got it, thanks!', 'New notification… oh, that is for me. Got it.', 'Okay okay okay okay okay – on it!',
  'Yes boss, no boss, sure boss, thumbs up.', 'Read receipt sent. Working on it.',
);
SERVE.push('Michelin star? Probably.', 'Noodles: deployed.', 'Soup’s up, nerds!', 'It’s giving gourmet.', 'Seasoned with pure optimism.', 'Order up! No refunds.');
EAT.push(
  'Noodles taste better when nobody is watching', 'Slurping is a sign of respect. Shh.', 'This is the real stand-up meeting', 'Mm, no bugs in this one',
  'Nom nom nom. Commit message: “food”.', 'Best code review happens over noodles', 'Carbs: the real fuel',
);
REPORT_OK.push(
  'Done! Zero bugs. Probably.', 'It works! I don’t know why, but it works.', 'Finished! Please admire responsibly.', 'Done on the first try. (The third.)',
  'Done! Somebody get me a cookie.', 'Shipped! Well, “handed over”. Same energy.', 'All finished. I even read the docs. Partially.',
);
REPORT_FAIL.push(
  'It broke. It wasn’t me. It was the code.', 'It fought back and won. Dirty fighter.', 'I failed, but with style.', 'Error 404: success not found.',
  'That one’s cursed, boss. I checked.', 'I put my heart in it. It put an exception in me.', 'Would you believe the bug wrote itself?',
);
DONE_OK.push(
  'Everything shipped! Somebody tell the cat.', 'We did it! Now nobody touch anything.', 'It works. Do not breathe on it.', 'All green! I’m scared.',
  'Zero errors. I don’t trust it either.', 'And that’s how legends merge.', 'It compiles, therefore we are brilliant.', 'Finished before the snacks ran out. Miracle!',
  'Shipped it! No take-backs.', 'Done! Time to celebrate by doing nothing.',
);
DONE_FAILED.push(
  'Finished with a few casualties. RIP, little tests.', 'Mostly done. The broken bits are “features”.', 'We survived! The code… less so.',
  'Done-ish. Please look away from the red part.', 'The work is done; the blame is still being assigned.',
);
DONE_BIG.push(
  'Whoa, that was huge. My keyboard needs a hug.', 'Marathon complete. Nobody ask me to do cardio now.', 'Finally! I can feel my fingers again.',
  'That took forever, but we’re legends now.', 'So many tasks! I’m proud and tired in equal parts.',
);
DONE_HINT.push('The summary is on the desk. It has plot twists.', 'Go read the paper. There’s a quiz later.', 'The summary is ready, and it’s even readable!');

CHAT_SCRIPTS.push(
  ['Quick question: tabs or spaces?', 'Spaces. I’m not a monster.', 'Bold opinion for someone who eats noodles with a spoon.', 'Leave the noodles out of this.'],
  ['It works on my machine.', 'We’re not shipping your machine.', 'Why not? It’s a great machine.', 'It has a cat on the keyboard.'],
  ['Have you tried turning it off and on again?', 'Three times.', 'And?', 'Now it doesn’t turn on at all.'],
  ['I named my variable “temp”.', 'Again?', 'It’s the third “temp” in the file.', 'Permanently temporary. Nice.'],
  ['Who wrote this function?', 'You did. Last Tuesday.', 'Wow, that person was a genius.', 'Or in a hurry.'],
  ['My code has no bugs.', 'Only undocumented features?', 'Exactly.', 'Tell that to production.'],
  ['I’m going to refactor everything.', 'Famous last words.', 'This time it’s different.', 'You said that last time too.'],
  ['Is the cat allowed to merge?', 'She already has commit access.', 'That explains the meowing in the changelog.', 'Best contributor this month.'],
  ['Ever feel like the AI does your job?', 'Only on weekdays.', 'And weekends?', 'Same, but I’m less mad.'],
  ['What’s for lunch?', 'Noodles.', 'Again?', 'Noodles are love. Noodles are life.'],
  ['Do you think the coffee machine is sentient?', 'It judges me in the mornings.', 'It hissed at me yesterday.', 'We should be nicer to it.'],
  ['I deleted the wrong folder.', 'Was it important?', 'It was called “do not delete”.', 'Classic.'],
  ['I wrote a 200-line comment.', 'For what?', 'To explain one line.', 'That line must be spicy.'],
  ['Sudo make me a sandwich.', 'Okay.', 'Wait, really?', 'No. Make your own.'],
  ['Is it a bug or a feature?', 'Depends who is asking.', 'The boss is asking.', 'It’s a feature. Obviously.'],
  ['How many tokens did we use today?', 'Yes.', 'That’s not a number.', 'It’s also not a small one.'],
  ['I’m so productive today.', 'Really?', 'I renamed three files.', 'Promotion material.'],
  ['I heard the context window is getting full.', 'Should we panic?', 'Only at 99%.', 'Then I’ll panic at 98%, to be safe.'],
  ['Please don’t push on Friday.', 'I’m not pushing, I’m gently nudging.', 'Into production?', 'Into production.'],
  ['I love deadlines.', 'You do?', 'I love the whooshing sound they make as they pass.', 'Douglas Adams would be proud.'],
  ['I asked the cat for a code review.', 'And?', 'She just stared.', 'Honest feedback.'],
  ['I have 47 browser tabs open.', 'That’s a lot.', 'I’m afraid to close them.', 'One of them is playing music, isn’t it?'],
  ['Do you ever just rm -rf your problems?', 'Every Friday.', 'And on Monday?', 'Cry and restore from backup.'],
  ['I think my chair is haunted.', 'It squeaks at midnight?', 'It squeaks whenever I stand up.', 'Sounds like a critic.'],
  ['Rubber duck debugging?', 'I use a cat.', 'Does she help?', 'She knocks the mug off the desk. Progress.'],
  ['Can we have a meeting about having fewer meetings?', 'Only if it’s short.', 'How short?', 'Zero minutes. Perfect meeting.'],
  ['I just compiled it without errors.', 'Congratulations!', 'I’m scared.', 'You should be.'],
  ['What’s your superpower?', 'Finding the missing semicolon.', 'Mine is adding one in the wrong place.', 'Villain origin story.'],
  ['I made a backup of my backup.', 'Wise.', 'Then I deleted both.', 'Legend.'],
  ['Are we allowed to name the bugs?', 'Why?', 'I’ve grown attached to Gary.', 'Gary has been here since 2019.'],
  ['Why is the fridge humming?', 'It’s practising the commit songs.', 'The commit songs?', 'Fix, fix, fix: the classic.'],
  ['I’m starting a cult for tidy code.', 'Can I join?', 'Only if you never use var.', 'I’ll just… use const. Promise.'],
  ['The Wi-Fi is slow.', 'Did you try yelling at it?', 'Does that work?', 'No. But it feels nice.'],
  ['Do you believe in ghosts?', 'Only in legacy code.', 'Same. They’re everywhere.', 'And they never leave.'],
  ['My code review comment was “LGTM”.', 'Did you read it?', 'I read the title.', 'A true professional.'],
  ['I found a bug in the docs.', 'That’s the code.', 'No, the docs lie.', 'Same thing, honestly.'],
  ['I think we need a bigger monitor.', 'We need a bigger budget.', 'We need a bigger cat.', 'Now you’re talking.'],
  ['Can you hear that noise?', 'It’s the server.', 'No, it’s my stomach.', 'Then it’s the server.'],
  ['What’s the plan for today?', 'Survive.', 'Bold.', 'And touch the plants so they don’t feel lonely.'],
);

// ------------------------------------------------------- the silly pools, round two
// Every case gets more jokes, including the ones that had none yet (desk breaks, games, the restroom, the phone).
const cap = (s: string) => `${s[0].toUpperCase()}${s.slice(1)}`;

OPEN_MORNING.push('Morning! I beat the sun here. The sun is a slacker.', 'Good morning! Today’s forecast: 90% chance of coffee.', 'Rise and grind. The coffee beans, mostly.', 'Morning, office! Let’s pretend we have a plan.');
OPEN_AFTERNOON.push('Afternoon! Post-lunch me is a different, slower person.', 'Good afternoon! The food coma and I clock in together.', 'Opening up. My lunch is still settling in too.');
OPEN_EVENING.push('Evening! The office is quiet. Suspiciously quiet.', 'Good evening! Normal people are having dinner. Not us.', 'Night mode: dark theme, warm lamps, cold coffee.');
OPEN_ANY.push('Welcome to the office, population: me.', 'Lights on! Bugs, you have been warned.', 'Let’s go! Step one: find the light switch.', 'First in, first to pick the good chair.');
HELLO_DIRECTOR.push('Morning meeting: everyone is great. Meeting over.', 'Hello, team! Today we ship. Or at least we try.', 'Team! Good news: the coffee machine works. Bad news: so must we.');

BOSS_MORNING.push('Morning, boss! My alarm and I are no longer friends.', 'Good morning, boss! I’m 80% coffee right now.', 'Morning, boss! I left my motivation at the bus stop.');
BOSS_AFTERNOON.push('Afternoon, boss! I was here in spirit all morning.', 'Hi boss! Lunch ran long. Lunch is very important.', 'Afternoon, boss! Fully fed, partially awake.');
BOSS_EVENING.push('Evening, boss! Night owl reporting in. Hoot.', 'Good evening, boss! The best code is written after dark. Allegedly.', 'Evening, boss – I brought snacks and zero regrets.');
HELLO_BOSS.push('Boss! I’m here and I only tripped once.', 'Hi boss, did somebody say tasks?', 'Hello, boss! Loading personality… done.', 'Present, boss! My brain arrives shortly.');
HELLO_BOSS_TEAM.push('Hi everyone! Did I miss the drama?', 'Hello boss, hello team, hello comfy chair!', 'Hey team! Who took my mouse? Kidding. Unless…');

HELLO_MATE[0].push((n) => `Morning, ${n}! Did you sleep, or just reboot?`, (n) => `${n}! Here early? Who are you trying to impress?`, (n) => `Good morning, ${n}. Same coffee, new bugs.`);
HELLO_MATE[1].push((n) => `Afternoon, ${n}! Lunch good? Tell me everything.`, (n) => `Hey ${n}, still alive after the morning?`, (n) => `${n}! Did the build pass, or should I go home again?`);
HELLO_MATE[2].push((n) => `Evening, ${n}! Welcome to the night owl club.`, (n) => `${n}, you too? The bugs must be biting tonight.`, (n) => `Hey ${n}, who needs sleep anyway?`);
HELLO_MATE_ANY.push((n) => `${n}! My favourite colleague. Don’t tell the others.`, (n) => `Hi ${n}! Nice shirt. New? It looks new.`, (n) => `${n}, you owe me a coffee. Hi, by the way.`, (n) => `Look who it is – the legendary ${n}!`);

BYE_DIRECTOR.push('Locking up. Plants, no parties while I’m gone.', 'All done. If the server calls, I’m not home.', 'Lights off. The bugs can sleep too.', 'Good night, desks. Good night, chairs. Good night, cat.');
BYE_BOSS.push('Bye boss! My brain left an hour ago, I’m catching up.', 'Going home to rest. By rest I mean scroll.', 'See you, boss! I’ll dream in code. Sadly.', 'Off I go before somebody says “one more thing”.');
BYE_BOSS_TEAM.push('Bye team! Last one out feeds the fish.', 'See you all! Don’t fix everything without me.', 'Good night, everyone! The cat is the boss now.');

WANDER.push('Going on a side quest', 'Patrolling the office. All clear, captain.', 'Looking for the motivation I dropped this morning', 'Doing laps until an idea shows up', 'Taking my legs out for a walk');
SOFA.push('The sofa and I have unfinished business', 'Ten minutes of being a cushion', 'Moving my thinking to a softer location', 'Sofa: zero bugs reported');
WATCH.push((n: string) => `${n} is quiet. Too quiet. Investigating.`, (n: string) => `Going to supervise ${n}. Moral support only.`, (n: string) => `Let me see if ${n} needs a snack`);
WINDOW.push('Checking the weather API: the window', 'Admiring the world’s biggest screensaver', 'Watching birds. They don’t have deadlines either.', 'Sky still blue. Deployment looks stable.');
PET.push('Cat requires attention. Request approved.', 'The cat opened a pull request for pets', 'Kitty! My one true stakeholder', 'Time to pay the cat tax');
WATER.push('Water: still free, still good', 'Doctor says eight glasses. I’m at two.', 'The plants drink more than me. Fixing that.', 'Off to the cooler for gossip. And water.');
COFFEE.push('Coffee o’clock. It’s always coffee o’clock.', 'Brewing up some motivation', 'Espresso yourself!', 'One latte to go – to my desk, two metres away');
READ.push((b: string) => `Opening “${b}” at a random page. Destiny.`, (b: string) => `“${b}”: chapter one. For the third time.`, (b: string) => `Reading “${b}” so I can quote it in meetings`);
FISH.push('The fish are planning something. I can tell.', 'Visiting my most relaxed colleagues', 'Fish meeting: everyone agrees, nobody talks', 'Let me check if Nemo is still lost');
WASH.push('Washing away the bugs', 'Water on the face: emergency reboot', 'A quick splash to look alive', 'Freshening up for my fans');
PLANTS.push('Plants are just very slow pets', 'Time to water my green coworkers', 'Hydration ticket for the plants: in progress', 'If I talk nicely, they grow faster. Science.');
COOK.push('Chef mode: activated', 'Noodles: the only thing I never burn. Usually.', 'Time to cook like nobody is watching', 'Instant noodles, but with love');
BOX.push('Punching the dummy that broke the build', 'Jab, jab, refactor!', 'Ding ding! Me vs. Monday, round two', 'Stress, meet fist');
LIFT.push('Lifting my spirits. And these.', 'Strong code needs strong arms', 'Pumping iron, pumping out tickets', 'Reps today, flexing tomorrow');
CHAT.push((n: string) => `Let me ask ${n} what they had for lunch`, (n: string) => `${n} looks bored. I can fix that.`, (n: string) => `Time to tell ${n} my latest terrible joke`);
PARCEL.push('Delivery! Everybody act normal.', 'The box is here! The box is here!', 'A parcel! Christmas came early', 'Who ordered this? Oh, it was me. Again.');
SMOKE.push('Stepping out to breathe… differently', 'Quick puff by the window. Don’t tell my lungs.');
SLEEP.push('Not sleeping. Compiling dreams.', 'Shutting down for maintenance', 'Eyes closed, brain in low-power mode', 'Ping me if something catches fire');
LOUNGE.push('Bean bag mode: I am one with the beans', 'Sinking… sinking… gone', 'Working from bean bag today', 'Ergonomics? Never heard of her', 'If I don’t come back, I live here now', 'Lying down to think horizontally');

MUSIC.push(
  'Music on. Typing speed: +20%', 'My “focus” playlist is all drum solos', 'Dancing in my chair. Nobody look.', 'This beat compiles',
  'Headphones on means “do not disturb”, team', 'Turning the bass up to debug louder', 'My playlist is 90% the same song',
);
VIDEO.push(
  'A ten-hour video. Just the first minute.', 'A tutorial on how to stop watching tutorials', 'This cat video is critical research', 'Autoplay chose violence today',
  'Watching someone else code. So relaxing.', 'Just one more video. Famous last words.',
);
BROWSE.push(
  'Reading the docs. The real horror genre.', 'Opening 12 tabs to answer one question', 'Sorting my desktop icons by vibe', 'Renaming files. Very important work.',
  'Googling an error I made myself', 'Writing a to-do list for my to-do list',
);
GAME.push('Respawning my motivation', 'Testing my reflexes. For work.', 'Save point reached. Back soon.', 'Speedrunning my break', 'Achievement unlocked: break time', 'I can stop any time. After this level.');
CALL.push(
  'Hi mum! Yes, I’m eating. Noodles count.', 'You’re on mute! No, YOU are on mute!', 'Can you see me? I can see my ceiling.', 'Quick call. Quick. Probably.',
  'Calling a friend to complain about bugs', 'Video call: I even fixed my hair for this',
);
SHOP.push(
  'Adding things to my cart for emotional support', 'Do I need a second keyboard? Obviously.', 'Looking at chairs I can’t afford', 'Comparing 40 identical mugs',
  'Cart total: hmm. Closing the tab.', 'A mechanical keyboard would fix my life',
);
MAIL.push(
  'Replying “per my last email”, very politely', 'Unsubscribing from everything. Freedom!', 'This email could have been a meeting. Wait.', 'Typing a reply, deleting it, typing again',
  'Mark all as read. Problem solved.', 'Archiving like a pro',
);
TIDY.push('Does this spark joy? No? Moving it.', 'Cleaning up – the office, not the code', 'Garbage collection, physical edition', 'Somebody left chaos here. Fixing it.', 'Refactoring the furniture');

PLAY.arcade.push('Pew pew! For the high score!', 'Insert coin, insert dignity', 'Arcade: 1. My productivity: 0.');
PLAY.arcadeDuo.push('Who wants to lose at the arcade?', 'Button mashing is a strategy');
PLAY.pinball.push('Flipper skills: legendary. Maybe.', 'Bumper, bumper, BONUS!');
PLAY.clawMachine.push('The claw is rigged, but I believe', 'Today the plush comes home with me', 'Just one coin. Okay, two.');
PLAY.airHockey.push('The puck goes brrr', 'Defence mode: on');
PLAY.foosball.push('Spinning is allowed here, right?', 'My little plastic team needs me');
PLAY.danceMachine.push('Watch these moves. Or don’t, please.', 'Cardio, but make it disco', 'Left, right, left – just like my career');
PLAY.consoleTv.push('Blue shell incoming, I can feel it', 'One race, then I’ll work. Honest.');
PLAY.racingSim.push('Speed limit? Not in this chair', 'Drifting into my break');
PLAY.vrStation.push('If I walk into a wall, it’s part of the game', 'Entering the metaverse. Back in five.');
PLAY.pingPong.push('Ping! Now somebody say pong', 'My serve is unreturnable. Allegedly.');
PLAY.hoops.push('Swish! Probably.', 'Three-pointer, or back to work');
PLAY.psConsole.push('Couch, controller, chaos', 'Pausing life, playing games', 'Who wants to lose on the big screen?');
PLAY_BOSS.push('Boss level unlocked. Literally.', 'Making sure the machine works. Very thoroughly.', 'Don’t tell the boss. Oh, wait.');
PLAY_JOIN.push((n) => `${n}, prepare to be humbled`, (n) => `Move over, ${n}, the champion is here`, (n) => `${n}, I’ll go easy on you. Not.`);
PLAY_VERSUS.push('Lag! That was lag!', 'My controller is broken', 'Beginner’s luck!', 'I let you win that one', 'Rematch! Rematch!', 'Who taught you that?!', 'Okay, now I’m serious');
PLAY_END_WIN.push('Undefeated! Put it on my CV.', 'GG, easy. Well, medium.', 'The legend continues', 'Champion of the break room!');
PLAY_END_LOSE.push('I was warming up', 'I wasn’t even trying. (I was.)', 'My hands are still cold', 'GG. I hate it.');

TIRED.push(
  'My energy left the chat', 'Running on fumes and leftovers', 'I need a nap from my nap', 'Even blinking is hard today',
  'My brain has too many tabs open', 'Is coffee a personality? Asking for me.', 'Battery saver mode: on', 'I yawned so hard my ears popped',
);
NET_SLOW.push(
  'The Wi-Fi is doing its best. Its best is bad.', 'Loading… still loading… it’s growing a beard', 'Page loaded! Oh no, it’s the error page', 'I could walk to the server faster',
  'The progress bar went backwards. How?', 'Right Wi-Fi password, wrong Wi-Fi attitude', 'Sending packets by carrier pigeon now', 'Speed test result: “lol”',
);

PHONE.push('Just checking the time. Twenty minutes ago. 📱', 'Phone in hand, plans abandoned 📱', 'Scrolling with professional dedication 📱', 'Liking memes from 2019 📱');
SCROLL_TARGETS.push(
  ['a video of a dog on a skateboard', '🐶'], ['my plant app', '🌱'], ['the price of a tiny house', '🏠'], ['who left the group chat', '👀'],
  ['a quiz about which noodle I am', '🍜'], ['my old embarrassing posts', '🙈'], ['a recipe I will never cook', '🧑‍🍳'], ['the Monday memes', '😩'],
  ['a thread about the best keyboard', '⌨️'], ['the moon phase', '🌙'], ['how long cats sleep a day', '😴'], ['the lottery numbers', '🎰'],
);
SCROLL_OPENERS.push(
  (x) => `Okay, ${x}, and then I’m productive`, (x) => `Breaking news, maybe: ${x}`, (x) => `My thumb insists on ${x}`,
  (x) => `Important research on ${x}`, (x) => `Can’t focus until I check ${x}`,
);
SCROLL_FULL.push(
  ['Opened the phone, forgot why', '🤷'], ['Reading the terms and conditions for fun', '📜'], ['Five notifications, all from one app', '🙄'],
  ['Battery 3%. Living dangerously.', '🪫'], ['Muting the group chat. Again.', '🔕'], ['Watched a 30-second video for 30 minutes', '⏳'],
);

WC_HURRY.push('Out of my way, it’s a P0!', 'Red alert! Restroom, now!', 'Speedrunning to the restroom', 'The coffee is collecting its debt');
WC_PLAIN.push('Bio break, back in five', 'Gotta go. Literally.', 'Short system break');
WC_PHONE.push('Taking the phone on a business trip 📱', 'Best Wi-Fi in the building is in there, trust me 📱', 'Restroom plus phone: twenty minutes, minimum 📱');
WC_BOOK.push('Bringing a book. Might be a while.', 'My reading corner has a lock', 'Catching up on chapter seven, privately');
WC_NONE.push('Going to think deep thoughts in private', 'All the best ideas happen in there', 'Off to the thinking room');
WASH_HANDS.push('Washing hands, humming “Happy Birthday”', 'Soap: the original antivirus', 'Clean hands, clean code', 'Germs, you are deprecated');
TABLE_COFFEE.push('A coffee meeting with myself', 'Sitting down so the coffee gets the respect it deserves', 'Table, coffee, zero emails. Bliss.', 'Coffee tastes better when I’m not typing');
TABLE_MEAL.push('Lunch at the table, like a civilised person', 'A meal without a keyboard in front of it? Wild.', 'Table for one, food for three', 'No crumbs in the keyboard today');

UNBOXED.push(
  (n: string) => `${cap(n)}! I didn’t order it, but I love it`, (n: string) => `Unboxed ${n}. Instructions: ignored.`,
  (n: string) => `It’s ${n}! Somebody tell the cat`, (n: string) => `${cap(n)}. Somebody has been shopping with the company card`,
);
UNBOXED_ANY.push('More foam peanuts than item. Classic.', 'Unboxed! The box is the best part – ask the cat', 'It’s here and nothing is broken. A miracle!', 'Wow. Okay. I have no idea what this is.');
FETCH_COFFEE.push('Caffeine refill, human edition', 'Going to ask the coffee machine for advice', 'One more cup – for science', 'Coffee run! Back with fuel');
FETCH_MEAL.push('Food first, bugs later', 'Hunting the fridge for leftovers', 'Microwave, do your magic', 'If the label says someone else’s name… I didn’t see it');
CARRY_TO.desk.push('Coffee next to the keyboard. Living dangerously.', 'Back to my desk – the coffee supervises');
CARRY_TO.table.push('Table reserved by me and my cup', 'Off to the round table, the VIP lounge');
CARRY_TO.sofa.push('Sofa plus cup: maximum comfort', 'Careful, sofa, don’t make me spill');

ACK.push('Got it! Rolling up my sleeves. Both of them.', 'On it! Somebody hide the snacks from me.', 'Understood – the team is warming up their keyboards.', 'Okay! Today we fix it, tomorrow we brag.');
ACK_CALL.push('Yes yes, got it. Phone back in the pocket.', 'Message read. Panic level: low. On it!', 'Thumbs-up emoji sent. That means yes.');
SERVE.push('Fresh from the stove, chef’s special!', 'Ding! Noodles ready, no bugs inside.');
EAT.push('If I eat fast, it counts as productive', 'This bowl is my safe space', 'Slurp responsibly');
REPORT_OK.push('Done! I only cried a little.', 'Here’s the report. It’s mostly good news.', 'Task complete. Do I get a sticker?', 'All done, boss! Tested on my machine.');
REPORT_FAIL.push('Bad news, boss. Also, nice shirt.', 'It failed, but I learned a lot. Mainly fear.', 'This task needed a hero. Not me today.', 'Report attached. Please read it gently.');
DONE_OK.push('Done! Nobody touch the keyboard.', 'Finished! Pizza is on me. Imaginary pizza.', 'All done. I’m framing this moment.', 'All done. That was suspiciously easy.');
DONE_FAILED.push('Done, with a few souvenirs in red.', 'Finished. Some tests are in a better place now.', 'Wrapped up. A couple of bugs got away – we’ll hunt them later.');
DONE_BIG.push('That list was longer than my CV. All done!', 'Huge job, done! Coffee for everyone.', 'We just ran a marathon in slippers. Finished!');
DONE_HINT.push('The summary has all the juicy details.', 'Summary’s on the desk. Spoiler: we won.');

CHAT_SCRIPTS.push(
  ['Did you push to main?', 'Define “push”.', 'Did code go to main?', 'Some code went somewhere.'],
  ['I think I fixed the bug.', 'Which one?', 'The one I made fixing the other one.', 'The circle of life.'],
  ['Why are you smiling?', 'My tests passed.', 'All of them?', 'I deleted the failing ones.'],
  ['Can you explain your code?', 'Sure. It works.', 'How?', 'Magic and a lot of if-statements.'],
  ['The cat sat on my keyboard.', 'Any damage?', 'She wrote a 40-line function.', 'Better than mine, probably.'],
  ['Is it lunch yet?', 'It’s 10 a.m.', 'So, almost?', 'Spiritually, yes.'],
  ['Do you write tests?', 'I write hopes.', 'And?', 'Some of them pass.'],
  ['I estimated two hours.', 'How long did it take?', 'Two days.', 'So you were close.'],
  ['Why is there a rubber duck on your desk?', 'It’s my senior developer.', 'Is it any good?', 'Never wrong, never talks.'],
  ['What does this regex do?', 'Nobody knows.', 'Who wrote it?', 'Nobody wants to know.'],
  ['Have you seen my coffee?', 'You’re holding it.', 'That’s my second one.', 'Then you drank the first.'],
  ['I’m going to bed early tonight.', 'Really?', 'After one more episode.', 'Famous last words.'],
  ['Do you think the plants can hear us?', 'I hope not.', 'Why?', 'I said mean things to the fern.'],
  ['I updated my dependencies.', 'All of them?', 'All of them.', 'Rest in peace, weekend.'],
  ['The boss said “quick fix”.', 'How quick?', 'Three files so far.', 'Quick like a sloth.'],
);
TABLE_LINES.push(
  'This coffee is stronger than my code.', 'Who ate the last biscuit?', 'Shh, the cat is listening.', 'If I sit here long enough, will work forget me?',
  'Five more minutes. Then five more.', 'Do you think the boss knows we’re here?', 'My mug says “World’s Okayest Developer”.', 'I dropped a noodle. It’s gone now.',
  'Best meeting of the day – and no slides!', 'Spill the tea. Not literally!', 'My coffee is getting cold, like my motivation.', 'Anybody want to hear about my weekend? No? Okay.',
);
