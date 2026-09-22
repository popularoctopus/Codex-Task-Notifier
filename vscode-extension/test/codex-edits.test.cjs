const {test}=require('node:test');
const assert=require('node:assert/strict');
const {isEditCall,SessionRecords,CodexSessionMonitor}=require('../codex-edits');
const {CodexLogDetector}=require('../codex-log');
test('recognize editing tools without classifying quoted examples, text, or outputs as edits',()=>{
  assert.equal(isEditCall({type:'custom_tool_call',name:'apply_patch'}),true);
  assert.equal(isEditCall({type:'function_call',name:'functions.apply_patch'}),true);
  assert.equal(isEditCall({type:'custom_tool_call',name:'exec',input:'text(await tools.apply_patch("patch"));'}),true);
  for(const input of ['text("tools.apply_patch(\\\"patch\\\")")','// tools.apply_patch("patch")','/* tools.apply_patch("patch") */','await tools.exec_command({cmd:"apply_patch foo"})']) {
    assert.equal(isEditCall({type:'custom_tool_call',name:'exec',input}),false);
  }
  assert.equal(isEditCall({type:'function_call_output',name:'apply_patch'}),false);
});
test('parse partial JSONL and ignore malformed records and non-tool mentions',()=>{
  const seen=[];const records=new SessionRecords((event,t)=>{if(event==='edit')seen.push(t);});
  const line=JSON.stringify({timestamp:'2026-09-14T16:00:00Z',type:'response_item',payload:{type:'custom_tool_call',name:'apply_patch'}})+'\n';
  records.inspect('{broken}\nnull\n');for(const char of line)records.inspect(char);
  records.inspect(JSON.stringify({type:'event_msg',payload:{type:'custom_tool_call',name:'apply_patch'}})+'\n');
  assert.deepEqual(seen,[Date.parse('2026-09-14T16:00:00Z')]);
  records.reset();records.skipFirstLine=true;records.inspect('truncated record\n'+line);assert.equal(seen.length,2);
});
test('monitor reads only the transcript matching a locally observed thread',async()=>{
  const thread='11111111-1111-1111-1111-111111111111';
  const events=[],opened=[];const detector=new CodexLogDetector((s,v)=>events.push(v),{minimumMs:10000,now:()=>Date.parse('2026-09-14 12:00:00.000'),setTimer:()=>1,clearTimer(){}});
  detector.line('2026-09-14 12:00:00.000 Reasoning summary turn-start config resolved conversationId='+thread);
  const data=Buffer.from(JSON.stringify({timestamp:new Date(Date.parse('2026-09-14 12:00:00.000')+1).toISOString(),type:'response_item',payload:{type:'custom_tool_call',name:'apply_patch'}})+'\n');
  const fs={async readdir(){return ['rollout-'+thread+'.jsonl','rollout-22222222-2222-2222-2222-222222222222.jsonl'].map(name=>({name,isDirectory:()=>false,isFile:()=>true}));},
    async open(filename){opened.push(filename);return {async stat(){return {dev:1,ino:1,birthtimeMs:1,size:data.length};},async read(buffer,offset,length,position){return {bytesRead:data.copy(buffer,offset,position,position+length)};},async close(){}};}};
  const monitor=new CodexSessionMonitor('sessions',detector,{fs});await monitor.poll();
  assert.equal(opened.length,1);assert.ok(opened[0].endsWith(thread+'.jsonl'));
  assert.equal(events.at(-1).state,'working');await monitor.poll();assert.equal(events.length,2);
  detector.dispose();
});

test('lifecycle metadata handles final answers, interrupted turns and successful completion fallback',()=>{
  const seen=[];const records=new SessionRecords((...args)=>seen.push(args));
  const record=(type,payload,time='2026-09-14T16:00:00Z')=>JSON.stringify({timestamp:time,type,payload})+'\n';
  records.inspect(record('event_msg',{type:'task_started',turn_id:'one',started_at:1789401600}));
  records.inspect(record('event_msg',{type:'user_message',message:'Done'}));
  records.inspect(record('response_item',{type:'message',role:'assistant',phase:'commentary',content:'Done'}));
  records.inspect(record('event_msg',{type:'agent_message',phase:'final_answer'}));
  records.inspect(record('response_item',{type:'message',role:'assistant',phase:'final_answer'}));
  records.inspect(record('event_msg',{type:'task_complete',turn_id:'one',last_agent_message:'Answer',completed_at:1789401605},'2026-09-14T16:00:05.123Z'));
  records.inspect(record('event_msg',{type:'turn_aborted',turn_id:'two'}));
  records.inspect(record('event_msg',{type:'task_complete',turn_id:'three',last_agent_message:null}));
  assert.deepEqual(seen.map(s=>[s[0],s[2]]),[['start','one'],['final','one'],['final','one'],['final','one'],['interrupted','two'],['interrupted','three']]);
  assert.equal(seen[3][1],Date.parse('2026-09-14T16:00:05.123Z'));
});

test('disabling edit detection preserves lifecycle detection',()=>{
  const seen=[];const records=new SessionRecords(event=>seen.push(event),{detectEdits:false});
  for(const payload of [{type:'custom_tool_call',name:'apply_patch'},{type:'message',role:'assistant',phase:'final_answer'}])
    records.inspect(JSON.stringify({timestamp:'2026-09-14T16:00:00Z',type:'response_item',payload})+'\n');
  assert.deepEqual(seen,['final']);
});

test('transcript polling continues after Working and Done, with final events delivered only once',async()=>{
  const thread='11111111-1111-1111-1111-111111111111';
  const base=Date.parse('2026-09-14 12:00:00.000');
  const events=[];const detector=new CodexLogDetector((s,v)=>events.push(v),{now:()=>base,setTimer:()=>1,clearTimer(){}});
  detector.line('2026-09-14 12:00:00.000 Reasoning summary turn-start config resolved conversationId='+thread);
  let data=Buffer.alloc(0);
  const append=(elapsed,payload,type='event_msg')=>{data=Buffer.concat([data,Buffer.from(JSON.stringify({timestamp:new Date(base+elapsed).toISOString(),type,payload})+'\n')]);};
  append(1,{type:'task_started',turn_id:'one'});
  append(2,{type:'custom_tool_call',name:'apply_patch'},'response_item');
  const fs={async readdir(){return [{name:'rollout-'+thread+'.jsonl',isDirectory:()=>false,isFile:()=>true}];},
    async open(){return {async stat(){return {dev:1,ino:1,birthtimeMs:1,size:data.length};},async read(buffer,offset,length,position){return {bytesRead:data.copy(buffer,offset,position,position+length)};},async close(){}};}};
  const monitor=new CodexSessionMonitor('sessions',detector,{fs});await monitor.poll();
  assert.equal(events.at(-1).state,'working');
  append(12000,{type:'agent_message',phase:'final_answer'});await monitor.poll();
  append(12000,{type:'task_complete',turn_id:'one',last_agent_message:'Final'});await monitor.poll();
  assert.equal(events.filter(e=>e.state==='done').length,1);
  append(15000,{type:'task_started',turn_id:'two'});await monitor.poll();
  assert.equal(events.at(-1).state,'thinking');
  append(15001,{type:'turn_aborted',turn_id:'two'});await monitor.poll();
  assert.equal(events.at(-1).state,'cancelled');detector.dispose();
});
