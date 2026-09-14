const {test} = require('node:test');
const assert = require('node:assert/strict');
const {CodexLogDetector, CodexLogReader} = require('../codex-log');
const {TaskState} = require('../state');
const start = (thread='a') => `Reasoning summary turn-start config resolved conversationId=${thread}\n`;
const activity = (thread='a', turn='1') => `Reasoning summary item completed threadId=${thread} turnId=${turn}\n`;
const read = 'method=thread-read-state-changed\n';
const strong = 'requestKind=turn-diff-capture-complete\n';
function harness(options={}) {
  let now=0, serial=0;
  const timers=new Map(), events=[], state=new TaskState();
  const detector=new CodexLogDetector((source,value)=>{events.push(value);state.accept(source,value);}, {
    ...options, now:()=>now, setTimer(fn,delay){const id=++serial;timers.set(id,{fn,at:now+delay});return id;},clearTimer(id){timers.delete(id);}
  });
  const advance=ms=>{now+=ms;for(const [id,timer] of [...timers])if(timer.at<=now){timers.delete(id);timer.fn();}};
  return {detector,events,state,advance,timers,done:()=>events.filter(e=>e.state==='done').length};
}
test('quick chats never emit Working or Done; settling delay does not cross the activity threshold',()=>{
  const h=harness({minimumMs:10000});h.detector.inspect(start());h.advance(9000);
  h.detector.inspect(read);h.advance(3000);
  assert.equal(h.events.length,0);assert.equal(h.state.state,'ready');
  h.detector.inspect(start()+read+strong);h.advance(10000);assert.equal(h.events.length,0);
});
test('long activity qualifies at threshold and resumes immediately after an approval pause',()=>{
  const h=harness({minimumMs:10000});h.detector.inspect(start());h.advance(9999);
  assert.equal(h.events.length,0);h.advance(1);assert.equal(h.state.state,'working');
  h.detector.inspect(read);h.advance(3000);assert.equal(h.done(),1);
  h.detector.inspect(activity());assert.equal(h.state.state,'working');
  h.detector.inspect(read+strong);assert.equal(h.done(),2);
});
test('a new short turn does not inherit qualification from the previous long turn',()=>{
  const h=harness({minimumMs:10000});h.detector.inspect(start());h.advance(10000);
  h.detector.inspect(read+strong);h.detector.inspect(start()+read);h.advance(3000);
  assert.deepEqual(h.events.map(e=>e.state),['working','done']);
});
test('read-state is not a permanent block on qualifying continued reasoning',()=>{
  const h=harness({minimumMs:10000});h.detector.inspect(start());h.advance(5000);
  h.detector.inspect(read);h.advance(1000);h.detector.inspect(activity());h.advance(4000);
  assert.equal(h.state.state,'working');
});
test('matching edits qualify short turns while historical edits do not',()=>{
  const h=harness({minimumMs:10000});
  const stamp='2026-09-14 12:00:00.000';
  const time=Date.parse(stamp);
  h.detector.inspect(stamp+' '+start());h.detector.edited('a',time-1);
  assert.equal(h.events.length,0);h.detector.edited('other',time+1);assert.equal(h.events.length,0);
  h.detector.edited('a',time+1);assert.equal(h.state.state,'working');
  h.detector.inspect(read+strong);assert.equal(h.done(),1);
  h.detector.edited('a',time+1);assert.equal(h.done(),1);
});
test('a short edit found just after completion still alerts exactly once',()=>{
  const h=harness({minimumMs:10000});const stamp='2026-09-14 12:00:00.000';
  h.detector.inspect(stamp+' '+start()+read+strong);assert.equal(h.events.length,0);
  h.detector.edited('a',Date.parse(stamp)+1);h.detector.edited('a',Date.parse(stamp)+1);
  assert.deepEqual(h.events.map(e=>e.state),['working','done']);
});
test('reset, supersession and disposal cancel delayed Working',()=>{
  const h=harness({minimumMs:10000});h.detector.inspect(start());h.advance(5000);
  h.detector.inspect(start());h.advance(5000);assert.equal(h.events.length,0);
  h.detector.reset();h.advance(10000);assert.equal(h.events.length,0);
  h.detector.inspect(start());h.detector.dispose();h.advance(10000);assert.equal(h.events.length,0);
});
test('approval-pause sequence reopens on reasoning and alerts again on final completion',()=>{
  const h=harness();
  h.detector.inspect(start()+activity()+read);
  h.advance(2385);
  h.detector.inspect('Sending server response id=1 method=item/commandExecution/requestApproval response={"decision":"accept"}\n');
  h.advance(615);
  assert.equal(h.state.state,'done');assert.equal(h.done(),1);
  h.advance(2320);
  h.detector.inspect(activity());
  assert.equal(h.state.state,'working');
  // A late duplicate diff without a new read hint cannot finish resumed work.
  h.detector.inspect(strong);assert.equal(h.done(),1);
  h.detector.inspect(read+strong+strong);h.advance(3000);
  assert.equal(h.state.state,'done');assert.equal(h.done(),2);
  assert.deepEqual(h.events.map(e=>e.state),['working','done','working','done']);
  assert.equal(new Set(h.events.map(e=>e.updatedAt)).size,4);
});
test('repeated reasoning records and old turn activity do not reopen Done',()=>{
  const h=harness();
  const first=activity().trimEnd()+' itemId=reason-1\n';
  const second=activity().trimEnd()+' itemId=reason-2\n';
  h.detector.inspect(start()+first+read+strong);
  h.detector.inspect(first+activity('a','old')+activity('other','1'));
  assert.equal(h.state.state,'done');assert.equal(h.events.length,2);
  h.detector.inspect(second+second);assert.equal(h.events.length,3);
  h.detector.inspect(read);h.advance(3000);
  assert.equal(h.done(),2);
  h.detector.inspect(second);assert.equal(h.state.state,'done');
});
test('multiple pauses in a long turn can each notify and resume',()=>{
  const h=harness();h.detector.inspect(start());
  for(let i=0;i<3;i++) {
    h.detector.inspect(activity());assert.equal(h.state.state,'working');
    h.advance(3600000);h.detector.inspect(read);h.advance(3000);
    assert.equal(h.done(),i+1);
  }
});
test('six-hour turn completes once, with no age cutoff',()=>{
  const h=harness(); h.detector.inspect(start()+activity());
  h.advance(6*60*60*1000); assert.equal(h.done(),0);
  h.detector.inspect(read+strong+strong); h.advance(3000);
  assert.equal(h.done(),1);assert.equal(h.state.state,'done');
});
test('two completions in the same read batch are both delivered',()=>{
  const h=harness();
  h.detector.inspect(start()+activity()+read+strong+start()+activity('a','2')+read+strong);
  assert.equal(h.done(),2);h.advance(3000);assert.equal(h.done(),2);
});
test('next turn preserves a pending chat completion before quiet timer fires',()=>{
  const h=harness();h.detector.inspect(start()+read+start()+read);
  assert.equal(h.done(),1);h.advance(3000);assert.equal(h.done(),2);
});
test('late duplicate diff marker cannot finish the next turn without its own read hint',()=>{
  const h=harness();h.detector.inspect(start()+read);h.advance(3000);
  h.detector.inspect(start()+strong+strong);assert.equal(h.done(),1);
  assert.equal(h.state.state,'working');
});
test('read-state alone and arbitrary text never start a task',()=>{
  const h=harness();h.detector.inspect(read+strong+'Task completed!\n');h.advance(10000);
  assert.equal(h.events.length,0);
});
test('new reasoning cancels read-state inference until another read-state arrives',()=>{
  const h=harness();h.detector.inspect(start()+read+activity());h.advance(600000);
  assert.equal(h.done(),0);h.detector.inspect(read);h.advance(3000);assert.equal(h.done(),1);
});
test('partial records are retained until their terminating newline',()=>{
  const h=harness(), text=start()+activity()+read+strong;
  for(const char of text)h.detector.inspect(char);
  assert.equal(h.done(),1);
});
test('concurrent anonymous signals are ignored; identified turns finish independently',()=>{
  const h=harness();h.detector.inspect(start('a')+activity('a','1')+start('b')+activity('b','2')+read+strong);
  h.advance(10000);assert.equal(h.done(),0);
  h.detector.inspect('requestKind=turn-diff-capture-complete threadId=a turnId=wrong\n');
  assert.equal(h.done(),0);
  h.detector.inspect('requestKind=turn-diff-capture-complete threadId=a turnId=1\n');
  assert.equal(h.done(),1);assert.equal(h.state.state,'working');
  h.detector.inspect('requestKind=turn-diff-capture-complete threadId=b turnId=2\n');
  assert.equal(h.done(),2);assert.equal(h.state.state,'done');
});
test('superseded activity resets without claiming success',()=>{
  const h=harness();h.detector.inspect(start()+start());
  assert.equal(h.done(),0);assert.equal(h.state.state,'working');
  assert.equal(h.events.filter(e=>e.state==='cancelled').length,1);
});
test('conservative mode waits for diff marker; reset/disposal clear pending timers',()=>{
  const h=harness({heuristic:false});h.detector.inspect(start()+read);h.advance(10000);
  assert.equal(h.done(),0);h.detector.inspect(strong);assert.equal(h.done(),1);
  const a=harness();a.detector.inspect(start()+read);a.detector.reset();a.advance(10000);
  assert.equal(a.done(),0);assert.equal(a.state.state,'ready');
  a.detector.inspect(start()+read);a.detector.dispose();a.advance(10000);assert.equal(a.done(),0);
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
  file.create(start()+read);await reader.poll();assert.equal(h.state.state,'working');
  file.truncate();await reader.poll();h.advance(10000);assert.equal(h.done(),0);assert.equal(h.state.state,'ready');
  file.append(start()+read);await reader.poll();
  file.replace(start()+read+strong);await reader.poll();assert.equal(h.done(),1);
});
test('large append is consumed over bounded polls without losing final completion',async()=>{
  const h=harness(),file=fakeFile();const reader=new CodexLogReader('log',h.detector,{fs:file.fs});
  await reader.poll();file.append('ignored\n'.repeat(160000)+start()+read+strong);
  await reader.poll();assert.equal(h.done(),0);await reader.poll();assert.equal(h.done(),1);
});
