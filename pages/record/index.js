const { getRecordByDate } = require('../../utils/study');

Page({
  data: {
    date: '',
    record: null,
    mergedLines: []
  },

  onLoad(options) {
    this.loadRecord(options.date || '');
  },

  loadRecord(date) {
    const record = getRecordByDate(date);
    const mergedLines = record
      ? record.copyEntries
          .map((item) => (item.copiedText || '').trim())
          .filter(Boolean)
      : [];

    this.setData({
      date,
      record,
      mergedLines
    });
  }
});
