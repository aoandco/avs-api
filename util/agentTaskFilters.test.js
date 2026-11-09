const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildAgentTaskFilters } = require('./agentTaskFilters');
test('search is literal and does not interpret regex syntax', () => {
  const { filter } = buildAgentTaskFilters({search:'A.*(B)',state:'Lagos'});
  assert.equal(filter.$or[0].customerName.$regex, 'A\\.\\*\\(B\\)');
  assert.equal(filter.$and[0].$or[1]['address.state'].$regex, 'Lagos');
});
test('inclusive Nigeria date range uses exclusive next-day end and stable sorting', () => {
  const { filter, sort } = buildAgentTaskFilters({startDate:'2026-10-31',endDate:'2026-10-31',sortBy:'visitDate',sortOrder:'asc',approval:'unapproved'});
  assert.equal(filter.visitDate.$gte.toISOString(), '2026-10-30T23:00:00.000Z');
  assert.equal(filter.visitDate.$lt.toISOString(), '2026-10-31T23:00:00.000Z');
  assert.deepEqual(sort,{visitDate:1,_id:1});
  assert.deepEqual(filter.reportIsApproved,{$ne:true});
});
test('rejects invalid dates, reversed ranges, untrusted objects and sort fields', () => {
  for (const query of [{startDate:'2026-02-30'},{startDate:'2026-11-02',endDate:'2026-11-01'},{search:{$ne:''}},{sortBy:'password'},{dateField:'taskSubmissionDate'},{approval:'invalid'}]) assert.throws(()=>buildAgentTaskFilters(query));
});
