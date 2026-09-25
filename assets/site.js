/* Progressive enhancement: all feature descriptions remain readable without JS. */
(function () {
  'use strict';
  const controls = document.querySelector('.feature-controls');
  if (controls) {
    const buttons = [...controls.querySelectorAll('button')];
    const panels = [...document.querySelectorAll('.feature-panel')];
    function select(button) {
      buttons.forEach(b => b.setAttribute('aria-pressed', String(b === button)));
      panels.forEach(p => { p.hidden = p.id !== button.getAttribute('aria-controls'); });
    }
    buttons.forEach(button => button.addEventListener('click', () => select(button)));
    document.querySelector('.feature-panels').classList.add('enhanced');
    select(buttons[0]);
    controls.hidden = false;
  }
  /* A deposit made after a period's return cannot change that period's TWR. */
  function calculateExample(deposit, initial = 10000, rate = .1) {
    if (![deposit, initial, rate].every(Number.isFinite) || deposit < 0 || initial <= 0 || rate <= -1) {
      throw new RangeError('Invalid illustrative cash flow');
    }
    const beforeDeposit = initial * (1 + rate);
    return { value: beforeDeposit + deposit, gain: beforeDeposit - initial, twr: beforeDeposit / initial - 1 };
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { calculateExample };
  const slider = document.getElementById('demo-deposit');
  if (!slider) return;
  const euro = n => new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
  function update() {
    const deposit = Number(slider.value);
    const result = calculateExample(deposit);
    document.getElementById('demo-deposit-value').textContent = euro(deposit);
    slider.setAttribute('aria-valuetext', euro(deposit));
    document.getElementById('demo-value').textContent = euro(result.value);
    document.getElementById('demo-gain').textContent = euro(result.gain);
    document.getElementById('demo-return').textContent = '+' + (result.twr * 100).toFixed(0) + '%';
    const start = 440 * 10000 / result.value, gain = 440 * result.gain / result.value;
    document.getElementById('bar-start').setAttribute('width', start);
    const gainBar = document.getElementById('bar-gain');
    gainBar.setAttribute('x', start); gainBar.setAttribute('width', gain);
    const depositBar = document.getElementById('bar-deposit');
    depositBar.setAttribute('x', start + gain); depositBar.setAttribute('width', 440 - start - gain);
    document.getElementById('demo-chart-title').textContent = `${euro(10000)} starting value, ${euro(result.gain)} investment gain and ${euro(deposit)} new deposit`;
  }
  slider.addEventListener('input', update); update();
})();
