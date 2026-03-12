
(function () {
if (window.__xf) return;
window.__xf = true;
var on = false, box = null;

function wq(s) {
  if (!s) return "''";
  if (s.indexOf("'") === -1) return "'" + s + "'";
  if (s.indexOf('"') === -1) return '"' + s + '"';
  return "concat('" + s.replace(/'/g, "',\"'\",'") + "')";
}

function countMatches(xpath) {
  try {
    return document.evaluate("count(" + xpath + ")", document, null, XPathResult.NUMBER_TYPE, null).numberValue;
  } catch (e) { return 999; }
}

function gen(el) {
  if (!el || !el.tagName) return [];
  var t = el.tagName.toLowerCase(), r = [];
  var txt = "";
  try { txt = (el.textContent || "").trim(); } catch (e) {}
  if (txt.length > 50) txt = "";

  // Lightning custom element (tag has a dash like lightning-button, c-my-component)
  if (t.indexOf("-") > 0) {
    var custAttrs = ["data-id", "data-name", "data-label", "data-tracking-type", "aria-label", "title", "name", "class"];
    custAttrs.forEach(function (a) {
      var v = el.getAttribute(a);
      if (!v || v.length > 80) return;
      if (a === "class") {
        var cls = v.trim().split(/\s+/)[0];
        if (cls && cls.length > 3) r.push("//" + t + "[contains(@class," + wq(cls) + ")]");
      } else {
        r.push("//" + t + "[@" + a + "=" + wq(v) + "]");
      }
    });
    if (el.id && !/\d{4,}/.test(el.id)) r.push("//" + t + "[@id='" + el.id + "']");
    // try unique tag
    try { if (document.querySelectorAll(t).length === 1) r.push("//" + t); } catch (ex) {}
  }

  // Shadow DOM: if we're inside a shadow root, get host attributes
  try {
    var root = el.getRootNode && el.getRootNode();
    if (root && root !== document && root.host) {
      var h = root.host, ht = h.tagName.toLowerCase();
      var hostAttrs = ["data-id", "data-name", "data-label", "data-tracking-type", "aria-label", "title"];
      hostAttrs.forEach(function (a) {
        var hv = h.getAttribute(a);
        if (hv) r.push("//" + ht + "[@" + a + "=" + wq(hv) + "]");
      });
      if (h.id && !/\d{4,}/.test(h.id)) r.push("//" + ht + "[@id='" + h.id + "']");
    }
  } catch (e) {}

  // If element itself has shadow root, use its own attributes
  if (el.shadowRoot) {
    var selfAttrs = ["data-id", "data-name", "data-label", "data-tracking-type", "aria-label"];
    selfAttrs.forEach(function (a) {
      var sv = el.getAttribute(a);
      if (sv) r.push("//" + t + "[@" + a + "=" + wq(sv) + "]");
    });
  }

  // Button with span text: //span[text()='Save']/parent::button
  if (t === "button") {
    var bsp = el.querySelector("span");
    if (bsp && bsp.textContent.trim()) r.push("//span[text()=" + wq(bsp.textContent.trim()) + "]/parent::button");
    if (el.getAttribute("title")) r.push("//button[@title=" + wq(el.getAttribute("title")) + "]");
    if (txt && !bsp) r.push("//button[normalize-space()=" + wq(txt) + "]");
  }

  // Link: //a[text()='Company'] or //a[@title='X']
  if (t === "a") {
    var adl = el.getAttribute("data-label");
    if (txt && adl) r.push("//a[text()=" + wq(txt) + "][@data-label=" + wq(adl) + "]");
    else if (txt) r.push("//a[text()=" + wq(txt) + "]");
    if (el.getAttribute("title")) r.push("//a[@title=" + wq(el.getAttribute("title")) + "]");
    var asp = el.querySelector("span");
    if (asp && asp.textContent.trim()) r.push("//span[text()=" + wq(asp.textContent.trim()) + "]/parent::a");
  }

  // Span -> parent
  if (t === "span" && txt) {
    var par = el.parentElement, pt = par ? par.tagName.toLowerCase() : "";
    if (pt === "button") r.push("//span[text()=" + wq(txt) + "]/parent::button");
    else if (pt === "a") r.push("//span[text()=" + wq(txt) + "]/parent::a");
    else r.push("//span[text()=" + wq(txt) + "]");
  }

  // Div text -> parent::a
  if (t === "div" && txt && el.children.length === 0) {
    var dp = el.parentElement;
    if (dp && dp.tagName.toLowerCase() === "a") r.push("//div[text()=" + wq(txt) + "]/parent::a");
    else r.push("//div[text()=" + wq(txt) + "]");
  }

  // Other leaf text elements
  if (txt && el.children.length === 0 && t !== "button" && t !== "a" && t !== "span" && t !== "div") {
    r.push("//" + t + "[text()=" + wq(txt) + "]");
  }

  // Radio: //span[text()='Personal']/ancestor::label//input[@type='radio']
  if (t === "input" && el.type === "radio") {
    var rl = findLabel(el);
    if (rl) r.push("//span[text()=" + wq(rl) + "]/ancestor::label//input[@type='radio']");
  }
  // Checkbox
  if (t === "input" && el.type === "checkbox") {
    var cl = findLabel(el);
    if (cl) r.push("//span[text()=" + wq(cl) + "]/ancestor::label//input[@type='checkbox']");
  }

  // Input/textarea via data-label wrapper
  if (t === "input" || t === "textarea") {
    var dlw = el.closest("[data-label]");
    if (dlw) r.push("//*[@data-label=" + wq(dlw.getAttribute("data-label")) + "]//" + t);
    var alw = el.closest("[aria-label]");
    if (alw && alw !== el) r.push("//*[@aria-label=" + wq(alw.getAttribute("aria-label")) + "]//" + t);
  }

  // Common attributes
  var attrs = ["data-label", "data-id", "data-name", "aria-label", "title", "name", "placeholder"];
  attrs.forEach(function (a) {
    var v = el.getAttribute(a);
    if (v && v.length < 80) r.push("//" + t + "[@" + a + "=" + wq(v) + "]");
  });

  // ID (skip dynamic IDs with long numbers)
  if (el.id && /^[a-zA-Z][\w-]*$/.test(el.id) && !/\d{4,}/.test(el.id)) {
    r.push("//*[@id='" + el.id + "']");
  }

  // Select
  if (t === "select" && el.getAttribute("name")) r.push("//select[@name=" + wq(el.getAttribute("name")) + "]");

  // Walk UP to parent with good attribute
  var anc = el.parentElement, depth = 0;
  while (anc && depth < 5) {
    var aId = anc.id, aDl = anc.getAttribute && anc.getAttribute("data-label"),
        aAl = anc.getAttribute && anc.getAttribute("aria-label"),
        aDi = anc.getAttribute && anc.getAttribute("data-id");
    if (aId && /^[a-zA-Z][\w-]*$/.test(aId) && !/\d{4,}/.test(aId)) { r.push("//*[@id='" + aId + "']//" + t); break; }
    if (aDl) { r.push("//*[@data-label=" + wq(aDl) + "]//" + t); break; }
    if (aAl) { r.push("//*[@aria-label=" + wq(aAl) + "]//" + t); break; }
    if (aDi) { r.push("//*[@data-id=" + wq(aDi) + "]//" + t); break; }
    anc = anc.parentElement; depth++;
  }

  // Children drill-down
  if (r.length < 2) {
    var inner = el.querySelector("a,button,input,select,textarea");
    if (inner) gen(inner).forEach(function (item) { r.push(item.xp || item); });
  }

  // Positional fallback
  var parts = [], c = el;
  while (c && c.nodeType === 1) {
    var tg = c.tagName.toLowerCase();
    if (c.id && /^[a-zA-Z][\w-]*$/.test(c.id) && !/\d{4,}/.test(c.id)) { parts.unshift(tg + "[@id='" + c.id + "']"); break; }
    var sib = c, cnt = 0, pos = 0;
    while (sib) { if (sib.nodeType === 1 && sib.tagName.toLowerCase() === tg) { cnt++; if (sib === c) pos = cnt; } sib = sib.previousElementSibling; }
    parts.unshift(cnt > 1 ? tg + "[" + pos + "]" : tg);
    c = c.parentElement;
  }
  if (parts.length) r.push("//" + parts.join("/"));

  // Dedupe, validate, rank
  var seen = {}, valid = [];
  r.forEach(function (xp) {
    if (seen[xp]) return;
    seen[xp] = 1;
    valid.push({ xp: xp, count: countMatches(xp) });
  });
  valid.sort(function (a, b) {
    if (a.count === 1 && b.count !== 1) return -1;
    if (b.count === 1 && a.count !== 1) return 1;
    return a.xp.length - b.xp.length;
  });
  return valid.slice(0, 5);
}

function findLabel(el) {
  if (el.id) {
    try {
      var lbl = document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
      if (lbl) { var s = lbl.querySelector("span"); return (s && s.textContent.trim()) || lbl.textContent.trim(); }
    } catch (e) {}
  }
  var w = el.closest("label,.slds-form-element,lightning-input,lightning-combobox,lightning-checkbox-group,lightning-radio-group,lightning-textarea,lightning-datepicker,lightning-input-field");
  if (w) { var wl = w.querySelector("span.slds-form-element__label,label span,legend span,label"); if (wl && wl.textContent.trim()) return wl.textContent.trim(); }
  return el.getAttribute("aria-label") || el.getAttribute("data-label") || "";
}

function findBestTarget(el, e) {
  var deep = el;

  // composedPath() pierces shadow DOM — gives the real deepest element
  try {
    var path = e.composedPath && e.composedPath();
    if (path && path.length > 0) {
      for (var pi = 0; pi < path.length; pi++) {
        var node = path[pi];
        if (node.nodeType === 1 && node.tagName) { deep = node; break; }
      }
    }
  } catch (ex) {}

  // fallback: elementFromPoint
  if (deep === el) {
    try {
      var fp = document.elementFromPoint(e.clientX, e.clientY);
      if (fp && fp !== el) deep = fp;
    } catch (ex) {}
  }

  var t = deep.tagName ? deep.tagName.toLowerCase() : "";
  var isKnown = /^(a|button|input|select|textarea|span|div|li|td|th|label|img|p|h[1-6]|svg|i)$/.test(t);

  // For custom/unknown elements, try to find a standard child
  if (!isKnown) {
    var inner = deep.querySelector("a,button,span,input");
    if (inner) return inner;
    if (deep.shadowRoot) {
      var si = deep.shadowRoot.querySelector("a,button,span,input");
      if (si) return si;
    }
  }

  // For wrapper elements (div/nav/li/ul), find nearest clickable child
  if ((t === "div" || t === "nav" || t === "li" || t === "ul") && deep.children.length > 0) {
    var links = deep.querySelectorAll("a,button");
    if (links.length === 1) return links[0];
    if (links.length > 1) {
      var best = null, bd = Infinity;
      links.forEach(function (lnk) {
        var rect = lnk.getBoundingClientRect();
        var d = Math.sqrt(Math.pow(e.clientX - (rect.left + rect.width / 2), 2) + Math.pow(e.clientY - (rect.top + rect.height / 2), 2));
        if (d < bd) { bd = d; best = lnk; }
      });
      if (best) return best;
    }
  }

  // For Lightning custom elements with shadow, walk up to find the host and use its attributes
  if (!isKnown && t.indexOf("-") > 0) {
    return deep;
  }

  return deep;
}

function show(el, e) {
  hide();
  el = findBestTarget(el, e);
  var results = gen(el);
  if (!results.length) return;

  box = document.createElement("div");
  box.id = "__xf_box";
  box.style.cssText = "position:fixed;z-index:999999;background:#1e1e1e;color:#d4d4d4;padding:12px 14px;border-radius:8px;font:12px monospace;max-width:620px;box-shadow:0 4px 16px rgba(0,0,0,0.5);";
  var top = e.clientY + 15, left = e.clientX + 10;
  if (top + 250 > window.innerHeight) top = e.clientY - 250;
  if (left + 450 > window.innerWidth) left = e.clientX - 450;
  box.style.top = Math.max(0, top) + "px";
  box.style.left = Math.max(0, left) + "px";

  var title = document.createElement("div");
  title.style.cssText = "font-weight:bold;margin-bottom:8px;color:#4fc3f7;";
  title.textContent = "XPath (" + results.length + ")  <" + el.tagName.toLowerCase() + ">";
  box.appendChild(title);

  results.forEach(function (item, i) {
    var row = document.createElement("div");
    row.style.cssText = "margin-bottom:6px;display:flex;align-items:start;gap:6px;";
    var num = document.createElement("span");
    num.style.cssText = "color:#aaa;min-width:14px;";
    num.textContent = (i + 1) + ".";
    var code = document.createElement("code");
    code.style.cssText = "flex:1;word-break:break-all;cursor:pointer;" + (item.count === 1 ? "color:#a5d6a7;" : "color:#ef9a9a;");
    code.textContent = item.xp;
    var badge = document.createElement("span");
    badge.style.cssText = "font-size:10px;padding:1px 5px;border-radius:3px;white-space:nowrap;" + (item.count === 1 ? "background:#2e7d32;color:#fff;" : "background:#c62828;color:#fff;");
    badge.textContent = item.count === 1 ? "unique" : item.count + " hits";
    var cpBtn = document.createElement("button");
    cpBtn.style.cssText = "cursor:pointer;padding:2px 8px;font-size:10px;background:#455a64;color:#fff;border:none;border-radius:3px;white-space:nowrap;";
    cpBtn.textContent = "Copy";
    function makeCopier(xpath, elem) {
      return function (ev) {
        ev.stopPropagation(); ev.preventDefault();
        if (navigator.clipboard) navigator.clipboard.writeText(xpath).then(function () {
          elem.style.color = "#4caf50"; setTimeout(function () { elem.style.color = ""; }, 600);
        });
      };
    }
    code.onclick = makeCopier(item.xp, code);
    cpBtn.onclick = makeCopier(item.xp, cpBtn);
    row.appendChild(num); row.appendChild(code); row.appendChild(badge); row.appendChild(cpBtn);
    box.appendChild(row);
  });

  var isShadow = false;
  try { var rt = el.getRootNode && el.getRootNode(); if ((rt && rt !== document && rt.host) || el.shadowRoot) isShadow = true; } catch (ex) {}
  if (isShadow) {
    var warn = document.createElement("div");
    warn.style.cssText = "margin-top:6px;padding:6px 8px;background:#4a2800;border-radius:4px;color:#ffb74d;font-size:11px;";
    warn.textContent = "Shadow DOM: XPaths target the host. Inside: driver.findElement(css).getShadowRoot().findElement(css)";
    box.appendChild(warn);
  }

  var hint = document.createElement("div");
  hint.style.cssText = "margin-top:6px;font-size:10px;color:#777;";
  hint.textContent = "Click XPath to copy | Green = unique match | Red = multiple";
  box.appendChild(hint);
  document.body.appendChild(box);
  el.style.outline = "2px solid #4fc3f7";
  setTimeout(function () { el.style.outline = ""; }, 1500);
}

function hide() { if (box && box.parentNode) box.parentNode.removeChild(box); box = null; }

function handler(e) {
  if (e.target.closest && e.target.closest("#__xf_box")) return;
  if (e.target.id === "__xf_toggle") return;
  e.preventDefault(); e.stopPropagation();
  show(e.target, e);
}

function toggle() {
  on = !on;
  var btn = document.getElementById("__xf_toggle");
  if (on) { document.addEventListener("click", handler, true); btn.textContent = "XPath: ON (Ctrl+Shift+X)"; btn.style.background = "#4caf50"; }
  else { document.removeEventListener("click", handler, true); hide(); btn.textContent = "XPath: OFF (Ctrl+Shift+X)"; btn.style.background = "#f44336"; }
}

var btn = document.createElement("button");
btn.id = "__xf_toggle";
btn.textContent = "XPath: OFF (Ctrl+Shift+X)";
btn.style.cssText = "position:fixed;bottom:12px;right:12px;z-index:999998;padding:8px 16px;font:13px sans-serif;font-weight:bold;color:#fff;background:#f44336;border:none;border-radius:8px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,0.3);";
btn.onclick = toggle;
document.body.appendChild(btn);

document.addEventListener("keydown", function (e) {
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "X" || e.key === "x")) {
    e.preventDefault();
    toggle();
  }
});
})();
