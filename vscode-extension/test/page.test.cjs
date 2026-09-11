const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
function page(nativeAudio = false) {
  const html = fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
  const classes = new Set(), messages = [], players = [], plays = [];
  let receiver, gesture = false, failure;
  const node = () => ({events:{},attributes:{},addEventListener(type,fn){this.events[type]=fn;},setAttribute(name,value){this.attributes[name]=value;},contains(target){for(let current=target;current;current=current.parent){if(current===this)return true;}return false;},style:{},dataset:{},classList:{add(c){classes.add(c);},remove(c){classes.delete(c);},toggle(c,enabled){if(enabled)classes.add(c);else classes.delete(c);}}});
  const body = node(), label = node();
  const menu = Object.assign(node(),{hidden:true}), menuButton = node();
  const enableSounds = Object.assign(node(),{hidden:true,parent:menu});
  const sounds = ['magic','flute','marimba','scifi','positive','software'].map(s => Object.assign(node(),{value:s+'.wav'}));
  const previews = sounds.map(s => Object.assign(node(),{dataset:{sound:s.value}}));
  const fonts = [Object.assign(node(),{value:'Arial, sans-serif'})];
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  vm.runInNewContext(script, {
    nativeAudio,
    acquireVsCodeApi:()=>({getState:()=>({}),setState(){},postMessage(m){messages.push(m);}}),
    soundBase:'vscode-resource:/sounds/',
    window:{addEventListener(type,fn){receiver=fn;}},
    document:{body,getElementById:id=>id==='status'?label:id==='menu'?menu:id==='menu-button'?menuButton:id==='enable-sounds'?enableSounds:node(),querySelectorAll:selector=>selector==='.preview'?previews:selector.includes('sound')?sounds:selector.includes('font')?fonts:[]},
    Audio:class {
      constructor(url){this.src=url||'';this.currentTime=0;this.unlocked=false;players.push(this);}
      pause(){}
      play(){
        if(gesture)this.unlocked=true;
        if(failure)return Promise.reject(failure);
        // VS Code's user-gesture-required policy locks each media element separately.
        if(!this.unlocked)return Promise.reject(Object.assign(Error('play() requires a user gesture'),{name:'NotAllowedError'}));
        plays.push({src:this.src,currentTime:this.currentTime});
        return Promise.resolve();
      }
    }
  });
  return {
    classes,messages,players,plays,label,body,menu,menuButton,enableSounds,
    click(target){gesture=true;try{const event={target};target.events?.click?.(event);body.events.click(event);}finally{gesture=false;}},
    send(data){receiver({data:{type:'status',preferences:{codexSound:'flute.wav',codexFont:'Arial, sans-serif',codexMode:'light'},...data}});},
    preview(name){gesture=true;try{previews.find(p=>p.dataset.sound===name).events.click();}finally{gesture=false;}},
    fail(error){failure=error;}
  };
}

test('settings stays open for inside clicks and closes for outside clicks with correct expanded state', () => {
  const p = page(true);
  p.click(p.menuButton);
  assert.equal(p.menu.hidden,false);
  assert.equal(p.menuButton.attributes['aria-expanded'],'true');
  p.click(p.menu);
  p.click({parent:p.menu});
  p.click({parent:p.menuButton});
  assert.equal(p.menu.hidden,false);
  p.click(p.label);
  assert.equal(p.menu.hidden,true);
  assert.equal(p.menuButton.attributes['aria-expanded'],'false');
  p.click(p.menuButton);
  p.click(p.menuButton);
  assert.equal(p.menu.hidden,true);
  p.send({state:'done',completed:true});
  p.click(p.menuButton);
  p.click(p.label);
  assert.equal(p.menu.hidden,true);
  assert.equal(p.messages.at(-1).type,'reset');
});

test('Done status shows reset tooltip and any page click requests Ready', () => {
  const p = page(true);
  p.send({state:'working'});
  p.send({state:'done',completed:true});
  assert.equal(p.body.title,'Click to reset.');
  assert(p.classes.has('done'));
  p.body.events.click({});
  assert.equal(p.messages.at(-1).type,'reset');
  p.send({state:'ready'});
  assert.equal(p.body.title,'');
  assert(!p.classes.has('done'));
  p.body.events.click({});
  assert.equal(p.messages.filter(m=>m.type==='reset').length,1);
});

