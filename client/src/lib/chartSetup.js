import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler
);

const originalColours = new WeakMap();
const originalLineStyles = new WeakMap();
const lineStyleKeys = [
  'borderColor', 'backgroundColor', 'pointBackgroundColor',
  'pointBorderColor', 'pointHoverBackgroundColor',
];
const nightLineColours = ['#b49aff', '#e3a2d4', '#75d6ee', '#7ad9b9'];

ChartJS.register({
  id: 'heatsafeTheme',
  beforeUpdate(chart) {
    const options = chart.options;
    if (!originalColours.has(chart)) {
      originalColours.set(chart, {
        legend: options.plugins?.legend?.labels?.color,
        axes: Object.fromEntries(Object.entries(options.scales || {}).map(([axis, scale]) => [axis, {
          ticks: scale.ticks?.color,
          grid: scale.grid?.color,
          title: scale.title?.color,
        }])),
      });
    }
    const dark = document.documentElement.dataset.theme === 'dark' &&
      !chart.canvas.closest('.print-only') && !window.matchMedia('print').matches;
    const original = originalColours.get(chart);
    if (options.plugins?.legend?.labels) {
      options.plugins.legend.labels.color = dark ? '#c6c0da' : original.legend;
    }
    for (const [axis, scale] of Object.entries(options.scales || {})) {
      if (scale.ticks) scale.ticks.color = dark ? '#b9b4cb' : original.axes[axis]?.ticks;
      if (scale.grid) scale.grid.color = dark ? '#39354b' : original.axes[axis]?.grid;
      if (scale.title) scale.title.color = dark ? '#d1cbe2' : original.axes[axis]?.title;
    }
    if (chart.config.type === 'line') {
      chart.data.datasets.forEach((dataset, index) => {
        if (!originalLineStyles.has(dataset)) {
          originalLineStyles.set(dataset, Object.fromEntries(lineStyleKeys.map(key => [key, {
            present: Object.prototype.hasOwnProperty.call(dataset, key),
            value: dataset[key],
          }])));
        }
        const saved = originalLineStyles.get(dataset);
        if (dark) {
          const colour = nightLineColours[index % nightLineColours.length];
          dataset.borderColor = colour;
          dataset.backgroundColor = dataset.fill ? colour + '20' : colour;
          dataset.pointBackgroundColor = colour;
          dataset.pointBorderColor = colour;
          dataset.pointHoverBackgroundColor = '#f5eeff';
        } else {
          for (const key of lineStyleKeys) {
            if (saved[key].present) dataset[key] = saved[key].value;
            else delete dataset[key];
          }
        }
      });
    }
  },
});

const updateCharts = () => Object.values(ChartJS.instances).forEach(chart => chart.update('none'));
new MutationObserver(updateCharts).observe(document.documentElement, {
  attributes: true,
  attributeFilter: ['data-theme'],
});
window.addEventListener('beforeprint', updateCharts);
window.addEventListener('afterprint', updateCharts);
