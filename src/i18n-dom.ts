import { AR, PATTERNS } from './i18n';
import { names } from './i18n-ar';
import { useSettings } from './state/settings';

/**
 * Arabic for text the components still write in English: every text node and tooltip is
 * looked up in the same dictionary as t(). Text is changed in place (never re-parented),
 * so React keeps owning its nodes; when React writes English again, it is translated again.
 * shortcut: lookup by rendered English text; move a string to t() if it ever needs plural or gender forms.
 */
const ATTRS = ['title', 'aria-label', 'placeholder', 'alt'];
const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
export function lookup(raw: string): string | null {
  const k = norm(raw);
  if (!k || !/[A-Za-z]/.test(k)) return null;
  const hit = AR[k];
  if (hit !== undefined) return hit;
  for (const [re, to] of PATTERNS) if (re.test(k)) return k.replace(re, (...m) => to.replace(/\$(\d)/g, (_, i) => lookup(m[+i]) ?? names(m[+i])));
  return null;
}
function text(n: Text) {
  const v = n.nodeValue ?? '';
  const ar = lookup(v);
  if (ar !== null) n.nodeValue = v.replace(/^(\s*)[\s\S]*?(\s*)$/, `$1${ar.replace(/\$/g, '$$$$')}$2`);
}
function attrs(e: Element) {
  for (const a of ATTRS) {
    const v = e.getAttribute(a);
    const ar = v && lookup(v);
    if (ar) e.setAttribute(a, ar);
  }
}
function walk(root: Node) {
  if (root.nodeType === 3) return text(root as Text);
  if (root.nodeType !== 1) return;
  const el = root as Element;
  if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE' || el.tagName === 'CANVAS') return;
  attrs(el);
  for (const c of Array.from(el.childNodes)) walk(c);
}
const obs = new MutationObserver((list) => {
  for (const m of list) {
    if (m.type === 'characterData') text(m.target as Text);
    else if (m.type === 'attributes') attrs(m.target as Element);
    else m.addedNodes.forEach(walk);
  }
});
function sync() {
  obs.disconnect();
  if (useSettings.getState().lang !== 'ar') return;
  walk(document.body);
  obs.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
}
let last = useSettings.getState().lang;
useSettings.subscribe((s) => {
  if (s.lang !== last) {
    last = s.lang;
    sync();
  }
});
sync();

/** Development aid: English still on screen, to add to the dictionary. */
if (import.meta.env.DEV)
  Object.assign(window, {
    __untranslated: () => {
      const out = new Set<string>();
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = w.nextNode(); n; n = w.nextNode()) {
        const k = norm(n.nodeValue ?? '');
        const p = n.parentElement;
        if (/[A-Za-z]{3}/.test(k) && p && !p.closest('script,style')) out.add(k);
      }
      document.querySelectorAll('[title],[aria-label],[placeholder]').forEach((e) => ATTRS.forEach((a) => { const v = e.getAttribute(a); if (v && /[A-Za-z]{3}/.test(v)) out.add(norm(v)); }));
      return [...out];
    },
  });
