const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const context = vm.createContext({ Intl, Date, document: { addEventListener() {} } });
vm.runInContext(fs.readFileSync('view/global/ui.js', 'utf8') + '\n' + fs.readFileSync('view/global/priority.js','utf8') + '\nclass PageController {}\n' + fs.readFileSync('view/calendar/calendar.js', 'utf8') + '\n' + fs.readFileSync('view/progress/progress.js', 'utf8') + '\nthis.api={S,progressRange,progressMoveDate,progressReport,progressSeries,progressLinePath,progressChart,progressDetail,progressPage,ProgressPage};', context);
const { S, progressRange, progressMoveDate, progressReport, progressSeries, progressLinePath, progressChart, progressDetail } = context.api;
const activity = (id, extra = {}) => ({ id, name: `Activity ${id}`, start_date: '2024-02-01', end_date: null, recurrence: 'once', schedule_days: [], category_id: 1, ...extra });
function setup() {
  S.language = 'es';
  S.data = { today: '2024-02-29', categories: [{ id: 1, name: 'Health', color: '#22AABB' }, { id: 2, name: 'Learning', color: '#9977BB' }], category_catalog: [], habits: [], completions: [], calendar: { tasks: [], completions: [] } };
  S.progress = null;
}
test('calendar periods, leap years, week boundaries and month navigation', () => {
  setup();
  assert.deepEqual({ ...progressRange('week', '2025-01-01') }, { start: '2024-12-30', end: '2025-01-05' });
  assert.equal(progressRange('month', '2024-02-19').end, '2024-02-29');
  assert.equal(progressRange('month', '2025-02-19').end, '2025-02-28');
  assert.equal(progressMoveDate('month', '2024-01-31', 1), '2024-02-01');
  assert.equal(progressMoveDate('year', '2024-02-29', 1), '2025-01-01');
  assert.equal(progressMoveDate('day', '2024-12-31', 1), '2025-01-01');
  assert.equal(progressReport('month', '2024-02-01').buckets.length, 29);
  assert.equal(progressReport('year', '2024-02-01').buckets.length, 12);
});
test('each line uses its own category denominator while period totals remain weighted', () => {
  setup();
  S.data.calendar.tasks = Array.from({ length: 5 }, (_, i) => activity(i + 1, { category_id: i < 2 ? 1 : 2 }));
  S.data.calendar.completions = [1, 2, 3].map(task_id => ({ task_id, completed_on: '2024-02-01' }));
  const report = progressReport('week', '2024-02-01');
  assert.equal(report.total, 5); assert.equal(report.completed, 3); assert.equal(report.percent, 60);
  assert.equal(report.buckets.find(b => b.key === '2024-02-01').percent, 60);
  assert.equal(progressReport('day', '2024-02-01').buckets.length, 1);
  const filtered = progressReport('week', '2024-02-01', '2');
  assert.equal(filtered.total, 3); assert.equal(filtered.percent, 33);
  const lines = progressSeries(report);
  const health = lines.find(line => line.key === '1').points.find(Boolean);
  const learning = lines.find(line => line.key === '2').points.find(Boolean);
  assert.equal(health.percent, 100); assert.equal(health.y, 0);
  assert.equal(learning.percent, 33); assert.ok(Math.abs(learning.y - 180) < 0.001);
  const html = progressChart(report, { period: 'week' }, report.buckets[3]);
  assert.ok(html.includes('progress-line-svg')); assert.ok(!html.includes('progress-bar-track'));
});
test('period totals are weighted by activities; future and empty periods do not imply failure', () => {
  setup();
  S.data.today = '2024-02-02';
  S.data.calendar.tasks = [activity(1), ...Array.from({ length: 9 }, (_, i) => activity(i + 2, { start_date: '2024-02-02' })), activity(20, { start_date: '2024-02-03' })];
  S.data.calendar.completions = [{ task_id: 1, completed_on: '2024-02-01' }, { task_id: 2, completed_on: '2024-02-02' }];
  const report = progressReport('year', '2024-02-01');
  assert.equal(report.total, 10); assert.equal(report.percent, 20); assert.equal(report.pending, 8);
  assert.equal(report.buckets[1].percent, 20); assert.equal(report.buckets[2].future, true);
  assert.equal(report.buckets[0].percent, null);
  assert.equal(progressReport('day', '2024-02-03').percent, null);
});
test('habits require their recorded goal, exclude viewers, and preserve recorded archived days', () => {
  setup();
  S.data.habits = [
    activity(1, { recurrence: 'daily', permission: 'owner', status: 'active', goal: 1 }),
    activity(2, { permission: 'viewer', status: 'active' }),
    activity(3, { permission: 'participant', status: 'active', tracking_start: '2024-02-02', recurrence: 'daily' }),
    activity(4, { permission: 'owner', status: 'archived', recurrence: 'daily' }),
  ];
  S.data.completions = [{ habit_id: 1, completed_on: '2024-02-01', amount: 2, goal_at_time: 5 }, { habit_id: 4, completed_on: '2024-02-01', amount: 1, goal_at_time: 1 }];
  const day = progressReport('day', '2024-02-01');
  assert.equal(day.total, 2); assert.equal(day.completed, 1); assert.equal(day.percent, 50);
  const next = progressReport('day', '2024-02-02');
  assert.equal(next.total, 2); assert.equal(next.completed, 0);
});
test('uncategorized tasks and shared categories are included; recurrence and detail totals match', () => {
  setup();
  S.data.calendar.tasks = [activity(1, { category_id: null }), activity(2, { name: '<img src=x onerror=alert(1)>', recurrence: 'monthly', start_date: '2024-01-31', category_id: 2 })];
  S.data.habits = [activity(1, { category_id: 99, category_name: 'Shared <category>', color: '#123456', permission: 'participant', status: 'active', recurrence: 'weekly', schedule_days: [1, 3, 5] })];
  S.data.calendar.completions = [{ task_id: 2, completed_on: '2024-02-29' }];
  const report = progressReport('year', '2024-02-01');
  assert.ok(report.categories.some(c => c.key === 'none'));
  assert.equal(report.categoryStats.find(c => c.key === '99').color, '#123456');
  const feb = report.buckets[1];
  assert.equal(feb.total, 14); assert.equal(feb.completed, 1);
  const detail = progressDetail(feb);
  assert.ok(detail.includes('&lt;img')); assert.ok(!detail.includes('<img'));
  assert.ok(detail.includes('0 / 12')); assert.ok(detail.includes('Shared &lt;category&gt;'));
  assert.equal(progressReport('day', '2024-02-29', '2').percent, 100);
});
test('empty data and malicious category labels render safely', () => {
  setup();
  const empty = progressReport('day', '2024-02-01');
  assert.equal(empty.percent, null); assert.match(progressChart(empty, { period: 'day' }), /progress-empty/);
  S.data.calendar.tasks = [activity(1)];
  S.data.categories[0].name = '<script>bad()</script>';
  S.data.categories[0].color = 'red;position:fixed';
  const report = progressReport('day', '2024-02-01');
  assert.equal(report.categories[0].color, '#B8A4D4');
  const html = progressChart(report, { period: 'day' }, report.buckets[0]);
  assert.ok(html.includes('&lt;script&gt;')); assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('NaN')); assert.ok(!html.includes('Infinity'));
});
test('100 percent is reserved for finishing every scheduled activity', () => {
  setup();
  S.data.calendar.tasks = Array.from({ length: 200 }, (_, i) => activity(i + 1));
  S.data.calendar.completions = Array.from({ length: 199 }, (_, i) => ({ task_id: i + 1, completed_on: '2024-02-01' }));
  assert.equal(progressReport('day', '2024-02-01').percent, 99);
  S.data.calendar.completions.push({ task_id: 200, completed_on: '2024-02-01' });
  assert.equal(progressReport('day', '2024-02-01').percent, 100);
});

