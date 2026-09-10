const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
test('extension runs without HTTP, reuses board, handles invalid status, and disposes polling', async () => {
  const commands={}, sent=[], notices=[], files=new Map(); let next, receive, created=0;
  const root = path.join(__dirname,'..');
  const uri = value => ({toString:()=>value});
  const statusPath='workspace/.codex-task-status.json';
  files.set(statusPath,JSON.stringify({state:'done',updatedAt:'old'}));
  const window={state:{focused:true},createOutputChannel:()=>({appendLine(){},dispose(){}}),
    onDidChangeWindowState:()=>({dispose(){}}),
    showInformationMessage:async message=>{notices.push(message);},
    createWebviewPanel(){created++; return {viewColumn:1,reveal(){},onDidDispose(){},dispose(){},webview:{cspSource:'vscode-resource:',asWebviewUri:u=>u,onDidReceiveMessage:fn=>{receive=fn;},postMessage:message=>{sent.push(message);},set html(value){assert(value.includes('Content-Security-Policy'));assert(value.includes('nonce='));}}};}
  };
  const workspace={workspaceFolders:[{uri:uri('workspace')}],getConfiguration:()=>({get:key=>key==='legacyStatusFile'?'':true}),fs:{
    async stat(u){return {size:(files.get(u.toString())||'').length};},
    async readFile(u){if(u.toString()==='extension/index.html')return Buffer.from(fs.readFileSync(path.join(root,'index.html')));return Buffer.from(files.get(u.toString()));}
  }};
  const sandbox={Buffer,module:{exports:{}},setTimeout:fn=>{next=fn;return 1;},clearTimeout(){},require:name=>{
    if(name==='vscode')return {window,workspace,Uri:{joinPath:(base,name)=>uri(base+'/'+name),file:uri},ViewColumn:{Active:-1},commands:{registerCommand:(name,fn)=>{commands[name]=fn;return {dispose(){}};}}};
    if(name==='crypto')return require('crypto');
    if(name==='./state')return require('../state');
    throw Error('Unexpected runtime dependency: '+name);
  }};
  vm.runInNewContext(fs.readFileSync(path.join(root,'extension.js'),'utf8'),sandbox);
  const context={extensionUri:uri('extension'),subscriptions:[],globalState:{get:()=>({}),update:async()=>{}}};
  sandbox.module.exports.activate(context);
  const flush=()=>new Promise(resolve=>setImmediate(resolve));
  await flush(); assert.equal(created,0);
  files.set(statusPath,JSON.stringify({state:'working',updatedAt:'1'})); await next();
  assert.equal(created,1); receive({type:'ready'}); assert.equal(sent.at(-1).state,'working');
  files.set(statusPath,'{'); await next(); assert.equal(notices.length,0);
  files.set(statusPath,JSON.stringify({state:'done',updatedAt:'2'})); await next();
  assert.equal(sent.at(-1).completed,true); assert.equal(notices.length,1);
  await next(); assert.equal(notices.length,1);
  await commands['codexStatus.open'](); assert.equal(created,1);
  for(const disposable of context.subscriptions)disposable.dispose();
});
