const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function fixture(platform = 'darwin', launchError) {
  const calls = [], prepared = [];
  class WindowsAudioPlayer { constructor(directory) { this.directory = directory; } }
  const sandbox = {module:{exports:{}},process:{platform},require(name) {
    if (name === 'node:path') return path.posix;
    if (name === './audio-volume') return {
      normalizeVolume:require('../audio-volume').normalizeVolume,
      prepareSound(filename,volume){const item={filename,volume,disposed:false,dispose(){this.disposed=true;}};prepared.push(item);return item;}
    };
    if (name === './windows-audio') return {WindowsAudioPlayer};
    if (name === 'node:child_process') return {execFile(command,args,options,callback) {
      const call = {command,args,options,callback,killed:false};
      calls.push(call);
      if (launchError) throw launchError;
      return {kill(signal) { call.killed = signal; }};
    }};
    throw Error(name);
  }};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../native-audio.js'),'utf8'),sandbox);
  const directory = "/Users/Sound O'Brien $(ignored)/音/sounds";
  return {player:sandbox.module.exports.createAudioPlayer(directory),calls,directory,WindowsAudioPlayer,prepared};
}
const flush = () => new Promise(resolve => setImmediate(resolve));

for (const platform of ['darwin','linux']) test(`${platform}: volume preparation, mute, and cleanup`, async () => {
  const {player,calls,prepared}=fixture(platform);
  const first=player.play('flute.wav',25);
  assert.equal(prepared[0].volume,25);
  assert.equal(await player.play('flute.wav',0),false);
  assert.equal(calls.length,1);
  assert.equal(calls[0].killed,'SIGKILL');
  calls[0].callback(Error('killed'));
  assert.equal(await first,false);
  assert.equal(prepared[0].disposed,true);
  const second=player.play('chime.wav',50);
  calls[1].callback(null);
  assert.equal(await second,true);
  assert.equal(prepared[1].disposed,true);
});

test('factory preserves the Windows backend and only supports native desktop platforms', () => {
  const windows = fixture('win32');
  assert(windows.player instanceof windows.WindowsAudioPlayer);
  assert.equal(windows.player.directory,windows.directory);
  assert.equal(fixture('freebsd').player,undefined);
});

for (const platform of ['darwin','linux']) test(`${platform}: safe native invocation and all bundled sound selections`, async () => {
  const {player,calls,directory} = fixture(platform);
  for (const sound of ['chime.wav','positive.wav','software.wav','flute.wav','marimba.wav','scifi.wav',undefined,'../../other.wav',{},'-bad.wav']) {
    const done = player.play(sound);
    const call = calls.at(-1);
    assert.equal(call.command,platform === 'darwin' ? '/usr/bin/afplay' : 'pw-play');
    const expected = typeof sound === 'string' && !sound.includes('/') && !sound.startsWith('-') ? sound : 'chime.wav';
    assert.equal(call.args.length,1);
    assert.equal(call.args[0],`${directory}/${expected}`);
    assert.equal(call.options.shell,false);
    assert.equal(call.options.timeout,15000);
    assert.equal(call.options.killSignal,'SIGKILL');
    assert.equal(call.options.maxBuffer,16384);
    call.callback(null,'','');
    assert.equal(await done,true);
    assert.equal(player.active,undefined);
  }
});

test('Linux falls back on missing players and server failures, and remembers successful playback', async () => {
  const {player,calls} = fixture('linux');
  const done = player.play('flute.wav');
  calls[0].callback(Object.assign(Error('spawn pw-play ENOENT'),{code:'ENOENT'}),'','');
  await flush();
  assert.equal(calls[1].command,'paplay');
  calls[1].callback(Error('exit 1'),'','Connection refused');
  await flush();
  assert.equal(calls[2].command,'aplay');
  calls[2].callback(null,'','');
  assert.equal(await done,true);
  const next = player.play('chime.wav');
  assert.equal(calls[3].command,'aplay');
  calls[3].callback(Error('exit 1'),'','Device unavailable');
  await flush();
  assert.equal(calls[4].command,'pw-play');
  calls[4].callback(null,'','');
  assert.equal(await next,true);
  assert.equal(player.preferred,'pw-play');
});

test('Linux reports every failed backend and installation guidance', async () => {
  const {player,calls} = fixture('linux');
  const done = player.play('chime.wav');
  const rejected = assert.rejects(done,/Install pw-play.*paplay.*aplay.*pw-play: missing.*paplay: refused.*aplay: timeout/);
  for (const [index,message] of ['missing','refused','timeout'].entries()) {
    calls[index].callback(Error(message),'','');
    await flush();
  }
  await rejected;
  assert.equal(player.active,undefined);
});

test('macOS reports launch, timeout, and format failures with no Linux fallback', async () => {
  const {player,calls} = fixture();
  for (const [message,stderr] of [['ENOENT',''],['timeout',''],['exit 1','Invalid WAV']]) {
    const done = player.play('chime.wav');
    calls.at(-1).callback(Error(message),'',stderr);
    await assert.rejects(done,new RegExp(`chime.wav:.*macOS.*afplay.*${stderr || message}`));
  }
  assert.equal(calls.length,3);
});

test('synchronous launch errors are handled for every backend', async () => {
  const {player,calls} = fixture('linux',Error('spawn failed'));
  await assert.rejects(player.play('chime.wav'),/spawn failed/);
  assert.equal(calls.length,3);
  assert.equal(player.active,undefined);
});

for (const platform of ['darwin','linux']) test(`${platform}: replacement and disposal cancel without fallback or false errors`, async () => {
  const {player,calls} = fixture(platform);
  const first = player.play('flute.wav');
  const second = player.play('chime.wav');
  assert.equal(calls[0].killed,'SIGKILL');
  calls[0].callback(Error('killed'),'','');
  assert.equal(await first,false);
  assert.equal(calls.length,2);
  // Finishing the old request must not discard the newer request's child.
  player.dispose();
  assert.equal(calls[1].killed,'SIGKILL');
  calls[1].callback(Error('killed'),'','');
  assert.equal(await second,false);
  assert.equal(await player.play('flute.wav'),false);
  assert.equal(calls.length,2);
});

test('disposal between Linux attempts prevents launching a fallback', async () => {
  const {player,calls} = fixture('linux');
  const done = player.play('flute.wav');
  calls[0].callback(Error('missing'),'','');
  player.dispose();
  assert.equal(await done,false);
  assert.equal(calls.length,1);
});

test('macOS/Linux native audio smoke test: all bundled WAVs', {
  skip: !['darwin','linux'].includes(process.platform) || process.env.CODEX_NOTIFIER_AUDIO_SMOKE !== '1', timeout:300000
}, async () => {
  const {createAudioPlayer} = require('../native-audio');
  const player = createAudioPlayer(path.join(__dirname,'../sounds'));
  try {
    for (const sound of ['chime.wav','positive.wav','software.wav','flute.wav','marimba.wav','scifi.wav']) {
      assert.equal(await player.play(sound),true,sound);
    }
  } finally { player.dispose(); }
});