test('lines stop at unscheduled or future dates, retain zero values, and show isolated points', () => {
  setup(); S.data.today = '2024-02-03';
  S.data.calendar.tasks = [activity(1), activity(2, { start_date:'2024-02-03' }), activity(3, { start_date:'2024-02-04' })];
  S.data.calendar.completions = [{ task_id:1, completed_on:'2024-02-01' }];
  const report = progressReport('week', '2024-02-01');
  const line = progressSeries(report)[0];
  assert.equal(line.points[3].percent, 100);
  assert.equal(line.points[4], null);
  assert.equal(line.points[5].percent, 0);
  assert.equal(line.points[5].y, 270);
  assert.equal(line.points[6], null);
  assert.equal((progressLinePath(line.points).match(/M/g) || []).length, 2);
  assert.ok(!progressLinePath(line.points).includes('C'));
  assert.equal((progressChart(report, {period:'week'}, report.buckets[3]).match(/data-action="progress-point"/g) || []).length, 2);
});
test('daily points reflect scheduled hours and keep untimed activities separate', () => {
  setup();
  S.data.calendar.tasks = [activity(1, {scheduled_time:'18:30:00'}), activity(2, {scheduled_time:'09:00:00'}), activity(3), activity(4, {scheduled_time:'09:00:00',category_id:2})];
  S.data.calendar.completions = [{task_id:2,completed_on:'2024-02-01'}];
  const report = progressReport('day', '2024-02-01');
  assert.deepEqual(Array.from(report.buckets, b=>b.key), ['09:00','18:30','untimed']);
  assert.equal(report.total, 4);
  const lines = progressSeries(report);
  assert.equal(lines[0].points[0].percent, 100);
  assert.equal(lines[0].points[1].percent, 0);
  assert.equal(lines[0].points[2].percent, 0);
  assert.equal(lines[1].points[0].percent, 0);
  assert.equal(lines[1].points[1], null);
  assert.equal(lines[1].points[2], null);
  assert.equal((progressLinePath(lines[0].points).match(/C/g) || []).length, 2);
});

test('rounded curves pass through real points and never overshoot peaks, plateaus or 0–100 percent', () => {
  for (const ys of [[0,270,0,270],[270,135,0,0,135],[10,20,250,260],[270,270,270],[0,0,0]]) {
    const points=ys.map((y,i)=>({x:i*100+25,y}));
    const path=progressLinePath(points);
    const curves=[...path.matchAll(/C([\d., -]+)/g)].map(match=>match[1].trim().split(/[ ,]+/).map(Number));
    assert.equal(curves.length,points.length-1);
    curves.forEach(([x1,y1,x2,y2,x3,y3],index)=>{
      const from=points[index],to=points[index+1];
      assert.equal(x3,to.x); assert.equal(y3,to.y);
      assert.ok(x1>from.x && x2<x3 && x1<=x2);
      for(let step=0;step<=100;step++) {
        const t=step/100,u=1-t;
        const y=u*u*u*from.y+3*u*u*t*y1+3*u*t*t*y2+t*t*t*y3;
        assert.ok(y>=Math.min(from.y,to.y)-0.001 && y<=Math.max(from.y,to.y)+0.001,`overshoot: ${y}`);
      }
    });
  }
});
