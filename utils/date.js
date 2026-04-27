function pad(value) {
  return String(value).padStart(2, '0');
}

function formatDate(date) {
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate())
  ].join('-');
}

function formatDateTime(date) {
  return [
    formatDate(date),
    [pad(date.getHours()), pad(date.getMinutes()), pad(date.getSeconds())].join(':')
  ].join(' ');
}

function parseDate(value) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }

  const [year, month, day] = String(value).split('-').map(Number);
  if (!year || !month || !day) {
    return null;
  }

  return new Date(year, month - 1, day);
}

function addDays(date, amount) {
  const base = parseDate(date);
  if (!base) {
    return null;
  }

  const nextDate = new Date(base);
  nextDate.setDate(nextDate.getDate() + amount);
  return nextDate;
}

function addMonths(date, amount) {
  const base = parseDate(date);
  if (!base) {
    return null;
  }

  return new Date(base.getFullYear(), base.getMonth() + amount, 1);
}

function getMonthStart(date) {
  const base = parseDate(date);
  if (!base) {
    return null;
  }

  return new Date(base.getFullYear(), base.getMonth(), 1);
}

function getMonthEnd(date) {
  const base = parseDate(date);
  if (!base) {
    return null;
  }

  return new Date(base.getFullYear(), base.getMonth() + 1, 0);
}

function getWeekdayIndex(date) {
  const base = parseDate(date);
  if (!base) {
    return 0;
  }

  return (base.getDay() + 6) % 7;
}

function getMonthLabel(date) {
  const base = parseDate(date);
  if (!base) {
    return '';
  }

  return `${base.getFullYear()}年${base.getMonth() + 1}月`;
}

function isSameMonth(left, right) {
  const leftDate = parseDate(left);
  const rightDate = parseDate(right);

  if (!leftDate || !rightDate) {
    return false;
  }

  return leftDate.getFullYear() === rightDate.getFullYear()
    && leftDate.getMonth() === rightDate.getMonth();
}

function buildMonthCalendar(date) {
  const anchorDate = parseDate(date) || new Date();
  const monthStart = getMonthStart(anchorDate);
  const monthEnd = getMonthEnd(anchorDate);
  const calendarStart = addDays(monthStart, -getWeekdayIndex(monthStart));
  const calendarEnd = addDays(monthEnd, 6 - getWeekdayIndex(monthEnd));
  const weeks = [];
  let currentWeek = [];

  for (let currentDate = calendarStart; currentDate <= calendarEnd; currentDate = addDays(currentDate, 1)) {
    currentWeek.push({
      date: formatDate(currentDate),
      dayNumber: currentDate.getDate(),
      isCurrentMonth: currentDate.getMonth() === monthStart.getMonth()
    });

    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  }

  return weeks;
}

module.exports = {
  formatDate,
  formatDateTime,
  parseDate,
  addDays,
  addMonths,
  getMonthStart,
  getMonthEnd,
  getWeekdayIndex,
  getMonthLabel,
  isSameMonth,
  buildMonthCalendar
};
