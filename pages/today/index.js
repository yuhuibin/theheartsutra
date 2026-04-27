const { formatDate } = require('../../utils/date');
const { getCopyFontSize, setCopyFontSize } = require('../../utils/storage');
const {
  getOrCreateDailyRecord,
  updateDailyCopyEntry,
  completeDailyRecord,
  getSutraTitle
} = require('../../utils/study');

function buildGuideSegments(sourceText, copiedText, isChecked) {
  const sourceChars = (sourceText || '').split('');
  const copiedChars = (copiedText || '').split('');
  const hasInput = Boolean((copiedText || '').length);

  return sourceChars.map((char, index) => {
    if (!hasInput) {
      return {
        text: char,
        className: 'guide-text-guide'
      };
    }

    if (!isChecked) {
      return {
        text: char,
        className: index < copiedChars.length ? 'guide-text-hidden' : 'guide-text-guide'
      };
    }

    return {
      text: char,
      className: index >= copiedChars.length
        ? 'guide-text-guide'
        : copiedChars[index] !== char
          ? 'guide-text-error'
          : 'guide-text-hidden'
    };
  });
}

function getCheckedMap(lineInputs) {
  return (lineInputs || []).reduce((result, item) => {
    result[item.lineId] = Boolean(item.isChecked);
    return result;
  }, {});
}

function areAllSegmentsClass(segments, className) {
  return (segments || []).every((item) => item.className === className);
}

function decorateLineInputs(copyEntries, checkedMap) {
  return (copyEntries || []).map((item) => {
    const isChecked = Boolean((checkedMap || {})[item.lineId]);

    return {
      ...item,
      isChecked,
      guideSegments: buildGuideSegments(item.sourceText, item.copiedText, isChecked)
    };
  });
}

const MIN_COPY_FONT_SIZE = 24;
const MAX_COPY_FONT_SIZE = 42;
const DEFAULT_COPY_FONT_SIZE = 30;

function normalizeCopyFontSize(value) {
  const numericValue = Number(value);
  if (!numericValue) {
    return DEFAULT_COPY_FONT_SIZE;
  }
  return Math.min(MAX_COPY_FONT_SIZE, Math.max(MIN_COPY_FONT_SIZE, numericValue));
}

