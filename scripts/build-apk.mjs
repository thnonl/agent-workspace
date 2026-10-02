// Builds the Android app (android/) with its Gradle wrapper and prints where the APK is.
//
//   npm run apk              debug build (signed with the debug key; fine for your own phone)
//   npm run apk -- release   release build (signed with AW_KEYSTORE_FILE / AW_KEYSTORE_PASSWORD / AW_KEY_ALIAS /
//                            AW_KEY_PASSWORD when set, else with the debug key)
//
// Needs a JDK 17+ and the Android SDK. Both are taken from JAVA_HOME / ANDROID_HOME when set, else from where Android
// Studio puts them by default.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'android');
const release = process.argv.includes('release');
const win = process.platform === 'win32';
const firstDir = (list) => list.find((p) => p && fs.existsSync(p));

const env = { ...process.env };
env.JAVA_HOME ||= firstDir(
  win
    ? ['C:\\Program Files\\Android\\Android Studio\\jbr']
    : ['/Applications/Android Studio.app/Contents/jbr/Contents/Home', '/opt/android-studio/jbr', path.join(os.homedir(), 'android-studio', 'jbr')],
);
if (!env.ANDROID_HOME && !fs.existsSync(path.join(dir, 'local.properties'))) {
  env.ANDROID_HOME = firstDir([
    env.ANDROID_SDK_ROOT,
    win ? path.join(env.LOCALAPPDATA || '', 'Android', 'Sdk') : null,
    path.join(os.homedir(), 'Library', 'Android', 'sdk'),
    path.join(os.homedir(), 'Android', 'Sdk'),
  ]);
}
if (!env.JAVA_HOME) console.warn('JAVA_HOME is not set and Android Studio was not found: Gradle will look for java on the PATH.');
if (!env.ANDROID_HOME && !fs.existsSync(path.join(dir, 'local.properties'))) {
  console.error('Android SDK not found: install Android Studio, or set ANDROID_HOME.');
  process.exit(1);
}

const task = release ? 'assembleRelease' : 'assembleDebug';
const r = win
  ? spawnSync('cmd', ['/c', path.join(dir, 'gradlew.bat'), task], { cwd: dir, env, stdio: 'inherit' })
  : spawnSync('bash', ['./gradlew', task], { cwd: dir, env, stdio: 'inherit' });
if (r.status !== 0) process.exit(r.status ?? 1);

const kind = release ? 'release' : 'debug';
console.log(`\nAPK → ${path.relative(root, path.join(dir, 'app', 'build', 'outputs', 'apk', kind, `app-${kind}.apk`))}`);
