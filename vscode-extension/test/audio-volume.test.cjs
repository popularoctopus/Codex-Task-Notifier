const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {normalizeVolume, scaleWav, prepareSound} = require('../audio-volume');

test('volume validation preserves mute, clamps bounds, and defaults invalid values to full', () => {
  for (const [value,expected] of [[0,0],[25,25],[25.7,26],[-1,0],[101,100],[undefined,100],[NaN,100],[Infinity,100],['25',100],[null,100]]) {
    assert.equal(normalizeVolume(value),expected);
  }
});

test('every bundled WAV scales PCM samples and preserves all other bytes and the source', () => {
  for (const name of fs.readdirSync(path.join(__dirname,'../sounds'))) {
    const original=fs.readFileSync(path.join(__dirname,'../sounds',name));
    for (const volume of [0,25,100]) {
      const scaled=scaleWav(original,volume);
      const expected=Buffer.from(original);
      let count=0;
      for (let offset=12;offset+8<=expected.length;) {
        const size=expected.readUInt32LE(offset+4);
        if (expected.toString('ascii',offset,offset+4)==='data') {
          for (let i=offset+8;i<offset+8+size;i+=2) {
            expected.writeInt16LE(Math.round(original.readInt16LE(i)*volume/100),i);
            count++;
          }
        }
        offset+=8+size+size%2;
      }
      assert(count>0,name);
      assert(scaled.equals(expected),name);
    }
    assert(original.equals(fs.readFileSync(path.join(__dirname,'../sounds',name))),name);
  }
});

test('temporary audio is attenuated and deleted; full volume uses the bundled original', () => {
  const filename=path.join(__dirname,'../sounds/chime.wav');
  const full=prepareSound(filename,100);
  assert.equal(full.filename,filename);
  full.dispose();
  const quiet=prepareSound(filename,25);
  try {
    assert.notEqual(quiet.filename,filename);
    assert(fs.readFileSync(quiet.filename).equals(scaleWav(fs.readFileSync(filename),25)));
  } finally { quiet.dispose(); }
  assert.equal(fs.existsSync(path.dirname(quiet.filename)),false);
  assert(fs.existsSync(filename));
});

test('invalid and unsupported WAV files fail clearly', () => {
  assert.throws(()=>scaleWav(Buffer.from('invalid'),50),/Invalid WAV/);
  const wav=fs.readFileSync(path.join(__dirname,'../sounds/chime.wav'));
  assert.throws(()=>scaleWav(wav.subarray(0,30),50),/Truncated/);
  for (let offset=12;offset+8<=wav.length;) {
    const size=wav.readUInt32LE(offset+4);
    if (wav.toString('ascii',offset,offset+4)==='fmt ') wav.writeUInt16LE(3,offset+8);
    offset+=8+size+size%2;
  }
  assert.throws(()=>scaleWav(wav,50),/16-bit PCM/);
});
