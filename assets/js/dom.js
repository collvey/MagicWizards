/** Small DOM helpers. Everything user-supplied goes in as text, never as HTML. */

export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'style' && typeof value === 'object') setStyle(node, value);
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === 'text') node.textContent = value;
    else node.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

/**
 * Applies a style object. Custom properties need setProperty — assigning them
 * onto the style object silently does nothing, which is how the mana colours
 * driving every spine and pip get set.
 */
function setStyle(node, styles) {
  for (const [prop, value] of Object.entries(styles)) {
    if (prop.startsWith('--')) node.style.setProperty(prop, value);
    else node.style[prop] = value;
  }
}

export function frag(...children) {
  const f = document.createDocumentFragment();
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    f.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return f;
}

export function clear(node) {
  node.replaceChildren();
  return node;
}

/** Marks children for the staggered load-in defined in app.css. */
export function stagger(container, mode = 'stagger') {
  container.dataset.animate = mode;
  [...container.children].forEach((child, i) => child.style.setProperty('--i', i));
  return container;
}
