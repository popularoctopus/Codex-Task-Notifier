const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function fixture() {
  const calls=[];
  const sandbox={Buffer,process:{env:{SystemRoot:'C:\\Windows'}},module:{exports:{}},require(name){
    if(name==='node:path')return path.win32;
    if(name==='node:child_process')return {execFile(executable,args,options,callback){
      const call={executable,args,options,callback,killed:false};calls.push(call);
      return {kill(){call.killed=true;}};
    }};
    throw Error(name);
  }};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../windows-audio.js'),'utf8'),sandbox);
  const directory="C:\\Users\\Sound O'Brien $(ignored)\\sounds";
  return {player:new sandbox.module.exports.WindowsAudioPlayer(directory),calls,directory};
}

test('Windows launches hidden, bounded playback with asset paths passed as data', async () => {
  const {player,calls,directory}=fixture();
  const done=player.play('flute.wav');
  const call=calls[0];
  assert.equal(call.executable,'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe');
  assert.equal(call.options.windowsHide,true);
  assert.equal(call.options.shell,false);
  assert.equal(call.options.timeout,15000);
  assert(call.args.includes('-NoProfile')); assert(call.args.includes('-NonInteractive'));
  assert.equal(call.args[call.args.indexOf('-WindowStyle')+1],'Hidden');
  const script=Buffer.from(call.args.at(-1),'base64').toString('utf16le');
  assert(script.includes('$env:CODEX_NOTIFIER_SOUND_FILE'));
  assert(script.includes('$player.PlaySync()'));
  assert(!script.includes(directory));
  assert.equal(call.options.env.CODEX_NOTIFIER_SOUND_FILE,path.win32.join(directory,'flute.wav'));
  call.callback(null,'',''); assert.equal(await done,true);
  player.dispose(); assert.equal(call.killed,false);
});

test('untrusted sound names cannot select files outside the bundled allowlist', async () => {
  const {player,calls,directory}=fixture();
  for(const sound of ['../../other.wav',"flute.wav'; exit 1",undefined,{}]) {
    const done=player.play(sound);
    const call=calls.at(-1);
    assert.equal(call.options.env.CODEX_NOTIFIER_SOUND_FILE,path.win32.join(directory,'chime.wav'));
    call.callback(null,'',''); await done;
  }
});

test('new sounds and disposal cancel playback without false failures', async () => {
  const {player,calls}=fixture();
  const first=player.play('flute.wav');
  const second=player.play('chime.wav');
  assert.equal(calls[0].killed,true);
  calls[0].callback(Error('terminated'),'',''); assert.equal(await first,false);
  player.dispose(); assert.equal(calls[1].killed,true);
  calls[1].callback(Error('terminated'),'',''); assert.equal(await second,false);
  assert.equal(await player.play('flute.wav'),false);
  assert.equal(calls.length,2);
});

test('launch, timeout, and player failures are surfaced', async () => {
  const {player,calls}=fixture();
  for(const [error,stderr] of [[Error('ENOENT'),''],[Error('timeout'),''],[Error('exit 1'),'Invalid WAV header']]) {
    const done=player.play('chime.wav');
    calls.at(-1).callback(error,'',stderr);
    await assert.rejects(done,new RegExp(stderr||error.message));
  }
});

test('all bundled sounds use PCM WAV headers supported by SoundPlayer', () => {
  for(const name of ['chime.wav','positive.wav','software.wav','flute.wav','marimba.wav','scifi.wav']) {
    const bytes=fs.readFileSync(path.join(__dirname,'../sounds',name));
    assert.equal(bytes.toString('ascii',0,4),'RIFF',name);
    assert.equal(bytes.toString('ascii',8,12),'WAVE',name);
    let format;
    for(let offset=12;offset+8<=bytes.length;) {
      const size=bytes.readUInt32LE(offset+4);
      assert(offset+8+size<=bytes.length,name);
      if(bytes.toString('ascii',offset,offset+4)==='fmt ')format=bytes.readUInt16LE(offset+8);
      offset+=8+size+(size%2);
    }
    assert.equal(format,1,name);
  }
});

// Opt-in integration check: plays the actual six packaged sounds through Windows.
test('Windows native audio smoke test: all bundled WAVs', {
  skip: process.platform!=='win32' || process.env.CODEX_NOTIFIER_AUDIO_SMOKE!=='1', timeout:120000
}, async () => {
  const {WindowsAudioPlayer}=require('../windows-audio');
  const player=new WindowsAudioPlayer(path.join(__dirname,'../sounds'));
  try {
    for(const sound of ['chime.wav','positive.wav','software.wav','flute.wav','marimba.wav','scifi.wav']) {
      assert.equal(await player.play(sound),true,sound);
    }
  } finally { player.dispose(); }
});
