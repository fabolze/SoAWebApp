// static/js/visible_if.js
(() => {
    const parseCondition = (condition) => {
      const match = condition.match(/(.+?)\\s+(=|!=|in|not in)\\s+(\\[.*?\\]|[^\\[]+)/);
      if (!match) return () => true;
      const [, field, op, raw] = match.map(s => s.trim());
      const val = raw.startsWith('[') ? JSON.parse(raw.replace(/'/g, '"')) : raw;
      return () => {
        const actual = document.querySelector(`[name="${field}"]`)?.value;
        if (op === '=') return actual === val;
        if (op === '!=') return actual !== val;
        if (op === 'in')  return Array.isArray(val) && val.includes(actual);
        if (op === 'not in') return Array.isArray(val) && !val.includes(actual);
        return true;
      };
    };
  
    const updateVisibility = () => {
      document.querySelectorAll('[data-visible-if]').forEach(el => {
        const visible = parseCondition(el.dataset.visibleIf)();
        el.style.display = visible ? '' : 'none';
      });
    };
  
    document.addEventListener('input', updateVisibility, true);
    document.addEventListener('DOMContentLoaded', updateVisibility);
  })();
  