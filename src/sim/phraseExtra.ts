/**
 * The shape of an extra batch of lines for the pools in phrases.ts. The batches are plain data (phrasesMore*.ts);
 * phrases.ts adds them to its pools at start-up. Placeholders: `{n}` a colleague's name (named pools), `{b}` a book
 * title (read), `{x}` what is looked at on the phone (scrollOpeners), `{n}` / `{N}` the unboxed thing, lower / upper case
 * first letter (unboxed).
 */

export type PlainPool =
  | 'OPEN_MORNING' | 'OPEN_AFTERNOON' | 'OPEN_EVENING' | 'OPEN_ANY' | 'HELLO_DIRECTOR'
  | 'BOSS_MORNING' | 'BOSS_AFTERNOON' | 'BOSS_EVENING' | 'HELLO_BOSS' | 'HELLO_BOSS_TEAM'
  | 'BYE_DIRECTOR' | 'BYE_BOSS' | 'BYE_BOSS_TEAM'
  | 'WANDER' | 'SOFA' | 'WINDOW' | 'PET' | 'WATER' | 'COFFEE' | 'FISH' | 'WASH' | 'PLANTS' | 'COOK' | 'BOX' | 'LIFT'
  | 'MUSIC' | 'VIDEO' | 'BROWSE' | 'GAME' | 'CALL' | 'SHOP' | 'MAIL' | 'PARCEL' | 'TIDY' | 'SMOKE' | 'SLEEP' | 'LOUNGE'
  | 'PLAY_BOSS' | 'PLAY_VERSUS' | 'PLAY_END_WIN' | 'PLAY_END_LOSE'
  | 'TIRED' | 'NET_SLOW' | 'PHONE'
  | 'WC_HURRY' | 'WC_PLAIN' | 'WC_PHONE' | 'WC_BOOK' | 'WC_NONE' | 'WASH_HANDS' | 'TABLE_COFFEE' | 'TABLE_MEAL'
  | 'UNBOXED_ANY' | 'FETCH_COFFEE' | 'FETCH_MEAL' | 'CARRY_DESK' | 'CARRY_TABLE' | 'CARRY_SOFA'
  | 'ACK' | 'ACK_CALL' | 'SERVE' | 'EAT' | 'REPORT_OK' | 'REPORT_FAIL' | 'DONE_OK' | 'DONE_FAILED' | 'DONE_BIG' | 'DONE_HINT'
  | 'TABLE_LINES';

/** pools whose lines take a colleague's name as `{n}` */
export type NamedPool = 'HELLO_MATE_MORNING' | 'HELLO_MATE_AFTERNOON' | 'HELLO_MATE_EVENING' | 'HELLO_MATE_ANY' | 'WATCH' | 'CHAT' | 'PLAY_JOIN';

export type Machine =
  | 'arcade' | 'arcadeDuo' | 'pinball' | 'clawMachine' | 'airHockey' | 'foosball' | 'danceMachine'
  | 'consoleTv' | 'racingSim' | 'vrStation' | 'pingPong' | 'hoops' | 'psConsole';

export interface PhraseExtra {
  plain?: Partial<Record<PlainPool, string[]>>;
  named?: Partial<Record<NamedPool, string[]>>;
  /** what somebody thinks before reading a book, `{b}` = the title */
  read?: string[];
  /** deciding to play at a machine */
  play?: Partial<Record<Machine, string[]>>;
  /** what is looked at on the phone, with its icon */
  scrollTargets?: [string, string][];
  /** `{x}` = a scroll target */
  scrollOpeners?: string[];
  /** a whole phone thought with its icon */
  scrollFull?: [string, string][];
  /** after opening a box: `{n}` = "a sofa", `{N}` = "A sofa" */
  unboxed?: string[];
  /** small talk, four lines each: the one who walks over, the other, then they take turns */
  chatScripts?: [string, string, string, string][];
}
