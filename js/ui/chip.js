/**
 * chip.js - 재료, 그램, 이모지 칩 UI 생성 함수
 * XSS 방지를 위해 모든 텍스트는 textContent로 렌더링
 */

export function createIngredientChip(ingredient, isSelected = false, onClick = null) {
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = `chip ${isSelected ? 'chip-selected' : ''}`;

  const dot = document.createElement('span');
  dot.className = 'chip-dot';
  dot.style.backgroundColor = ingredient.color || '#4DB6AC';

  const label = document.createElement('span');
  label.textContent = ingredient.name;

  chip.appendChild(dot);
  chip.appendChild(label);

  if (onClick) {
    chip.onclick = (e) => {
      e.preventDefault();
      onClick(ingredient);
    };
  }

  return chip;
}

export function createGramChip(grams, isSelected = false, onClick = null) {
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = `chip ${isSelected ? 'chip-selected' : ''}`;

  const label = document.createElement('span');
  label.textContent = `${grams}g`;

  chip.appendChild(label);

  if (onClick) {
    chip.onclick = (e) => {
      e.preventDefault();
      onClick(grams);
    };
  }

  return chip;
}

export function createEmojiChip(emoji, labelText, isSelected = false, onClick = null) {
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = `chip ${isSelected ? 'chip-selected' : ''}`;

  const em = document.createElement('span');
  em.textContent = emoji;

  const txt = document.createElement('span');
  txt.textContent = labelText;

  chip.appendChild(em);
  chip.appendChild(txt);

  if (onClick) {
    chip.onclick = (e) => {
      e.preventDefault();
      onClick(emoji, labelText);
    };
  }

  return chip;
}

export function createTagChip(tagText, isSelected = false, onClick = null) {
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = `chip ${isSelected ? 'chip-selected' : ''}`;

  const txt = document.createElement('span');
  txt.textContent = tagText;

  chip.appendChild(txt);

  if (onClick) {
    chip.onclick = (e) => {
      e.preventDefault();
      onClick(tagText);
    };
  }

  return chip;
}
