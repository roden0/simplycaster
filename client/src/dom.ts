export function el<K extends keyof HTMLElementTagNameMap>(tag: K, text = ""): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.textContent = text;
  return e;
}
