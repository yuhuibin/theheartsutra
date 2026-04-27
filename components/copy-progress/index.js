Component({
  properties: {
    completed: {
      type: Number,
      value: 0
    },
    total: {
      type: Number,
      value: 0
    },
    status: {
      type: String,
      value: 'in_progress'
    }
  },
  data: {
    percent: 0
  },
  observers: {
    'completed,total': function (completed, total) {
      const percent = total ? Math.round((completed / total) * 100) : 0;
      this.setData({ percent });
    }
  }
});
