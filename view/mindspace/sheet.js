'use strict';

// A small spreadsheet evaluator. Cell contents are data; no JavaScript is executed.
class MindSpaceSheet {
  static templates = ['ledger', 'budget', 'inventory', 'projects', 'blank'];
  static calculated(sheet) { return ({ledger:'F', budget:'D', inventory:'E'})[sheet.template] || null; }
  static locked(sheet, key) {
    if (!sheet.template) return false;
    const [row, col] = this.address(key), width = ({ledger:6, budget:4, inventory:5, projects:6})[sheet.template] || 0;
    return row === 0 ? col < width : this.column(col) === this.calculated(sheet);
  }
  static prepare(sheet) {
    for (let row = 2; row <= sheet.rows; row++) {
      if (sheet.template === 'ledger') sheet.cells[`F${row}`] = `=SUM(D2:D${row})-SUM(E2:E${row})`;
      if (sheet.template === 'budget') sheet.cells[`D${row}`] = `=B${row}-C${row}`;
      if (sheet.template === 'inventory') sheet.cells[`E${row}`] = `=C${row}*D${row}`;
    }
  }
  static month(raw) {
    const source = String(raw || '').trim();
    const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(source), local = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(source);
    if (!iso && !local) return null;
    const [year, month, day] = iso ? iso.slice(1).map(Number) : [Number(local[3]), Number(local[2]), Number(local[1])];
    const date = new Date(Date.UTC(year, month - 1, day));
    if (year < 1000 || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
    return { key:`${year}-${String(month).padStart(2, '0')}`, month, year };
  }
  static column(index) {
    let name = '';
    for (let value = index + 1; value; value = Math.floor((value - 1) / 26)) name = String.fromCharCode(65 + (value - 1) % 26) + name;
    return name;
  }

  static address(key) {
    const match = /^([A-Z]+)([1-9]\d*)$/.exec(key);
    if (!match) throw new Error('#REF!');
    return [Number(match[2]) - 1, [...match[1]].reduce((n, letter) => n * 26 + letter.charCodeAt(0) - 64, 0) - 1];
  }

  constructor(sheet) { this.sheet = sheet; this.cache = new Map(); this.visiting = new Set(); }

  value(key) {
    if (this.cache.has(key)) return this.cache.get(key);
    const [row, col] = MindSpaceSheet.address(key);
    if (row >= this.sheet.rows || col >= this.sheet.columns) throw new Error('#REF!');
    if (this.visiting.has(key) || this.visiting.size > 100) throw new Error('#CYCLE!');
    const raw = this.sheet.cells?.[key] || '';
    const ledgerBalance = this.sheet.template === 'ledger' && col === 5 && row > 0;
    if (!ledgerBalance && !raw.startsWith('=')) return raw.trim() !== '' && Number.isFinite(Number(raw)) ? Number(raw) : raw;
    this.visiting.add(key);
    try {
      const result = ledgerBalance ? (this.moneyColumn('D', row + 1) - this.moneyColumn('E', row + 1)) / 100 : this.formula(raw.slice(1));
      if (ledgerBalance && !Number.isSafeInteger(Math.round(result * 100))) throw new Error('#NUM!');
      if (!Number.isFinite(result)) throw new Error('#NUM!');
      this.cache.set(key, result);
      return result;
    } finally { this.visiting.delete(key); }
  }

  display(key) {
    try {
      const [row, col] = MindSpaceSheet.address(key);
      if (row > 0 && MindSpaceSheet.column(col) === MindSpaceSheet.calculated(this.sheet)) {
        if (!Array.from({length:col}, (_,i) => this.sheet.cells[`${MindSpaceSheet.column(i)}${row + 1}`]?.trim()).some(Boolean)) return '';
        const value = this.value(key);
        return this.sheet.template === 'ledger' ? value.toFixed(2) : String(Number(value.toPrecision(12)));
      }
      const value = this.value(key); return typeof value === 'number' ? String(Number(value.toPrecision(12))) : value;
    }
    catch (error) { return error.message.startsWith('#') ? error.message : '#ERROR!'; }
  }

  moneyColumn(column, end = this.sheet.rows) {
    let cents = 0;
    for (let row = 2; row <= end; row++) {
      const value = this.value(`${column}${row}`);
      if (value === '' || (typeof value === 'string' && !value.trim())) continue;
      if (typeof value !== 'number') throw new Error('#VALUE!');
      const amount = Math.sign(value) * Math.round((Math.abs(value) + Number.EPSILON) * 100);
      if (!Number.isSafeInteger(amount) || !Number.isSafeInteger(cents + amount)) throw new Error('#NUM!');
      cents += amount;
    }
    return cents;
  }
  ledgerSummary() {
    const result = {};
    for (const [name, column] of [['income', 'D'], ['expense', 'E']]) {
      try { result[name] = this.moneyColumn(column); }
      catch (error) { result[name] = error.message.startsWith('#') ? error.message : '#ERROR!'; }
    }
    result.balance = typeof result.income === 'number' && typeof result.expense === 'number' ? result.income - result.expense : '#VALUE!';
    if (typeof result.balance === 'number' && !Number.isSafeInteger(result.balance)) result.balance = '#NUM!';
    return result;
  }

  formula(source) {
    const tokens = source.toUpperCase().match(/\d+(?:\.\d*)?(?:E[+-]?\d+)?|\.\d+|[A-Z]+[1-9]\d*|[A-Z]+|[^\s]/g) || [];
    let cursor = 0;
    const numeric = value => {
      if (value === '') return 0;
      if (typeof value !== 'number') throw new Error('#VALUE!');
      return value;
    };
    const take = token => { if (tokens[cursor++] !== token) throw new Error('#ERROR!'); };
    const expression = () => {
      let value = product();
      while (['+', '-'].includes(tokens[cursor])) { const op = tokens[cursor++], right = product(); value = op === '+' ? value + right : value - right; }
      return value;
    };
    const product = () => {
      let value = atom();
      while (['*', '/'].includes(tokens[cursor])) {
        const op = tokens[cursor++], right = atom();
        if (op === '/' && right === 0) throw new Error('#DIV/0!');
        value = op === '*' ? value * right : value / right;
      }
      return value;
    };
    const atom = () => {
      const token = tokens[cursor++];
      if (token === '+' || token === '-') return (token === '-' ? -1 : 1) * atom();
      if (token === '(') { const value = expression(); take(')'); return value; }
      if (token && /^(?:\d|\.)/.test(token)) return Number(token);
      if (token && /^[A-Z]+[1-9]\d*$/.test(token)) return numeric(this.value(token));
      const name = ({ SUMA: 'SUM', PROMEDIO: 'AVERAGE', CONTAR: 'COUNT' })[token] || token;
      if (!['SUM', 'AVERAGE', 'MIN', 'MAX', 'COUNT'].includes(name)) throw new Error('#NAME?');
      take('(');
      const values = [];
      while (tokens[cursor] !== ')') {
        if (!tokens[cursor]) throw new Error('#ERROR!');
        if (/^[A-Z]+[1-9]\d*$/.test(tokens[cursor]) && tokens[cursor + 1] === ':') {
          const start = MindSpaceSheet.address(tokens[cursor]); cursor += 2;
          const end = MindSpaceSheet.address(tokens[cursor++]);
          if (end[0] >= this.sheet.rows || end[1] >= this.sheet.columns || start[0] >= this.sheet.rows || start[1] >= this.sheet.columns) throw new Error('#REF!');
          for (let row = Math.min(start[0], end[0]); row <= Math.max(start[0], end[0]); row++)
            for (let col = Math.min(start[1], end[1]); col <= Math.max(start[1], end[1]); col++) values.push(this.value(`${MindSpaceSheet.column(col)}${row + 1}`));
        } else values.push(expression());
        if (![',', ';'].includes(tokens[cursor])) break;
        cursor++;
      }
      take(')');
      const numbers = values.filter(value => typeof value === 'number');
      if (name === 'COUNT') return numbers.length;
      if (name === 'SUM') return numbers.reduce((a, b) => a + b, 0);
      if (!numbers.length) return 0;
      if (name === 'AVERAGE') return numbers.reduce((a, b) => a + b, 0) / numbers.length;
      return name === 'MIN' ? Math.min(...numbers) : Math.max(...numbers);
    };
    if (tokens.length > 600) throw new Error('#ERROR!');
    const value = expression();
    if (cursor !== tokens.length) throw new Error('#ERROR!');
    return value;
  }
}