test('Play unlocks the same player for later completion sounds and sound changes', async () => {
  const p = page();
  p.send({state:'ready'}); assert.equal(p.label.textContent,'Ready'); assert.equal(p.plays.length,0);
  p.preview('flute.wav');
  p.players[0].currentTime = 3;
  p.send({state:'working'}); assert.equal(p.label.textContent,'Working...');
  p.send({state:'done',completed:true}); assert.equal(p.label.textContent,'Done');
  await Promise.resolve();
  assert.equal(p.players.length,1);
  assert.equal(p.plays.length,2);
  assert.deepEqual(p.plays[1],{src:'vscode-resource:/sounds/flute.wav',currentTime:0});
  assert(p.classes.has('done-flash')); assert(p.classes.has('light-mode'));
  p.send({state:'done'}); assert.equal(p.plays.length,2);
  p.send({state:'working'});
  p.send({state:'done',completed:true,preferences:{codexSound:'magic.wav'}});
  await Promise.resolve();
  assert.equal(p.plays.at(-1).src,'vscode-resource:/sounds/magic.wav');
  assert.equal(p.players.length,1);
  assert(!p.messages.some(m=>m.type==='audioError'));
});

test('Windows previews request native playback and completion never plays duplicate webview audio', () => {
  const p = page(true);
  assert.equal(p.enableSounds.hidden,true);
  assert.equal(p.enableSounds.events.click,undefined);
  p.send({state:'working'});
  p.send({state:'done',completed:true});
  assert.equal(p.label.textContent,'Done');
  assert(p.classes.has('done-flash'));
  assert.equal(p.players.length,0);
  assert(!p.messages.some(m=>m.type==='playSound'));
  p.preview('magic.wav');
  assert.equal(p.messages.at(-1).type,'playSound');
  assert.equal(p.messages.at(-1).sound,'magic.wav');
  assert.equal(p.players.length,0);
});

test('Enable sounds unlocks the selected sound for later completions in the same board', async () => {
  const p = page();
  assert.equal(p.enableSounds.hidden,false);
  p.send({state:'working',preferences:{codexSound:'magic.wav'}});
  p.click(p.menuButton);
  p.click(p.enableSounds);
  assert.equal(p.menu.hidden,false);
  assert.equal(p.plays[0].src,'vscode-resource:/sounds/magic.wav');
  p.send({state:'done',completed:true});
  await Promise.resolve();
  assert.equal(p.players.length,1);
  assert.equal(p.plays.length,2);
  assert.equal(p.plays[1].src,'vscode-resource:/sounds/flute.wav');
  assert(!p.messages.some(m=>m.type==='audioError'));
  const reopened = page();
  assert.equal(reopened.enableSounds.hidden,false);
  assert.equal(reopened.players[0].unlocked,false);
});

test('Enable sounds reports playback failure and allows another attempt', async () => {
  const p = page();
  p.fail(Object.assign(Error('Unsupported audio'),{name:'NotSupportedError'}));
  p.click(p.enableSounds);
  await Promise.resolve();
  assert.equal(p.messages.at(-1).name,'NotSupportedError');
  assert.equal(p.messages.at(-1).sound,'positive.wav');
  p.fail(undefined);
  p.click(p.enableSounds);
  await Promise.resolve();
  assert.equal(p.plays.length,1);
});

test('blocked completion reports the actual error and recovers after Play', async () => {
  const p = page();
  p.send({state:'done',completed:true});
  await Promise.resolve();
  const error = p.messages.find(m=>m.type==='audioError');
  assert.equal(error.name,'NotAllowedError');
  assert.equal(error.sound,'flute.wav');
  assert.match(error.message,/user gesture/);
  p.preview('flute.wav');
  p.send({state:'working'});
  p.send({state:'done',completed:true});
  await Promise.resolve();
  assert.equal(p.plays.length,2);
  assert.equal(p.messages.filter(m=>m.type==='audioError').length,1);
});

test('format failures retain diagnostics; interrupted and superseded plays do not warn', async () => {
  const p = page();
  p.fail(Object.assign(Error('Unsupported audio'),{name:'NotSupportedError'}));
  p.preview('magic.wav');
  await Promise.resolve();
  assert.equal(p.messages.at(-1).name,'NotSupportedError');
  assert.equal(p.messages.at(-1).sound,'magic.wav');
  const count = p.messages.length;
  p.fail(Object.assign(Error('New playback interrupted the old one'),{name:'AbortError'}));
  p.preview('flute.wav');
  await Promise.resolve();
  assert.equal(p.messages.length,count);
  p.fail(Error('Old failure'));
  p.preview('magic.wav');
  p.fail(undefined);
  p.preview('flute.wav');
  await Promise.resolve();
  assert.equal(p.messages.length,count);
});
