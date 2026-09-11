const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
for (const platform of ['darwin','linux','win32']) test(`${platform}: completion, previews, closed board, errors, and disposal`, async () => {
  const commands={}, sent=[], notices=[], warnings=[], logs=[], files=new Map(); let next, receive, created=0, autoOpen=true;
  const root = path.join(__dirname,'..');
  const played=[]; let nativeDisposed=false, closePanel, nativeFailure;
  const uri = value => ({toString:()=>value,fsPath:value});
  const statusPath='workspace/.codex-task-status.json';
  files.set(statusPath,JSON.stringify({state:'done',updatedAt:'old'}));
  const window={state:{focused:true},createOutputChannel:()=>({appendLine(line){logs.push(line);},dispose(){}}),
    onDidChangeWindowState:()=>({dispose(){}}),
    showInformationMessage:async message=>{notices.push(message);},
    showWarningMessage:async message=>{warnings.push(message);},
    createWebviewPanel(){created++; return {viewColumn:1,reveal(){},onDidDispose(fn){closePanel=fn;},dispose(){},webview:{cspSource:'vscode-resource:',asWebviewUri:u=>u,onDidReceiveMessage:fn=>{receive=fn;},postMessage:message=>{sent.push(message);},set html(value){assert(value.includes('Content-Security-Policy'));assert(value.includes('nonce='));assert(value.includes(`const nativeAudio = ${platform==='win32'};`));}}};}
  };
  const workspace={workspaceFolders:[{uri:uri('workspace')}],getConfiguration:()=>({get:key=>key==='legacyStatusFile'?'':key==='autoOpen'?autoOpen:true}),fs:{
    async stat(u){return {size:(files.get(u.toString())||'').length};},
    async readFile(u){if(u.toString()==='extension/index.html')return Buffer.from(fs.readFileSync(path.join(root,'index.html')));return Buffer.from(files.get(u.toString()));}
  }};
  const sandbox={Buffer,process:{platform},module:{exports:{}},setTimeout:fn=>{next=fn;return 1;},clearTimeout(){},require:name=>{
    if(name==='vscode')return {window,workspace,Uri:{joinPath:(base,name)=>uri(base+'/'+name),file:uri},ViewColumn:{Active:-1},commands:{registerCommand:(name,fn)=>{commands[name]=fn;return {dispose(){}};}}};
    if(name==='crypto')return require('crypto');
    if(name==='./state')return require('../state');
    if(name==='./windows-audio')return {WindowsAudioPlayer:class {
      constructor(directory){assert.equal(platform,'win32');assert.equal(directory,'extension/sounds');}
      play(sound){played.push(sound);return nativeFailure?Promise.reject(nativeFailure):Promise.resolve(true);}
      dispose(){nativeDisposed=true;}
    }};
    throw Error('Unexpected runtime dependency: '+name);
  }};
  vm.runInNewContext(fs.readFileSync(path.join(root,'extension.js'),'utf8'),sandbox);
  const context={extensionUri:uri('extension'),subscriptions:[],globalState:{get:()=>({codexSound:'flute.wav'}),update:async()=>{}}};
  sandbox.module.exports.activate(context);
  const flush=()=>new Promise(resolve=>setImmediate(resolve));
  await flush(); assert.equal(created,0); assert.equal(played.length,0);
  window.state.focused=false;
  files.set(statusPath,JSON.stringify({state:'working',updatedAt:'1'})); await next();
  assert.equal(created,1); receive({type:'ready'}); assert.equal(sent.at(-1).state,'working');
  files.set(statusPath,'{'); await next(); assert.equal(notices.length,0);
  files.set(statusPath,JSON.stringify({state:'done',updatedAt:'2'})); await next();
  assert.equal(sent.at(-1).completed,true); assert.equal(notices.length,1);
  assert.deepEqual(played,platform==='win32'?['flute.wav']:[]);
  receive({type:'reset'});
  assert.equal(sent.at(-1).state,'ready');
  await next(); assert.equal(notices.length,1);
  assert.equal(played.length,platform==='win32'?1:0);
  await commands['codexStatus.open'](); assert.equal(created,1);
  receive({type:'audioError',name:'NotAllowedError',message:'Gesture required',sound:'flute.wav'});
  assert.match(warnings.at(-1),/click Enable sounds/);
  assert.match(logs.at(-1),/flute.wav: NotAllowedError: Gesture required/);
  receive({type:'audioError',name:'NotSupportedError',message:'Unsupported format',sound:'magic.wav'});
  assert.match(warnings.at(-1),/Output channel/);
  assert.match(logs.at(-1),/NotSupportedError: Unsupported format/);
  receive({type:'playSound',sound:'magic.wav'});
  if(platform==='win32')assert.equal(played.at(-1),'magic.wav');
  else assert.equal(played.length,0);
  receive({type:'preferences',values:{codexSound:'marimba.wav'}});
  closePanel(); window.state.focused=false; autoOpen=false;
  const sentBefore = sent.length;
  files.set(statusPath,JSON.stringify({state:'working',updatedAt:'3'})); await next();
  files.set(statusPath,JSON.stringify({state:'done',updatedAt:'4'})); await next();
  assert.equal(sent.length,sentBefore); assert.equal(created,1);
  assert.equal(notices.length,2);
  if(platform==='win32')assert.deepEqual(played,['flute.wav','magic.wav','marimba.wav']);
  else assert.equal(played.length,0);
  if(platform==='win32') {
    nativeFailure=Error('PowerShell unavailable');
    files.set(statusPath,JSON.stringify({state:'working',updatedAt:'5'})); await next();
    files.set(statusPath,JSON.stringify({state:'done',updatedAt:'6'})); await next();
    await flush();
    assert.match(warnings.at(-1),/Windows sound/);
    assert.match(logs.at(-1),/PowerShell unavailable/);
  }
  for(const disposable of context.subscriptions)disposable.dispose();
  assert.equal(nativeDisposed,platform==='win32');
});
