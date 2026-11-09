const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function buildAgentTaskFilters(query) {
  const filter = {};
  const text = key => {
    if (query[key] === undefined || query[key] === '') return '';
    if (typeof query[key] !== 'string' || query[key].length > 200) throw new Error(`Invalid ${key}`);
    return query[key].trim();
  };
  const search = text('search');
  if (search) filter.$or = ['customerName', 'activityId', 'cif', 'verificationAddress'].map(field => ({ [field]: { $regex: escape(search), $options: 'i' } }));
  const state = text('state');
  if (state) filter.$and = [{ $or: ['state', 'address.state'].map(field => ({ [field]: { $regex: escape(state), $options: 'i' } })) }];
  const approval = text('approval');
  if (approval && !['all', 'approved', 'unapproved'].includes(approval)) throw new Error('Invalid approval');
  if (approval === 'approved') filter.reportIsApproved = true;
  if (approval === 'unapproved') filter.reportIsApproved = { $ne: true };
  const dateField = text('dateField') || 'visitDate';
  if (!['visitDate', 'createdAt'].includes(dateField)) throw new Error('Invalid date field');
  const dates = {};
  for (const [key, operator] of [['startDate', '$gte'], ['endDate', '$lt']]) {
    const value = text(key);
    if (!value) continue;
    const date = new Date(value + 'T00:00:00.000Z');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error(`Invalid ${key}`);
    // Calendar dates are interpreted in Nigeria (UTC+1), including the end day.
    dates[operator] = new Date(date.getTime() - 3600000 + (key === 'endDate' ? 86400000 : 0));
  }
  if (dates.$gte && dates.$lt && dates.$gte >= dates.$lt) throw new Error('Start date must be on or before end date');
  if (Object.keys(dates).length) filter[dateField] = dates;
  const sortBy = text('sortBy') || 'createdAt';
  const sortOrder = text('sortOrder') || 'desc';
  if (!['createdAt', 'visitDate', 'customerName'].includes(sortBy) || !['asc', 'desc'].includes(sortOrder)) throw new Error('Invalid sort');
  return { filter, company: text('company'), sort: { [sortBy]: sortOrder === 'asc' ? 1 : -1, _id: sortOrder === 'asc' ? 1 : -1 } };
}
module.exports = { buildAgentTaskFilters, escape };
