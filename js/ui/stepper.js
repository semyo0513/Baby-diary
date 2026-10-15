/**
 * stepper.js - 수량/그램 증감 스텝퍼 컴포넌트
 */

export function createStepper({ value = 30, min = 0, max = 500, step = 5, unit = 'g', onChange = null }) {
  let currentValue = value;

  const wrap = document.createElement('div');
  wrap.className = 'stepper-wrap';

  const minusBtn = document.createElement('button');
  minusBtn.type = 'button';
  minusBtn.className = 'stepper-btn';
  minusBtn.textContent = '−';

  const display = document.createElement('span');
  display.className = 'stepper-value';
  display.textContent = `${currentValue}${unit}`;

  const plusBtn = document.createElement('button');
  plusBtn.type = 'button';
  plusBtn.className = 'stepper-btn';
  plusBtn.textContent = '＋';

  function update() {
    display.textContent = `${currentValue}${unit}`;
    if (onChange) onChange(currentValue);
  }

  minusBtn.onclick = (e) => {
    e.preventDefault();
    if (currentValue - step >= min) {
      currentValue -= step;
      update();
    }
  };

  plusBtn.onclick = (e) => {
    e.preventDefault();
    if (currentValue + step <= max) {
      currentValue += step;
      update();
    }
  };

  wrap.appendChild(minusBtn);
  wrap.appendChild(display);
  wrap.appendChild(plusBtn);

  wrap.setValue = (newVal) => {
    currentValue = Math.min(max, Math.max(min, newVal));
    update();
  };

  wrap.getValue = () => currentValue;

  return wrap;
}
