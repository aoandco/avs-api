const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const filters = require('../util/agentTaskFilters');
function load(Task, dependencies = {}) {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(require.resolve('./agentController'), 'utf8'), {
    module, exports: module.exports, console, Date,
    require(name) {
      if (Object.hasOwn(dependencies, name)) return dependencies[name];
      if (name === '../model/Task') return Task;
      if (name === '../model/Client') return { find: () => ({ distinct: async () => ['company-id'] }) };
      if (name === '../util/agentTaskFilters') return filters;
      return {};
    },
  });
  return module.exports;
}
const response = () => ({ status(code) { this.code = code; return this; }, json(body) { this.body = body; } });
test('submission requires an image or video; audio alone is insufficient', async () => {
  for (const files of [undefined, {}, {geotaggedImages: [], recordedVideo: []}, {recordedAudio: [{path: 'audio.tmp'}]}, {geotaggedImages: [{path: 'image.tmp'}]}, {recordedVideo: [{path: 'video.tmp'}]}, {geotaggedImages: [{path: 'image.tmp'}], recordedVideo: [{path: 'video.tmp'}]}]) {
    let saved = false;
    const removed = [];
    const task = {agentId: {_id: 'agent'}, status: 'assigned', save: async () => {saved = true;}};
    const query = {populate() {return this;}, then(resolve) {return Promise.resolve(task).then(resolve);}};
    const controller = load({findById: () => query}, {
      mongoose: {Types: {ObjectId: function (id) {return {id};}}},
      '../util/validationSchemas': {submitTaskSchema: {validate: () => ({value: {}})}},
      '../util/geoValidation': {validateSubmitLocation: async () => ({ok: true})},
      '../config/cloudinary': {uploader: {upload: async () => ({secure_url: 'https://media.example/file'})}},
      '../service/pdfService': {generateTaskPDF: async () => 'pdf', uploadPDFToCloudinary: async () => 'https://media.example/report'},
      fs: {promises: {unlink: async path => {removed.push(path);}}},
    });
    const res = response();
    await controller.submitTask({params: {taskId: 'task'}, user: {id: 'agent'}, body: {data: '{}'}, files}, res);
    const hasMedia = Boolean(files?.geotaggedImages?.length || files?.recordedVideo?.length);
    assert.equal(res.code, hasMedia ? 200 : 400);
    assert.equal(saved, hasMedia);
    assert.equal(task.status, hasMedia ? 'completed' : 'assigned');
    if (!hasMedia) assert.match(res.body.message, /image or video is required/);
    if (files?.recordedAudio) assert.deepEqual(removed, ['audio.tmp']);
  }
});
test('completed list filters and count remain scoped to the authenticated agent', async () => {
  let findFilter, countFilter, skipped, limited;
  const query = { populate() {return this;}, sort() {return this;}, skip(n) {skipped=n;return this;}, limit(n) {limited=n;return Promise.resolve([{status:'completed'}]);} };
  const controller = load({ find(f) {findFilter=f;return query;}, countDocuments: async f => {countFilter=f; return 51;} });
  const res = response();
  await controller.getTasks({ user:{id:'logged-in-agent'}, query:{statusFilter:'completed',agentId:'other-agent',company:'Bank',page:'2',limit:'25',approval:'approved',search:'ACT'} }, res);
  assert.equal(res.code,200);
  assert.equal(findFilter.agentId,'logged-in-agent');
  assert.equal(findFilter.status.$in[0],'completed');
  assert.equal(findFilter.clientId.$in[0],'company-id');
  assert.equal(findFilter.reportIsApproved,true);
  assert.equal(findFilter,countFilter);
  assert.equal(skipped,25);
  assert.equal(limited,25);
  assert.equal(res.body.totalPages,3);
});
test('invalid pagination and invalid filter values return 400 before querying tasks', async () => {
  const controller = load({find() {assert.fail('Invalid query must not reach database');}});
  for (const query of [{page:'0'},{limit:'101'},{sortBy:'unknown'},{startDate:'2026-02-30'}]) {
    const res=response();
    await controller.getTasks({user:{id:'agent'},query},res);
    assert.equal(res.code,400);
  }
});
