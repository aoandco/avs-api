const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const mongoose = require('mongoose');

const agentId = new mongoose.Types.ObjectId();
const taskId = new mongoose.Types.ObjectId();
function load(Task) {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(require.resolve('./adminController'), 'utf8'), {
    module, exports: module.exports, console, Date, __dirname,
    require(name) {
      if (name === '../model/Task') return Task;
      if (name === '../model/Agent') return { findById: async () => ({ _id: agentId }) };
      if (name === 'mongoose') return mongoose;
      return {};
    },
  });
  return module.exports;
}
function response() {
  return { status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
}
const request = () => ({ params: { agentId: String(agentId) }, body: { taskIds: [String(taskId)] } });

test('completed tasks are skipped without changing their owner, dates or feedback', async () => {
  const task = { _id: taskId, status: 'completed', agentId, feedback: { reportUrl: 'saved-report' } };
  const before = JSON.stringify(task);
  const controller = load({ findById: async () => task, findOneAndUpdate: async () => assert.fail('Completed task must not be written') });
  const res = response();
  await controller.assignTask(request(), res);
  assert.equal(res.code, 200);
  assert.equal(res.body.data.assigned, 0);
  assert.equal(res.body.data.skipped, 1);
  assert.match(res.body.data.skippedTasks[0].reason, /Completed/);
  assert.equal(JSON.stringify(task), before);
});

test('assignment cannot reopen a task completed between reading and writing', async () => {
  let status = 'pending';
  const controller = load({
    findById: async () => { const read = { _id: taskId, status }; status = 'completed'; return read; },
    findOneAndUpdate: async (filter) => {
      assert.equal(filter.status.$ne, 'completed');
      return status === filter.status.$ne ? null : assert.fail('Unexpected status');
    },
  });
  const res = response();
  await controller.assignTask(request(), res);
  assert.equal(status, 'completed');
  assert.equal(res.body.data.assigned, 0);
  assert.equal(res.body.data.skipped, 1);
});

test('eligible tasks still receive assignment and a 48 hour deadline', async () => {
  const updated = { _id: taskId, status: 'assigned', agentId };
  const controller = load({
    findById: async () => ({ _id: taskId, status: 'pending' }),
    findOneAndUpdate: async (filter, update, options) => {
      assert.equal(filter.status.$ne, 'completed');
      assert.equal(update.$set.status, 'assigned');
      assert.equal(String(update.$set.agentId), String(agentId));
      assert.equal(update.$set.taskSubmissionDate - update.$set.assignedDate, 172800000);
      assert.equal(options.runValidators, true);
      assert.equal(options.new, true);
      return updated;
    },
  });
  const res = response();
  await controller.assignTask(request(), res);
  assert.equal(res.body.data.assigned, 1);
  assert.equal(res.body.data.skipped, 0);
  assert.equal(res.body.data.assignedTasks[0], updated);
});

test('legacy pending-only assignment skips a task whose status changed concurrently', async () => {
  const controller = load({
    find: async () => [{ _id: taskId, status: 'pending' }],
    findOneAndUpdate: async (filter) => { assert.equal(filter.status, 'pending'); return null; },
  });
  const res = response();
  await controller.assignTasksToAgent(request(), res);
  assert.equal(res.code, 404);
});