Page({
  data: {
    currentDate: '',
    sutraTitle: '',
    record: null,
    lineInputs: [],
    savingLineId: '',
    focusedLineId: '',
    animatedLineId: '',
    isCompleted: false,
    copyFontSize: DEFAULT_COPY_FONT_SIZE,
    copyLineHeight: DEFAULT_COPY_FONT_SIZE + 28
  },

  onLoad() {
    this.lineDrafts = {};
    const copyFontSize = normalizeCopyFontSize(getCopyFontSize());
    this.setData({
      copyFontSize,
      copyLineHeight: copyFontSize + 28
    });
    this.loadTodayRecord();
  },

  onShow() {
    this.loadTodayRecord();
  },

  onUnload() {
    if (this.animationTimer) {
      clearTimeout(this.animationTimer);
    }
  },

  syncDrafts(lineInputs) {
    this.lineDrafts = (lineInputs || []).reduce((result, item) => {
      result[item.lineId] = item.copiedText || '';
      return result;
    }, {});
  },

  animateLine(lineId) {
    if (!lineId) {
      return;
    }

    if (this.animationTimer) {
      clearTimeout(this.animationTimer);
    }

    this.setData({
      animatedLineId: lineId
    });

    this.animationTimer = setTimeout(() => {
      this.setData({
        animatedLineId: ''
      });
    }, 280);
  },

  scrollToLine(lineId) {
    if (!lineId) {
      return;
    }

    const query = wx.createSelectorQuery();
    query.selectViewport().scrollOffset();
    query.select(`#row-${lineId}`).boundingClientRect();
    query.exec((result) => {
      const viewport = result && result[0];
      const target = result && result[1];

      if (!viewport || !target) {
        return;
      }

      const nextScrollTop = Math.max(0, viewport.scrollTop + target.top - 220);
      wx.pageScrollTo({
        scrollTop: nextScrollTop,
        duration: 260
      });
    });
  },

  loadTodayRecord() {
    const currentDate = formatDate(new Date());
    const record = getOrCreateDailyRecord(currentDate);
    const lineInputs = decorateLineInputs(record.copyEntries || []);

    this.syncDrafts(lineInputs);

    this.setData({
      currentDate,
      sutraTitle: getSutraTitle(),
      record,
      lineInputs,
      focusedLineId: '',
      isCompleted: record.status === 'completed'
    });
  },

  handleInput(event) {
    const { lineId, index } = event.currentTarget.dataset;
    const { value } = event.detail;
    const { isCompleted, lineInputs } = this.data;

    if (isCompleted) {
      return;
    }

    this.lineDrafts[lineId] = value;

    const currentItem = lineInputs[Number(index)];
    if (!currentItem) {
      return;
    }

    const nextGuideSegments = buildGuideSegments(currentItem.sourceText, value, false);
    const hasSameDisplay = !currentItem.isChecked && currentItem.guideSegments.every((item, segmentIndex) => {
      return item.className === nextGuideSegments[segmentIndex].className;
    });

    if (hasSameDisplay) {
      return;
    }

    this.setData({
      [`lineInputs[${index}].copiedText`]: value,
      [`lineInputs[${index}].isChecked`]: false,
      [`lineInputs[${index}].guideSegments`]: nextGuideSegments
    });
  },

  handleBlur(event) {
    const { lineId } = event.currentTarget.dataset;
    const inputValue = event.detail.value;
    const { currentDate, lineInputs, isCompleted } = this.data;

    if (isCompleted) {
      return;
    }

    const value = this.lineDrafts[lineId] !== undefined ? this.lineDrafts[lineId] : inputValue;
    const checkedMap = getCheckedMap(lineInputs);
    const record = updateDailyCopyEntry(currentDate, lineId, value);
    const nextInputs = decorateLineInputs(record.copyEntries || [], checkedMap);

    this.syncDrafts(nextInputs);

    this.setData({
      record,
      lineInputs: nextInputs,
      savingLineId: ''
    });
  },

  handleConfirm(event) {
    const { lineId, index } = event.currentTarget.dataset;
    const inputValue = event.detail.value;
    const { currentDate, lineInputs, isCompleted } = this.data;

    if (isCompleted) {
      return;
    }

    const value = this.lineDrafts[lineId] !== undefined ? this.lineDrafts[lineId] : inputValue;
    const checkedMap = getCheckedMap(lineInputs);
    checkedMap[lineId] = true;

    const record = updateDailyCopyEntry(currentDate, lineId, value);
    const nextInputs = decorateLineInputs(record.copyEntries || [], checkedMap);
    const nextItem = nextInputs[Number(index) + 1];

    this.syncDrafts(nextInputs);

    this.setData({
      record,
      lineInputs: nextInputs,
      savingLineId: '',
      focusedLineId: nextItem ? nextItem.lineId : '',
      animatedLineId: nextItem ? nextItem.lineId : ''
    });

    if (nextItem) {
      this.animateLine(nextItem.lineId);
      setTimeout(() => {
        this.scrollToLine(nextItem.lineId);
      }, 30);
    }
  },

  handleSave() {
    const { currentDate, lineInputs, isCompleted } = this.data;

    if (isCompleted) {
      wx.showToast({
        title: '今天已完成',
        icon: 'none'
      });
      return;
    }

    let record = null;
    lineInputs.forEach((item) => {
      const value = this.lineDrafts[item.lineId] !== undefined ? this.lineDrafts[item.lineId] : item.copiedText || '';
      record = updateDailyCopyEntry(currentDate, item.lineId, value);
    });

    const checkedMap = getCheckedMap(lineInputs);
    const nextInputs = decorateLineInputs(record ? record.copyEntries || [] : lineInputs, checkedMap);

    this.syncDrafts(nextInputs);

    this.setData({
      record,
      lineInputs: nextInputs,
      savingLineId: '',
      focusedLineId: ''
    });

    wx.showToast({
      title: '已保存',
      icon: 'success'
    });
  },

  handleComplete() {
    const { currentDate } = this.data;
    const result = completeDailyRecord(currentDate);

    if (!result.ok) {
      wx.showToast({
        title: result.message,
        icon: 'none'
      });
      return;
    }

    const nextInputs = decorateLineInputs(result.record.copyEntries || [], getCheckedMap(this.data.lineInputs));

    this.syncDrafts(nextInputs);

    this.setData({
      record: result.record,
      lineInputs: nextInputs,
      focusedLineId: '',
      isCompleted: true
    });

    wx.showToast({
      title: '今日已完成',
      icon: 'success'
    });
  },

  handleFontSizeChange(event) {
    const copyFontSize = normalizeCopyFontSize(event.detail.value);
    setCopyFontSize(copyFontSize);
    this.setData({
      copyFontSize,
      copyLineHeight: copyFontSize + 28
    });
  },

  goToHistory() {
    wx.switchTab({
      url: '/pages/history/index'
    });
  }
});
