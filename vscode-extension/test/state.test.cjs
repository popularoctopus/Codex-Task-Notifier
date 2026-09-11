const {test} = require('node:test');
const assert = require('node:assert/strict');
const {TaskState} = require('../state');
test('stored Done stays Ready; completion fires exactly once', () => {
  const state = new TaskState();
  assert.equal(state.accept('a',{state:'done',updatedAt:'old'}),null);
  assert.equal(state.state,'ready');
  assert.equal(state.accept('a',{state:'working',updatedAt:'1'}).starts,true);
  assert.equal(state.accept('a',{state:'working',updatedAt:'1'}),null);
  assert.equal(state.accept('a',{state:'done',updatedAt:'2'}).finishes,true);
  assert.equal(state.state,'done');
  assert.equal(state.accept('a',{state:'done',updatedAt:'2'}),null);
});
test('Done can be reset to Ready without losing source history', () => {
  const state = new TaskState();
  state.accept('a',{state:'working',updatedAt:'1'});
  state.accept('a',{state:'done',updatedAt:'2'});
  assert.equal(state.reset(),true);
  assert.equal(state.state,'ready');
  assert.equal(state.reset(),false);
  assert.equal(state.accept('a',{state:'working',updatedAt:'3'}).starts,true);
});
test('multi-root task completion cannot hide another active task', () => {
  const state = new TaskState();
  state.accept('a',{state:'working',updatedAt:'1'});
  state.accept('b',{state:'working',updatedAt:'1'});
  assert.equal(state.accept('a',{state:'done',updatedAt:'2'}).state,'working');
  assert.equal(state.accept('b',{state:'done',updatedAt:'2'}).state,'done');
});
test('invalid and partially written values never finish a task', () => {
  const state = new TaskState();
  state.accept('a',{state:'working',updatedAt:'1'});
  for (const value of [null,{}, {state:'error',updatedAt:'2'}, {state:'done'}, {state:'done',updatedAt:5}]) assert.equal(state.accept('a',value),null);
  assert.equal(state.state,'working');
});
