const { formatDate } = require('../../utils/date');
const { getCopyFontSize, setCopyFontSize } = require('../../utils/storage');
const {
  getOrCreateDailyRecord,
  updateDailyCopyEntry,
  completeDailyRecord,
  getSutraTitle,
  isIgnorableCopyChar,
  getComparableChars,
  isCopiedTextMatched
} = require('../../utils/study');

function buildGuideSegments(sourceText, copiedText, isChecked, isActive) {
  const sourceChars = (sourceText || '').split('');
  const comparableCopiedChars = getComparableChars(copiedText);
  const hasComparableInput = comparableCopiedChars.length > 0;
  const lineMatched = isCopiedTextMatched(sourceText, copiedText);
  let comparableIndex = 0;

  return sourceChars.map((char) => {
    if (isIgnorableCopyChar(char)) {
      if (!hasComparableInput) {
        return {
          text: char,
          className: 'guide-text-guide'
        };
      }

      if (isChecked || isActive) {
        return {
          text: char,
          className: lineMatched || comparableIndex < comparableCopiedChars.length
            ? 'guide-text-filled'
            : 'guide-text-guide'
        };
      }

      return {
        text: comparableIndex < comparableCopiedChars.length ? '' : char,
        className: 'guide-text-guide'
      };
    }

    const currentIndex = comparableIndex;
    comparableIndex += 1;

    if (!hasComparableInput) {
      return {
        text: char,
        className: 'guide-text-guide'
      };
    }

    if (!isChecked) {
      if (isActive && currentIndex < comparableCopiedChars.length) {
        const copiedChar = comparableCopiedChars[currentIndex];
        return {
          text: char,
          className: copiedChar === char ? 'guide-text-filled' : 'guide-text-error'
        };
      }
      return {
        text: char,
        className: currentIndex < comparableCopiedChars.length ? 'guide-text-hidden' : 'guide-text-guide'
      };
    }

    const copiedChar = comparableCopiedChars[currentIndex];

    return {
      text: char,
      className: copiedChar === undefined
        ? 'guide-text-guide'
        : copiedChar !== char
          ? 'guide-text-error'
          : 'guide-text-filled'
    };
  });
}

function getCheckedMap(lineInputs) {
  return (lineInputs || []).reduce((result, item) => {
    result[item.lineId] = Boolean(item.isChecked);
    return result;
  }, {});
}

