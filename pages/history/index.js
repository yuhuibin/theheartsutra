const { getHistoryRecords } = require('../../utils/study');
const {
  addMonths,
  buildMonthCalendar,
  formatDate,
  getMonthLabel,
  getMonthStart,
  isSameMonth,
  parseDate
} = require('../../utils/date');

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];

function buildRecordMap(records) {
  return (records || []).reduce((result, item) => {
    result[item.date] = item;
    return result;
  }, {});
}

function hasRecordContent(record) {
  if (!record) {
    return false;
  }

  if (record.mergedText && record.mergedText.trim()) {
    return true;
  }

  return (record.copyEntries || []).some((item) => (item.copiedText || '').trim());
}

function getLatestMonth(records) {
  if (!records.length) {
    return getMonthStart(new Date());
  }

  return getMonthStart(parseDate(records[0].date) || new Date());
}

function getEarliestMonth(records) {
  if (!records.length) {
    return getMonthStart(new Date());
  }

  return getMonthStart(parseDate(records[records.length - 1].date) || new Date());
}

function clampMonth(date, earliestMonth, latestMonth) {
  const month = getMonthStart(date) || getMonthStart(new Date());

  if (month.getTime() < earliestMonth.getTime()) {
    return earliestMonth;
  }

  if (month.getTime() > latestMonth.getTime()) {
    return latestMonth;
  }

  return month;
}

Page({
  data: {
    records: [],
    weekdays: WEEKDAYS,
    monthLabel: '',
    completedCount: 0,
    calendarWeeks: [],
    currentMonthDate: '',
    canPrevMonth: false,
    canNextMonth: false
  },

  onLoad() {
    this.loadRecords();
  },

  onShow() {
    this.loadRecords(this.data.currentMonthDate);
  },

  loadRecords(monthDate) {
    const records = getHistoryRecords();
    const recordMap = buildRecordMap(records);
    const earliestMonth = getEarliestMonth(records);
    const latestMonth = getLatestMonth(records);
    const anchorMonth = clampMonth(monthDate || this.data.currentMonthDate || latestMonth, earliestMonth, latestMonth);
    const calendarWeeks = buildMonthCalendar(anchorMonth).map((week) => {
      return week.map((day) => {
        const record = recordMap[day.date];
        const isCompleted = Boolean(record && record.status === 'completed');
        const hasContent = hasRecordContent(record);

        return {
          ...day,
          status: record ? record.status : '',
          isCompleted,
          hasContent,
          isClickable: hasContent
        };
      });
    });
    const completedCount = calendarWeeks
      .flat()
      .filter((day) => day.isCurrentMonth && day.isCompleted)
      .length;

    this.setData({
      records,
      weekdays: WEEKDAYS,
      monthLabel: getMonthLabel(anchorMonth),
      completedCount,
      calendarWeeks,
      currentMonthDate: formatDate(anchorMonth),
      canPrevMonth: !isSameMonth(anchorMonth, earliestMonth),
      canNextMonth: !isSameMonth(anchorMonth, latestMonth)
    });
  },

  goToPrevMonth() {
    if (!this.data.canPrevMonth) {
      return;
    }

    this.loadRecords(addMonths(this.data.currentMonthDate, -1));
  },

  goToNextMonth() {
    if (!this.data.canNextMonth) {
      return;
    }

    this.loadRecords(addMonths(this.data.currentMonthDate, 1));
  },

  goToRecord(event) {
    const { date, clickable } = event.currentTarget.dataset;
    const isClickable = clickable === true || clickable === 'true';

    if (!isClickable || !date) {
      return;
    }

    wx.navigateTo({
      url: `/pages/record/index?date=${date}`
    });
  }
});
