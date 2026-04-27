const STORAGE_KEYS = {
  APP_META: 'hs_app_meta',
  PLAN_STATE: 'hs_current_plan_state',
  DAILY_RECORDS: 'hs_daily_records',
  COPY_FONT_SIZE: 'hs_copy_font_size'
};

function getStorage(key, fallbackValue) {
  try {
    const value = wx.getStorageSync(key);
    if (value === '' || value === undefined || value === null) {
      return fallbackValue;
    }
    return value;
  } catch (error) {
    return fallbackValue;
  }
}

function setStorage(key, value) {
  wx.setStorageSync(key, value);
  return value;
}

function getAppMeta() {
  return getStorage(STORAGE_KEYS.APP_META, null);
}

function setAppMeta(meta) {
  return setStorage(STORAGE_KEYS.APP_META, meta);
}

function getPlanState() {
  return getStorage(STORAGE_KEYS.PLAN_STATE, null);
}

function setPlanState(state) {
  return setStorage(STORAGE_KEYS.PLAN_STATE, state);
}

function getDailyRecords() {
  return getStorage(STORAGE_KEYS.DAILY_RECORDS, {});
}

function setDailyRecords(records) {
  return setStorage(STORAGE_KEYS.DAILY_RECORDS, records);
}

function getCopyFontSize() {
  return getStorage(STORAGE_KEYS.COPY_FONT_SIZE, null);
}

function setCopyFontSize(fontSize) {
  return setStorage(STORAGE_KEYS.COPY_FONT_SIZE, fontSize);
}

module.exports = {
  STORAGE_KEYS,
  getAppMeta,
  setAppMeta,
  getPlanState,
  setPlanState,
  getDailyRecords,
  setDailyRecords,
  getCopyFontSize,
  setCopyFontSize
};