function decorateLineInputs(copyEntries, checkedMap, activeLineIndex) {
  return (copyEntries || []).map((item, index) => {
    const isChecked = Boolean((checkedMap || {})[item.lineId]);
    const isActive = index === activeLineIndex;

    return {
      ...item,
      isChecked,
      guideSegments: buildGuideSegments(item.sourceText, item.copiedText, isChecked, isActive)
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
    animatedLineId: '',
    isCompleted: false,
    copyFontSize: DEFAULT_COPY_FONT_SIZE,
    copyLineHeight: DEFAULT_COPY_FONT_SIZE + 28,
    activeLineIndex: -1,
    activeLineValue: '',
    activeLineCursor: 0,
    isTextareaFocused: false,
    textareaTop: 0,
    textareaLeft: 0,
    textareaWidth: 0,
    textareaHeight: 0
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

  onPageScroll() {
    const { activeLineIndex, lineInputs } = this.data;
    if (activeLineIndex < 0 || !lineInputs[activeLineIndex]) {
      return;
    }
    this.positionTextarea(lineInputs[activeLineIndex].lineId);
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

  positionTextarea(lineId, callback) {
    const query = wx.createSelectorQuery();
    query.select('.copy-board').boundingClientRect();
    query.select(`#row-${lineId} .board-content`).boundingClientRect();
    query.exec((result) => {
      const parent = result && result[0];
      const target = result && result[1];
      if (!parent || !target) {
        if (callback) { callback(); }
        return;
      }
      this.setData({
        textareaTop: target.top - parent.top,
        textareaLeft: target.left - parent.left,
        textareaWidth: target.width,
        textareaHeight: target.height
      }, callback);
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
      activeLineIndex: -1,
      activeLineValue: '',
      activeLineCursor: 0,
      isTextareaFocused: false,
      isCompleted: record.status === 'completed'
    });
  },

  activateLine(index, skipSave) {
    const { lineInputs, activeLineIndex, activeLineValue } = this.data;

    if (!skipSave && activeLineIndex >= 0 && activeLineIndex !== index) {
      this.saveCurrentLine();
    }

    const item = lineInputs[index];
    if (!item) {
      return;
    }

    const lineDraft = this.lineDrafts[item.lineId];
    const currentValue = lineDraft !== undefined ? lineDraft : (item.copiedText || '');
    const wasChecked = item.isChecked;

    const updates = {
      activeLineIndex: index,
      activeLineValue: currentValue,
      activeLineCursor: currentValue.length,
      isTextareaFocused: true
    };

    if (wasChecked) {
      this.lineDrafts[item.lineId] = currentValue;
      updates[`lineInputs[${index}].isChecked`] = false;
      updates[`lineInputs[${index}].guideSegments`] = buildGuideSegments(item.sourceText, currentValue, false, true);
    }

    this.setData(updates);
    this.positionTextarea(item.lineId, () => {
      setTimeout(() => { this.scrollToLine(item.lineId); }, 50);
    });
  },

  handleRowTap(event) {
    const { index } = event.currentTarget.dataset;
    const { isCompleted } = this.data;

    if (isCompleted) {
      return;
    }

    this.activateLine(Number(index));
  },

  saveCurrentLine() {
    const { activeLineIndex, lineInputs, currentDate, activeLineValue } = this.data;
    if (activeLineIndex < 0 || activeLineIndex >= lineInputs.length) {
      return;
    }

    const item = lineInputs[activeLineIndex];
    if (!item) {
      return;
    }

    const value = activeLineValue;
    this.lineDrafts[item.lineId] = value;

    const checkedMap = getCheckedMap(lineInputs);
    const record = updateDailyCopyEntry(currentDate, item.lineId, value);
    const nextInputs = decorateLineInputs(record.copyEntries || [], checkedMap, -1);

    this.syncDrafts(nextInputs);

    this.setData({
      record,
      lineInputs: nextInputs,
      savingLineId: ''
    });
  },

  handleTextareaBlur() {
    this.saveCurrentLine();

    this.setData({
      activeLineIndex: -1,
      activeLineValue: '',
      activeLineCursor: 0,
      isTextareaFocused: false
    });
  },

  handleTextareaInput(event) {
    const { activeLineIndex, lineInputs, isCompleted } = this.data;
    if (isCompleted || activeLineIndex < 0) {
      return;
    }

    const value = event.detail.value;
    const item = lineInputs[activeLineIndex];
    if (!item) {
      return;
    }

    this.lineDrafts[item.lineId] = value;

    const nextGuideSegments = buildGuideSegments(item.sourceText, value, false, true);

    this.setData({
      activeLineValue: value,
      [`lineInputs[${activeLineIndex}].copiedText`]: value,
      [`lineInputs[${activeLineIndex}].isChecked`]: false,
      [`lineInputs[${activeLineIndex}].guideSegments`]: nextGuideSegments
    });
  },

  handleTextareaConfirm() {
    const { activeLineIndex, lineInputs, currentDate, activeLineValue } = this.data;
    if (activeLineIndex < 0) {
      return;
    }

    const item = lineInputs[activeLineIndex];
    if (!item) {
      return;
    }

    const value = activeLineValue;
    this.lineDrafts[item.lineId] = value;

    const checkedMap = getCheckedMap(lineInputs);
    checkedMap[item.lineId] = true;

    const record = updateDailyCopyEntry(currentDate, item.lineId, value);
    const nextInputs = decorateLineInputs(record.copyEntries || [], checkedMap, -1);

    this.syncDrafts(nextInputs);

    const nextIndex = activeLineIndex + 1;
    const nextItem = nextInputs[nextIndex];

    let targetIndex = -1;
    if (nextItem && !nextItem.isChecked) {
      targetIndex = nextIndex;
    } else {
      const furtherNext = nextInputs.findIndex((li, i) => i > activeLineIndex && !li.isChecked);
      if (furtherNext >= 0) {
        targetIndex = furtherNext;
      }
    }

    if (targetIndex >= 0) {
      const targetItem = nextInputs[targetIndex];
      const targetDraft = this.lineDrafts[targetItem.lineId];
      const targetValue = targetDraft !== undefined ? targetDraft : (targetItem.copiedText || '');

      nextInputs[targetIndex].guideSegments = buildGuideSegments(targetItem.sourceText, targetValue, false, true);

      this.setData({
        record,
        lineInputs: nextInputs,
        savingLineId: '',
        activeLineIndex: targetIndex,
        activeLineValue: targetValue,
        activeLineCursor: targetValue.length,
        isTextareaFocused: true,
        animatedLineId: targetItem.lineId
      });

      this.positionTextarea(targetItem.lineId);
      this.animateLine(targetItem.lineId);
      setTimeout(() => { this.scrollToLine(targetItem.lineId); }, 30);
    } else {
      this.setData({
        record,
        lineInputs: nextInputs,
        savingLineId: '',
        activeLineIndex: -1,
        activeLineValue: '',
        activeLineCursor: 0,
        isTextareaFocused: false
      });
    }
  },

  handleSave() {
    const { currentDate, lineInputs, isCompleted, activeLineIndex, activeLineValue } = this.data;

    if (isCompleted) {
      wx.showToast({
        title: '今天已完成',
        icon: 'none'
      });
      return;
    }

    if (activeLineIndex >= 0) {
      this.lineDrafts[lineInputs[activeLineIndex].lineId] = activeLineValue;
    }

    let record = null;
    lineInputs.forEach((item) => {
      const value = this.lineDrafts[item.lineId] !== undefined ? this.lineDrafts[item.lineId] : item.copiedText || '';
      record = updateDailyCopyEntry(currentDate, item.lineId, value);
    });

    const checkedMap = getCheckedMap(lineInputs);
    const nextInputs = decorateLineInputs(record ? record.copyEntries || [] : lineInputs, checkedMap, -1);

    this.syncDrafts(nextInputs);

    this.setData({
      record,
      lineInputs: nextInputs,
      savingLineId: ''
    });

    wx.showToast({
      title: '已保存',
      icon: 'success'
    });
  },

  handleComplete() {
    const { currentDate, activeLineIndex, activeLineValue, lineInputs } = this.data;

    if (activeLineIndex >= 0) {
      this.lineDrafts[lineInputs[activeLineIndex].lineId] = activeLineValue;
    }

    lineInputs.forEach((item) => {
      const value = this.lineDrafts[item.lineId] !== undefined ? this.lineDrafts[item.lineId] : item.copiedText || '';
      updateDailyCopyEntry(currentDate, item.lineId, value);
    });

    const result = completeDailyRecord(currentDate);

    if (!result.ok) {
      wx.showToast({
        title: result.message,
        icon: 'none'
      });
      return;
    }

    const nextInputs = decorateLineInputs(result.record.copyEntries || [], getCheckedMap(this.data.lineInputs), -1);

    this.syncDrafts(nextInputs);

    this.setData({
      record: result.record,
      lineInputs: nextInputs,
      activeLineIndex: -1,
      activeLineValue: '',
      activeLineCursor: 0,
      isTextareaFocused: false,
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
