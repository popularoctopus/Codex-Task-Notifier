const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
for (const platform of ['darwin','linux','win32']) test(`${platform}: completion, previews, closed board, errors, and disposal`, async () => {
  const commands={}, sent=[], notices=[], warnings=[], logs=[]; let next, emitLog, receive, created=0, autoOpen=true;
  const root = path.join(__dirname,'..');
  let renderedHtml;
  const played=[]; let nativeDisposed=false, closePanel, nativeFailure;
  const uri = value => ({toString:()=>value,fsPath:value});
  const signal = async (state, updatedAt) => { emitLog('test-thread', {state, updatedAt}); await new Promise(resolve => setImmediate(resolve)); };
  const window={state:{focused:true},createOutputChannel:()=>({appendLine(line){logs.push(line);},dispose(){}}),
    onDidChangeWindowState:()=>({dispose(){}}),
    showInformationMessage:async message=>{notices.push(message);},
    showWarningMessage:async message=>{warnings.push(message);},
    createWebviewPanel(){created++; return {viewColumn:1,reveal(){},onDidDispose(fn){closePanel=fn;},dispose(){},webview:{cspSource:'vscode-resource:',asWebviewUri:u=>uri('vscode-resource:/'+u),onDidReceiveMessage:fn=>{receive=fn;},postMessage:message=>{sent.push(message);},set html(value){renderedHtml=value;assert(value.includes('Content-Security-Policy'));assert(value.includes('nonce='));assert(value.includes('const nativeAudio = true;'));}}};}
  };
  const workspace={workspaceFolders:[{uri:uri('workspace')}],getConfiguration:()=>({get:key=>key==='codexLogPath'?'':key==='detectionMode'?'automatic':key==='autoOpen'?autoOpen:true}),fs:{
    async readFile(u){assert.equal(u.toString(),'extension/index.html');return fs.readFileSync(path.join(root,'index.html'));}
  }};
  const sandbox={Buffer,process:{platform,env:{}},module:{exports:{}},setTimeout:fn=>{next=fn;return 1;},clearTimeout(){},require:name=>{
    if(name==='vscode')return {window,workspace,Uri:{joinPath:(base,name)=>uri(base+'/'+name),file:uri},ViewColumn:{Active:-1},commands:{registerCommand:(name,fn)=>{commands[name]=fn;return {dispose(){}};}}};
    if(name==='node:path')return path.posix;
    if(name==='node:os')return {homedir:()=>'/test-home'};
    if(name==='./codex-edits')return {CodexEditMonitor:class {async poll(){}}};
    if(name==='./codex-log')return {CodexLogDetector:class {constructor(emit){emitLog=emit;}dispose(){}},CodexLogReader:class {constructor(filename){assert.equal(filename,'logs/openai.chatgpt/Codex.log');}async poll(){}}};
    if(name==='crypto')return require('crypto');
    if(name==='./state')return require('../state');
    if(name==='./native-audio') {
      // Use the real platform factory, replacing only the OS player implementations.
      const audioSandbox={module:{exports:{}},process:{platform},require(name){
        if(name==='node:path')return path.posix;
        if(name==='./windows-audio')return {WindowsAudioPlayer:class {
          constructor(directory){assert.equal(directory,'extension/sounds');}
          play(sound){played.push(sound);return nativeFailure?Promise.reject(nativeFailure):Promise.resolve(true);}
          dispose(){nativeDisposed=true;}
        }};
        if(name==='node:child_process')return {execFile(command,args,options,callback){
          assert.equal(command,platform==='darwin'?'/usr/bin/afplay':'pw-play');
          played.push(path.posix.basename(args[0]));
          callback(null,'',''); return {kill(){}};
        }};
        throw Error(name);
      }};
      vm.runInNewContext(fs.readFileSync(path.join(root,'native-audio.js'),'utf8'),audioSandbox);
      return {createAudioPlayer(directory){
        const player=audioSandbox.module.exports.createAudioPlayer(directory);
        if(platform!=='win32') {
          const play=player.play.bind(player), dispose=player.dispose.bind(player);
          player.play=sound=>nativeFailure?Promise.reject(nativeFailure):play(sound);
          player.dispose=()=>{nativeDisposed=true;dispose();};
        }
        return player;
      }};
    }
    throw Error('Unexpected runtime dependency: '+name);
  }};
  vm.runInNewContext(fs.readFileSync(path.join(root,'extension.js'),'utf8'),sandbox);
  const context={logUri:uri('logs/notifier'),extensionUri:uri('extension'),subscriptions:[],globalState:{get:()=>({codexSound:'flute.wav'}),update:async()=>{}}};
  sandbox.module.exports.activate(context);
  const flush=()=>new Promise(resolve=>setImmediate(resolve));
  await flush(); assert.equal(created,0); assert.equal(played.length,0);
  assert.equal(commands['codexStatus.instructions'],undefined);
  window.state.focused=false;
  await signal('working', '1');
  assert.equal(created,1); receive({type:'ready'}); assert.equal(sent.at(-1).state,'working');
  assert.match(renderedHtml, /src: url\("vscode-resource:\/extension\/fonts\/ManufacturingConsent-Regular.ttf"\)/);
  assert.match(renderedHtml, /font-src vscode-resource:/);
  assert(!renderedHtml.includes('./fonts/'));
  await next(); assert.equal(notices.length,0);
  await signal('done', '2');
  assert.equal(sent.at(-1).completed,true); assert.equal(notices.length,1);
  assert.deepEqual(played,['flute.wav']);
  receive({type:'reset'});
  assert.equal(sent.at(-1).state,'ready');
  await next(); assert.equal(notices.length,1);
  assert.equal(played.length,1);
  await commands['codexStatus.open'](); assert.equal(created,1);
  receive({type:'audioError',name:'NotAllowedError',message:'Gesture required',sound:'flute.wav'});
  assert.match(warnings.at(-1),/click Enable sounds/);
  assert.match(logs.at(-1),/flute.wav: NotAllowedError: Gesture required/);
  receive({type:'audioError',name:'NotSupportedError',message:'Unsupported format',sound:'chime.wav'});
  assert.match(warnings.at(-1),/Output channel/);
  assert.match(logs.at(-1),/NotSupportedError: Unsupported format/);
  receive({type:'playSound',sound:'chime.wav'});
  assert.equal(played.at(-1),'chime.wav');
  receive({type:'preferences',values:{codexSound:'marimba.wav'}});
  closePanel(); window.state.focused=false; autoOpen=false;
  const sentBefore = sent.length;
  await signal('working', '3');
  await signal('done', '4');
  assert.equal(sent.length,sentBefore); assert.equal(created,1);
  assert.equal(notices.length,2);
  assert.deepEqual(played,['flute.wav','chime.wav','marimba.wav']);
  receive({type:'preferences',values:{codexSound:'none'}});
  await signal('working', 'muted-start');
  await signal('done', 'muted-done');
  assert.deepEqual(played,['flute.wav','chime.wav','marimba.wav']);
  await commands['codexStatus.open']();
  receive({type:'ready'});
  assert.equal(sent.at(-1).preferences.codexSound,'none');
  assert.equal(sent.at(-1).state,'done');
  receive({type:'preferences',values:{codexSound:'marimba.wav'}});
  {
    nativeFailure=Error('Native player unavailable');
    await signal('working', '5');
    await signal('done', '6');
    await flush();
    assert.match(warnings.at(-1),/notification sound/);
    assert.match(logs.at(-1),/Native player unavailable/);
  }
  for(const disposable of context.subscriptions)disposable.dispose();
  assert.equal(nativeDisposed,true);
});
