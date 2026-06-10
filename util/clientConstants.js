const WEMA_COMPANY_NAME = "Wema Bank Ltd";

function isWemaClient(client) {
  return client?.companyName?.trim() === WEMA_COMPANY_NAME;
}

module.exports = {
  WEMA_COMPANY_NAME,
  isWemaClient,
};
