const {test}=require('node:test');
const assert=require('node:assert/strict');
const {isEditCall,EditRecords,CodexEditMonitor}=require('../codex-edits');
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
  const seen=[];const records=new EditRecords(t=>seen.push(t));
  const line=JSON.stringify({timestamp:'2026-09-14T16:00:00Z',type:'response_item',payload:{type:'custom_tool_call',name:'apply_patch'}})+'\n';
  records.inspect('{broken}\n');for(const char of line)records.inspect(char);
  records.inspect(JSON.stringify({type:'event_msg',payload:{type:'custom_tool_call',name:'apply_patch'}})+'\n');
  assert.deepEqual(seen,[Date.parse('2026-09-14T16:00:00Z')]);
  records.reset();records.skipFirstLine=true;records.inspect('truncated record\n'+line);assert.equal(seen.length,2);
});
test('monitor reads only the transcript matching a locally observed thread',async()=>{
  const thread='11111111-1111-1111-1111-111111111111';
  const events=[],opened=[];const detector=new CodexLogDetector((s,v)=>events.push(v),{minimumMs:10000,setTimer:()=>1,clearTimer(){}});
  detector.line('2026-09-14 12:00:00.000 Reasoning summary turn-start config resolved conversationId='+thread);
  const data=Buffer.from(JSON.stringify({timestamp:new Date(Date.parse('2026-09-14 12:00:00.000')+1).toISOString(),type:'response_item',payload:{type:'custom_tool_call',name:'apply_patch'}})+'\n');
  const fs={async readdir(){return ['rollout-'+thread+'.jsonl','rollout-22222222-2222-2222-2222-222222222222.jsonl'].map(name=>({name,isDirectory:()=>false,isFile:()=>true}));},
    async open(filename){opened.push(filename);return {async stat(){return {dev:1,ino:1,birthtimeMs:1,size:data.length};},async read(buffer,offset,length,position){return {bytesRead:data.copy(buffer,offset,position,position+length)};},async close(){}};}};
  const monitor=new CodexEditMonitor('sessions',detector,{fs});await monitor.poll();
  assert.equal(opened.length,1);assert.ok(opened[0].endsWith(thread+'.jsonl'));
  assert.equal(events[0].state,'working');await monitor.poll();assert.equal(events.length,1);
  detector.dispose();
});
