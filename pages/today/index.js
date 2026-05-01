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

function buildGuideSegments(sourceText, copiedText, isChecked) {
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

      if (isChecked) {
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
    animatedLineId: '',
    isCompleted: false,
    copyFontSize: DEFAULT_COPY_FONT_SIZE,
    copyLineHeight: DEFAULT_COPY_FONT_SIZE + 28,
    activeLineIndex: -1,
    activeLineValue: '',
    isTextareaFocused: false
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
      activeLineIndex: -1,
      activeLineValue: '',
      isTextareaFocused: false,
      isCompleted: record.status === 'completed'
    });
  },

  handleRowTap(event) {
    const { index } = event.currentTarget.dataset;
    const { lineInputs, isCompleted, activeLineIndex } = this.data;

    if (isCompleted) {
      return;
    }

    const item = lineInputs[Number(index)];
    if (!item) {
      return;
    }

    if (activeLineIndex >= 0 && activeLineIndex !== Number(index)) {
      this.saveCurrentLine();
    }

    const lineDraft = this.lineDrafts[item.lineId];
    const currentValue = lineDraft !== undefined ? lineDraft : (item.copiedText || '');

    const updates = {
      activeLineIndex: Number(index),
      activeLineValue: currentValue,
      isTextareaFocused: true
    };

    if (item.isChecked) {
      this.lineDrafts[item.lineId] = currentValue;
      const nextGuideSegments = buildGuideSegments(item.sourceText, currentValue, false);
      updates[`lineInputs[${Number(index)}].isChecked`] = false;
      updates[`lineInputs[${Number(index)}].guideSegments`] = nextGuideSegments;
    }

    this.setData(updates);
    this.scrollToLine(item.lineId);
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
    const nextInputs = decorateLineInputs(record.copyEntries || [], checkedMap);

    this.syncDrafts(nextInputs);

    this.setData({
      record,
      lineInputs: nextInputs,
      savingLineId: ''
    });
  },

  handleTextareaFocus() {
    const { activeLineIndex, lineInputs } = this.data;

    if (activeLineIndex < 0) {
      const firstUnchecked = lineInputs.findIndex((item) => !item.isChecked);
      if (firstUnchecked >= 0) {
        const item = lineInputs[firstUnchecked];
        const lineDraft = this.lineDrafts[item.lineId];
        const currentValue = lineDraft !== undefined ? lineDraft : (item.copiedText || '');

        this.setData({
          activeLineIndex: firstUnchecked,
          activeLineValue: currentValue
        });
      }
    }
  },

  handleTextareaBlur() {
    this.saveCurrentLine();

    this.setData({
      activeLineIndex: -1,
      activeLineValue: '',
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

    const nextGuideSegments = buildGuideSegments(item.sourceText, value, false);
    const hasSameDisplay = !item.isChecked && item.guideSegments.every((seg, segIndex) => {
      const nextSeg = nextGuideSegments[segIndex];
      return seg.className === nextSeg.className && seg.text === nextSeg.text;
    });

    if (hasSameDisplay) {
      this.setData({ activeLineValue: value });
      return;
    }

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
    const nextInputs = decorateLineInputs(record.copyEntries || [], checkedMap);

    const nextIndex = activeLineIndex + 1;
    const nextItem = nextInputs[nextIndex];

    this.syncDrafts(nextInputs);

    if (nextItem && !nextItem.isChecked) {
      const nextDraft = this.lineDrafts[nextItem.lineId];
      const nextValue = nextDraft !== undefined ? nextDraft : (nextItem.copiedText || '');

      this.setData({
        record,
        lineInputs: nextInputs,
        savingLineId: '',
        activeLineIndex: nextIndex,
        activeLineValue: nextValue,
        isTextareaFocused: true,
        animatedLineId: nextItem.lineId
      });

      this.animateLine(nextItem.lineId);
      setTimeout(() => { this.scrollToLine(nextItem.lineId); }, 30);
    } else {
      this.setData({
        record,
        lineInputs: nextInputs,
        savingLineId: '',
        animatedLineId: ''
      });

      const furtherNext = nextInputs.findIndex((li, i) => i > activeLineIndex && !li.isChecked);
      if (furtherNext >= 0) {
        const furtherItem = nextInputs[furtherNext];
        const furtherDraft = this.lineDrafts[furtherItem.lineId];
        const furtherValue = furtherDraft !== undefined ? furtherDraft : (furtherItem.copiedText || '');

        this.setData({
          activeLineIndex: furtherNext,
          activeLineValue: furtherValue,
          isTextareaFocused: true,
          animatedLineId: furtherItem.lineId
        });

        this.animateLine(furtherItem.lineId);
        setTimeout(() => { this.scrollToLine(furtherItem.lineId); }, 30);
      } else {
        this.setData({
          activeLineIndex: -1,
          activeLineValue: '',
          isTextareaFocused: false
        });
      }
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
    const nextInputs = decorateLineInputs(record ? record.copyEntries || [] : lineInputs, checkedMap);

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
      activeLineIndex: -1,
      activeLineValue: '',
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
