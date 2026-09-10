const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
test('webview restores preferences, plays selected WAV only on completion, reports audio failures', async () => {
  const html = fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
  const classes = new Set(), messages = [], audio = [];
  let receiver, rejectAudio = false;
  const node = () => ({addEventListener(){},setAttribute(){},style:{},dataset:{},classList:{add(c){classes.add(c);},remove(c){classes.delete(c);},toggle(c,enabled){if(enabled)classes.add(c);else classes.delete(c);}}});
  const body = node(), label = node();
  const sounds = ['magic','flute','marimba','scifi','positive','software'].map(s => Object.assign(node(),{value:s+'.wav'}));
  const fonts = [Object.assign(node(),{value:'Arial, sans-serif'})];
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  vm.runInNewContext(script, {
    acquireVsCodeApi:()=>({getState:()=>({}),setState(){},postMessage(m){messages.push(m);}}),
    soundBase:'vscode-resource:/sounds/',
    window:{addEventListener(type,fn){receiver=fn;}},
    document:{body,getElementById:id=>id==='status'?label:node(),querySelectorAll:selector=>selector.includes('sound')?sounds:selector.includes('font')?fonts:[]},
    Audio:class {constructor(url){audio.push(url);}pause(){}play(){return rejectAudio?Promise.reject(Error('blocked')):Promise.resolve();}}
  });
  const send = data => receiver({data:{type:'status',preferences:{codexSound:'flute.wav',codexFont:'Arial, sans-serif',codexMode:'light'},...data}});
  send({state:'ready'}); assert.equal(label.textContent,'Ready'); assert.equal(audio.length,0);
  send({state:'working'}); assert.equal(label.textContent,'Working...');
  send({state:'done',completed:true}); assert.equal(label.textContent,'Done');
  assert.equal(audio[0],'vscode-resource:/sounds/flute.wav'); assert(classes.has('done-flash'));
  send({state:'done'}); assert.equal(audio.length,1); assert(classes.has('light-mode'));
  rejectAudio=true; send({state:'done',completed:true}); await Promise.resolve();
  assert(messages.some(m=>m.type==='audioError'));
});
