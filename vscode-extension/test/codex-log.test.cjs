const {test} = require('node:test');
const assert = require('node:assert/strict');
const {CodexLogDetector, CodexLogReader} = require('../codex-log');
const {TaskState} = require('../state');
const base = Date.parse('2026-09-14 12:00:00.000');
const start = (thread='a') => '2026-09-14 12:00:00.000 Reasoning summary turn-start config resolved conversationId='+thread+'\n';
const read = 'method=thread-read-state-changed\n';
const strong = 'requestKind=turn-diff-capture-complete\n';
function harness(options={}) {
  let now=base, serial=0;
  const timers=new Map(), events=[], state=new TaskState();
  const detector=new CodexLogDetector((source,value)=>{events.push(value);state.accept(source,value);}, {
    ...options, now:()=>now, setTimer(fn,delay){const id=++serial;timers.set(id,{fn,at:now+delay});return id;},clearTimer(id){timers.delete(id);}
  });
  const advance=ms=>{now+=ms;for(const [id,timer] of [...timers])if(timer.at<=now){timers.delete(id);timer.fn();}};
  return {detector,events,state,advance,timers,done:()=>events.filter(e=>e.state==='done').length,
    final:(elapsed,thread='a',turnId)=>detector.session(thread,'final',base+elapsed,turnId)};
}
test('input shows Thinking immediately, Working at ten seconds, then Done at final response',()=>{
  const h=harness();h.detector.inspect(start());
  assert.equal(h.state.state,'thinking');h.advance(9999);assert.equal(h.state.state,'thinking');
  h.advance(1);assert.equal(h.state.state,'working');h.final(11000);
  assert.deepEqual(h.events.map(e=>e.state),['thinking','working','done']);
  assert.equal(h.timers.size,0);
});
test('quick finals return Ready without alerting, including when an edit already showed Working',()=>{
  for(const edit of [false,true]) {
    const h=harness();h.detector.inspect(start());
    if(edit)h.detector.edited('a',base+1);
    h.advance(9000);h.final(9000);h.advance(10000);
    assert.equal(h.state.state,'ready');assert.equal(h.done(),0);assert.equal(h.timers.size,0);
    h.detector.edited('a',base+1);h.final(9000);assert.equal(h.state.state,'ready');
  }
});
test('record timestamps enforce the threshold even if polling or timers are delayed',()=>{
  const h=harness();h.detector.inspect(start());h.advance(20000);h.final(9999);
  assert.equal(h.state.state,'ready');assert.equal(h.done(),0);
  const exact=harness();exact.detector.inspect(start());exact.final(10000);
  assert.equal(exact.state.state,'done');assert.equal(exact.done(),1);
});
test('edit starts Working early; stale or unrelated edits never do',()=>{
  const h=harness();h.detector.inspect(start());
  h.detector.edited('a',base-1);h.detector.edited('other',base+1);
  assert.equal(h.state.state,'thinking');h.detector.edited('a',base+1);
  assert.equal(h.state.state,'working');h.final(10000);assert.equal(h.done(),1);
});
test('approval/read-state and diff capture never claim a final or stop the ten-second timer',()=>{
  const h=harness();h.detector.inspect(start()+read+strong);h.advance(3000);
  assert.equal(h.state.state,'thinking');h.advance(7000);
  assert.equal(h.state.state,'working');h.advance(6*60*60*1000);assert.equal(h.done(),0);
  h.final(6*60*60*1000);assert.equal(h.done(),1);
});
test('duplicate final records and reasoning after final do not reopen or repeat alerts',()=>{
  const h=harness();h.detector.inspect(start());
  h.detector.session('a','start',base+1,'one');h.final(10001,'a','one');
  h.final(10001,'a','one');h.detector.session('a','start',base+1,'one');
  h.detector.inspect('Reasoning summary item completed threadId=a turnId=one\n');
  assert.equal(h.state.state,'done');assert.equal(h.done(),1);
});
test('session starts correlate with the log start and new turns reset timing',()=>{
  const h=harness();h.detector.inspect(start());h.detector.session('a','start',base+5,'one');
  assert.equal(h.events.length,1);h.final(15000,'a','one');
  h.detector.session('a','start',base+20000,'two');assert.equal(h.state.state,'thinking');
  h.final(25000,'a','one');assert.equal(h.state.state,'thinking');
  h.final(25000,'a','two');assert.equal(h.state.state,'ready');assert.equal(h.done(),1);
});
test('matching reasoning before transcript discovery does not create a second start',()=>{
  const h=harness();h.detector.inspect(start()+'Reasoning summary item completed threadId=a turnId=one\n');
  h.detector.session('a','start',base+1,'one');assert.equal(h.events.length,1);
  assert.equal(h.detector.turns.get('a').startedAt,base+1);
});
test('historical transcript records and unknown threads cannot start or finish tasks',()=>{
  const h=harness();h.detector.inspect(start());
  h.detector.session('a','start',base-1000,'old');h.final(-1);
  h.detector.session('unknown','start',base+1,'other');h.final(10000,'unknown');
  assert.equal(h.events.length,1);assert.equal(h.state.state,'thinking');
});
test('a delayed transcript start cannot resurrect a disrupted turn',()=>{
  const h=harness();h.detector.inspect(start());h.advance(12000);
  h.detector.cancel(h.detector.turns.get('a'));
  h.detector.session('a','start',base+1,'one');h.final(15000,'a','one');
  assert.equal(h.state.state,'ready');assert.equal(h.done(),0);
  h.detector.session('a','start',base+20000,'two');assert.equal(h.state.state,'thinking');
});
test('interruptions, supersession, reset and disposal cancel Thinking and Working without Done',()=>{
  for(const elapsed of [0,10000]) for(const action of ['interrupt','reset','dispose','supersede']) {
    const h=harness();h.detector.inspect(start());h.advance(elapsed);
    if(action==='interrupt')h.detector.session('a','interrupted',base+elapsed);
    if(action==='reset')h.detector.reset();
    if(action==='dispose')h.detector.dispose();
    if(action==='supersede') {h.detector.start('a',base+elapsed);h.detector.reset();}
    h.advance(20000);h.final(30000);assert.equal(h.state.state,'ready');assert.equal(h.done(),0);
  }
});
test('host exit and failed turn request return Ready; retryable streams and other request failures do not',()=>{
  for(const line of ['[CodexMcpConnection] Codex app-server process exited unexpectedly (code=1)',
    '[CodexMcpConnection] Codex process fatal error',
    'Request failed conversationId=a method=turn/start']) {
    const h=harness();h.detector.inspect(start()+line+'\n');h.advance(20000);
    assert.equal(h.state.state,'ready');assert.equal(h.done(),0);
  }
  const h=harness();h.detector.inspect(start()+'[CodexMcpConnection] cli: stream disconnected - retrying sampling request\nRequest failed conversationId=a method=fs/readDirectory\n');
  assert.equal(h.state.state,'thinking');
});
test('concurrent tasks preserve active status and reject mismatched turn IDs',()=>{
  const h=harness();h.detector.inspect(start('a')+start('b'));
  h.detector.session('a','start',base+1,'one');h.detector.session('b','start',base+1,'two');
  h.detector.edited('a',base+2,'wrong');assert.equal(h.state.state,'thinking');
  h.detector.edited('a',base+2,'one');assert.equal(h.state.state,'working');
  h.final(20000,'a','one');assert.equal(h.state.state,'thinking');
  h.detector.session('b','interrupted',base+20000,'two');assert.equal(h.state.state,'ready');
  assert.equal(h.done(),1);
});
test('partial records are retained until the terminating newline; arbitrary text does not start work',()=>{
  const h=harness();h.detector.inspect(read+strong+'Task completed!\n');assert.equal(h.events.length,0);
  for(const char of start())h.detector.inspect(char);
  assert.equal(h.state.state,'thinking');h.final(20000);assert.equal(h.done(),1);
});
function fakeFile(initial='') {
  let content=Buffer.from(initial), exists=true, ino=1, closed=0;
  const positions=[];
  const fs={async open(){
    if(!exists)throw Object.assign(Error('missing'),{code:'ENOENT'});
    return {async stat(){return {size:content.length,dev:1,ino,birthtimeMs:ino};},
      async read(buffer,offset,length,position){positions.push(position);const bytesRead=content.copy(buffer,offset,position,position+length);return {bytesRead};},
      async close(){closed++;}};
  }};
  return {fs,positions,append(value){content=Buffer.concat([content,Buffer.from(value)]);},replace(value){ino++;content=Buffer.from(value);},truncate(){content=Buffer.alloc(0);},missing(){exists=false;},create(value){exists=true;ino++;content=Buffer.from(value);},closed:()=>closed};
}
test('reader skips history, tails appended bytes and handles split UTF-8',async()=>{
  const chunks=[], file=fakeFile('old\n');
  const reader=new CodexLogReader('log',{inspect:x=>chunks.push(x),reset(){}},{fs:file.fs});
  await reader.poll();assert.equal(chunks.length,0);
  const bytes=Buffer.from('new café\n');file.append(bytes.subarray(0,8));await reader.poll();
  file.append(bytes.subarray(8));await reader.poll();
  assert.equal(chunks.join(''),'new café\n');assert.equal(file.positions[0],4);assert.equal(file.closed(),3);
});
test('missing log created later is read; truncation and replacement reset pending turns',async()=>{
  const h=harness(),file=fakeFile();file.missing();
  const reader=new CodexLogReader('log',h.detector,{fs:file.fs});await reader.poll();
  file.create(start()+read);await reader.poll();assert.equal(h.state.state,'thinking');
  file.truncate();await reader.poll();h.advance(10000);assert.equal(h.done(),0);assert.equal(h.state.state,'ready');
  file.append(start()+read);await reader.poll();
  file.replace(start()+read+strong);await reader.poll();h.final(10000);assert.equal(h.done(),1);
});
test('large append is consumed over bounded polls without losing final completion',async()=>{
  const h=harness(),file=fakeFile();const reader=new CodexLogReader('log',h.detector,{fs:file.fs});
  await reader.poll();file.append('ignored\n'.repeat(160000)+start()+read+strong);
  await reader.poll();assert.equal(h.done(),0);await reader.poll();
  assert.equal(h.state.state,'thinking');h.final(10000);assert.equal(h.done(),1);
});

test('a disappearing log cancels active work and its timer without reporting completion',async()=>{
  const h=harness(),file=fakeFile();const reader=new CodexLogReader('log',h.detector,{fs:file.fs});
  await reader.poll();file.append(start());await reader.poll();assert.equal(h.state.state,'thinking');
  file.missing();await reader.poll();h.advance(20000);
  assert.equal(h.state.state,'ready');assert.equal(h.done(),0);assert.equal(h.timers.size,0);
});
