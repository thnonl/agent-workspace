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

export function greetingLine(director: boolean, hour: number, colleagues = 0): string {
  const part = hour < 12 ? 0 : hour < 18 ? 1 : 2;
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

const PARCEL = ['Delivery! 📦', 'Is that my package?', 'Somebody rang the bell!', 'A parcel for us!', 'Ooh, a delivery at the door', 'Let me grab that box'];
const SMOKE = ['Just a quick smoke break', 'Fresh air and a cigarette', 'One cigarette, then back to work', 'Stepping out for a puff'];
const SLEEP = ['So sleepy… a little nap', 'Just resting my eyes', 'Power nap time', 'Five minutes of sleep…', 'Zzz… wake me when there is work'];

const PHONE = [
  'Scrolling my phone 📱', 'Just a quick scroll through my phone 📱', 'Let me check my phone 📱', 'Scrolling my phone 📱 – five minutes',
  'Anything new on my phone? 📱', 'A little doomscroll never hurt 📱', 'Checking what my friends posted 📱', 'Phone break! 📱',
  'Let me catch up on my feed 📱',
];

export const thoughts = {
  phone: () => pick(PHONE),
  wander: () => pick(WANDER),
  sofa: () => pick(SOFA),
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
/** spoken into the phone */
const ACK_CALL = [
  'Yes, I’ve got it. I’ll get the team on it.', 'Understood — I’ll call you back if anything comes up.', 'Okay, noted. We’re starting now.',
  'Yes, yes, I hear you. Leave it with me.', 'Got it, thanks for calling. We’re on it!', 'Alright, I’ll brief the team right away.',
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
export const CHAT_SCRIPTS: readonly (readonly string[])[] = [
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
