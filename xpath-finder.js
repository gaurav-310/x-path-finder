/**
 * Salesforce XPath Finder v5
 * - Blocks dropdown clicks (mousedown + click) so dropdowns don't open
 * - User can manually open a dropdown, then click inside to inspect options
 * - Live hover highlight (like DevTools inspect)
 * - SVG/icon walks up to clickable parent
 * - Toggle: Ctrl+Shift+X (Cmd+Shift+X on Mac)
 */
(function () {
if (window.__xf) return;
window.__xf = true;
var on = false;
var box = null;
var hoverEl = null;
var hoverOutline = "";
var hoverBg = "";

var SVG_TAGS = /^(svg|path|use|circle|line|rect|polygon|g|img|i)$/;

function wq(s) {
  if (!s) return "''";
  if (s.indexOf("'") === -1) return "'" + s + "'";
  if (s.indexOf('"') === -1) return '"' + s + '"';
  return "concat('" + s.replace(/'/g, "',\"'\",'") + "')";
}

function countMatches(xp) {
  try {
    return document.evaluate(
      "count(" + xp + ")",
      document, null,
      XPathResult.NUMBER_TYPE, null
    ).numberValue;
  } catch (e) { return 999; }
}

function getOwnText(el) {
  var txt = "";
  for (var i = 0; i < el.childNodes.length; i++) {
    if (el.childNodes[i].nodeType === 3)
      txt += el.childNodes[i].textContent;
  }
  return txt.trim();
}

function getDirectSpanText(el) {
  var spans = el.querySelectorAll(":scope > span");
  if (spans.length === 1 && spans[0].textContent.trim())
    return spans[0].textContent.trim();
  if (spans.length === 0) {
    var ds = el.querySelector("span");
    if (ds && ds.textContent.trim().length < 50)
      return ds.textContent.trim();
  }
  return "";
}

function walkUpToClickable(el) {
  var cur = el, depth = 0;
  while (cur && depth < 6) {
    var t = cur.tagName ? cur.tagName.toLowerCase() : "";
    if (t === "button" || t === "a") return cur;
    var role = cur.getAttribute && cur.getAttribute("role");
    if (role === "button" || role === "menuitem" || role === "tab" || role === "option")
      return cur;
    if (t === "div" && cur.getAttribute && cur.getAttribute("onclick"))
      return cur;
    cur = cur.parentElement;
    depth++;
  }
  return el;
}

function findLabel(el) {
  if (el.id) {
    try {
      var lbl = document.querySelector(
        'label[for="' + CSS.escape(el.id) + '"]'
      );
      if (lbl) {
        var s = lbl.querySelector("span");
        return (s && s.textContent.trim()) || lbl.textContent.trim();
      }
    } catch (e) {}
  }
  var w = el.closest(
    "label,.slds-form-element,lightning-input," +
    "lightning-combobox,lightning-checkbox-group," +
    "lightning-radio-group,lightning-textarea," +
    "lightning-datepicker,lightning-input-field," +
    "lightning-select"
  );
  if (w) {
    var wl = w.querySelector(
      "span.slds-form-element__label," +
      "label span,legend span,label," +
      ".slds-form-element__legend"
    );
    if (wl && wl.textContent.trim()) return wl.textContent.trim();
  }
  return el.getAttribute("aria-label") ||
    el.getAttribute("data-label") || "";
}

function gen(rawEl) {
  var el = rawEl;
  if (!el || !el.tagName) return [];
  var t = el.tagName.toLowerCase();

  if (SVG_TAGS.test(t)) {
    el = walkUpToClickable(rawEl);
    t = el.tagName ? el.tagName.toLowerCase() : "";
  }

  var r = [];
  var fullTxt = "";
  try { fullTxt = (el.textContent || "").trim(); } catch (e) {}
  var txt = fullTxt.length <= 50 ? fullTxt : "";
  var ownTxt = getOwnText(el);

  // Lightning custom element
  if (t.indexOf("-") > 0) {
    var ca = [
      "data-id", "data-name", "data-label",
      "data-tracking-type", "data-aura-class",
      "aria-label", "title", "name"
    ];
    ca.forEach(function (a) {
      var v = el.getAttribute(a);
      if (v && v.length < 80)
        r.push("//" + t + "[@" + a + "=" + wq(v) + "]");
    });
    if (el.className && typeof el.className === "string") {
      var cls = el.className.trim().split(/\s+/);
      for (var ci = 0; ci < cls.length; ci++) {
        if (cls[ci].length > 3 && !/^ng-|^_|^is-|^has-/.test(cls[ci])) {
          try {
            var sel = t + "." + CSS.escape(cls[ci]);
            if (document.querySelectorAll(sel).length === 1) {
              r.push("//" + t +
                "[contains(@class," + wq(cls[ci]) + ")]");
              break;
            }
          } catch (ex) {}
        }
      }
    }
    if (el.id && !/\d{4,}/.test(el.id))
      r.push("//" + t + "[@id='" + el.id + "']");
    try {
      if (document.querySelectorAll(t).length === 1)
        r.push("//" + t);
    } catch (ex) {}
  }

  // Shadow DOM host
  try {
    var root = el.getRootNode && el.getRootNode();
    if (root && root !== document && root.host) {
      var h = root.host;
      var ht = h.tagName.toLowerCase();
      var ha = [
        "data-id", "data-name", "data-label",
        "data-tracking-type", "data-aura-class",
        "aria-label", "title"
      ];
      ha.forEach(function (a) {
        var hv = h.getAttribute(a);
        if (hv)
          r.push("//" + ht + "[@" + a + "=" + wq(hv) + "]");
      });
      if (h.id && !/\d{4,}/.test(h.id))
        r.push("//" + ht + "[@id='" + h.id + "']");
    }
  } catch (e) {}

  if (el.shadowRoot) {
    var sa = [
      "data-id", "data-name", "data-label",
      "data-tracking-type", "aria-label"
    ];
    sa.forEach(function (a) {
      var sv = el.getAttribute(a);
      if (sv) r.push("//" + t + "[@" + a + "=" + wq(sv) + "]");
    });
  }

  // Button
  if (t === "button") {
    var bsTxt = getDirectSpanText(el);
    if (bsTxt) {
      r.push("//span[text()=" + wq(bsTxt) +
        "]/parent::button");
      r.push("//button[.//span[contains(text()," +
        wq(bsTxt) + ")]]");
    }
    var bTitle = el.getAttribute("title");
    if (bTitle)
      r.push("//button[@title=" + wq(bTitle) + "]");
    if (txt) {
      r.push("//button[contains(.," + wq(txt) + ")]");
      if (!bsTxt)
        r.push("//button[normalize-space()=" + wq(txt) + "]");
    }
    if (bsTxt && bTitle)
      r.push("//button[@title=" + wq(bTitle) +
        " and .//span[text()=" + wq(bsTxt) + "]]");
  }

  // Link
  if (t === "a") {
    var adl = el.getAttribute("data-label");
    if (txt && adl)
      r.push("//a[text()=" + wq(txt) +
        "][@data-label=" + wq(adl) + "]");
    if (txt) {
      r.push("//a[text()=" + wq(txt) + "]");
      r.push("//a[contains(text()," + wq(txt) + ")]");
      r.push("//a[normalize-space()=" + wq(txt) + "]");
    }
    var aTitle = el.getAttribute("title");
    if (aTitle)
      r.push("//a[@title=" + wq(aTitle) + "]");
    var href = el.getAttribute("href");
    if (href && href !== "#" && href !== "javascript:void(0)") {
      if (href.length < 60)
        r.push("//a[@href=" + wq(href) + "]");
      var hp = href.split("/").filter(function (p) {
        return p && p.length > 2;
      });
      if (hp.length > 0)
        r.push("//a[contains(@href," +
          wq(hp[hp.length - 1]) + ")]");
    }
    var aSpan = getDirectSpanText(el);
    if (aSpan)
      r.push("//span[text()=" + wq(aSpan) + "]/parent::a");
  }

  // Span
  if (t === "span") {
    var sTxt = ownTxt || txt;
    if (sTxt && sTxt.length <= 50) {
      var par = el.parentElement;
      var pt = par ? par.tagName.toLowerCase() : "";
      if (pt === "button") {
        r.push("//span[text()=" + wq(sTxt) + "]/parent::button");
        r.push("//span[contains(text()," + wq(sTxt) +
          ")]/parent::button");
      } else if (pt === "a") {
        r.push("//span[text()=" + wq(sTxt) + "]/parent::a");
        r.push("//span[contains(text()," + wq(sTxt) +
          ")]/parent::a");
      } else {
        r.push("//span[text()=" + wq(sTxt) + "]");
        r.push("//span[contains(text()," + wq(sTxt) + ")]");
      }
    }
  }

  // Div leaf
  if (t === "div" && (ownTxt || txt) && el.children.length === 0) {
    var dTxt = ownTxt || txt;
    if (dTxt.length <= 50) {
      var dp = el.parentElement;
      if (dp && dp.tagName.toLowerCase() === "a")
        r.push("//div[text()=" + wq(dTxt) + "]/parent::a");
      else
        r.push("//div[text()=" + wq(dTxt) + "]");
    }
  }

  // Radio / Checkbox
  if (t === "input" && el.type === "radio") {
    var rl = findLabel(el);
    if (rl) r.push("//span[text()=" + wq(rl) +
      "]/ancestor::label//input[@type='radio']");
  }
  if (t === "input" && el.type === "checkbox") {
    var cl = findLabel(el);
    if (cl) r.push("//span[text()=" + wq(cl) +
      "]/ancestor::label//input[@type='checkbox']");
  }

  // Input/textarea wrappers
  if (t === "input" || t === "textarea") {
    var dlw = el.closest("[data-label]");
    if (dlw) r.push("//*[@data-label=" +
      wq(dlw.getAttribute("data-label")) + "]//" + t);
    var alw = el.closest("[aria-label]");
    if (alw && alw !== el)
      r.push("//*[@aria-label=" +
        wq(alw.getAttribute("aria-label")) + "]//" + t);
  }

  // Common attributes
  var commonA = [
    "data-label", "data-id", "data-name",
    "data-aura-class", "aria-label", "title",
    "name", "placeholder", "role", "type"
  ];
  commonA.forEach(function (a) {
    var v = el.getAttribute(a);
    if (!v || v.length > 80) return;
    if (a === "type" && /^(text|hidden)$/.test(v)) return;
    if (a === "role" && /^(presentation|none|group)$/.test(v)) return;
    r.push("//" + t + "[@" + a + "=" + wq(v) + "]");
  });

  // Stable ID
  if (el.id && /^[a-zA-Z][\w-]*$/.test(el.id) && !/\d{4,}/.test(el.id))
    r.push("//*[@id='" + el.id + "']");

  // Select
  if (t === "select" && el.getAttribute("name"))
    r.push("//select[@name=" + wq(el.getAttribute("name")) + "]");

  // Sibling strategies
  var prevSib = el.previousElementSibling;
  var nextSib = el.nextElementSibling;

  if (/^(input|textarea|select)$/.test(t) && prevSib) {
    var prevTxt = (prevSib.textContent || "").trim();
    var prevTag = prevSib.tagName.toLowerCase();
    if (prevTxt && prevTxt.length < 40) {
      r.push("//" + prevTag + "[text()=" + wq(prevTxt) +
        "]/following-sibling::" + t);
      r.push("//" + prevTag +
        "[normalize-space()=" + wq(prevTxt) +
        "]/following-sibling::" + t);
    }
  }

  if (nextSib && txt) {
    var nextTxt = (nextSib.textContent || "").trim();
    var nextTag = nextSib.tagName.toLowerCase();
    if (nextTxt && nextTxt.length < 40 && nextTxt !== txt)
      r.push("//" + nextTag + "[text()=" + wq(nextTxt) +
        "]/preceding-sibling::" + t);
  }

  // Ancestor + descendant
  var anc = el.parentElement, depth = 0;
  var ancA = [
    "data-label", "aria-label",
    "data-id", "data-name", "data-aura-class"
  ];
  while (anc && depth < 8) {
    var aId = anc.id;
    if (aId && /^[a-zA-Z][\w-]*$/.test(aId) && !/\d{4,}/.test(aId)) {
      r.push("//*[@id='" + aId + "']//" + t);
      break;
    }
    var found = false;
    for (var ai = 0; ai < ancA.length; ai++) {
      var av = anc.getAttribute && anc.getAttribute(ancA[ai]);
      if (av) {
        r.push("//*[@" + ancA[ai] + "=" +
          wq(av) + "]//" + t);
        found = true;
        break;
      }
    }
    if (found) break;
    anc = anc.parentElement;
    depth++;
  }

  // Partial text
  if (fullTxt.length > 15 && fullTxt.length <= 80 && el.children.length === 0)
    r.push("//" + t + "[contains(text()," +
      wq(fullTxt.substring(0, 20)) + ")]");

  // Children drill-down
  if (r.length < 2) {
    var inner = el.querySelector(
      "a,button,input,select,textarea," +
      "span[onclick],div[role='button']"
    );
    if (inner)
      gen(inner).forEach(function (item) {
        if (item.xp) r.push(item.xp);
      });
  }

  // Positional fallback
  var parts = [], c = el, maxP = 6;
  while (c && c.nodeType === 1 && maxP > 0) {
    var tg = c.tagName.toLowerCase();
    if (tg === "body" || tg === "html") break;
    if (c.id && /^[a-zA-Z][\w-]*$/.test(c.id) && !/\d{4,}/.test(c.id)) {
      parts.unshift(tg + "[@id='" + c.id + "']");
      break;
    }
    var sib = c, cnt = 0, pos = 0;
    while (sib) {
      if (sib.nodeType === 1 && sib.tagName.toLowerCase() === tg) {
        cnt++;
        if (sib === c) pos = cnt;
      }
      sib = sib.previousElementSibling;
    }
    parts.unshift(cnt > 1 ? tg + "[" + pos + "]" : tg);
    c = c.parentElement;
    maxP--;
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
    if (a.count !== b.count) return a.count - b.count;
    return a.xp.length - b.xp.length;
  });
  return valid.slice(0, 5);
}

function isClickable(el) {
  if (!el || !el.tagName) return false;
  var t = el.tagName.toLowerCase();
  if (t === "button" || t === "a" || t === "input" ||
      t === "select" || t === "textarea") return true;
  var role = el.getAttribute && el.getAttribute("role");
  if (role === "button" || role === "link" ||
      role === "menuitem" || role === "tab" ||
      role === "option" || role === "checkbox" ||
      role === "radio" || role === "switch") return true;
  if (el.getAttribute && (
      el.getAttribute("onclick") ||
      el.getAttribute("tabindex") === "0")) return true;
  if (t.indexOf("-") > 0) return true;
  return false;
}

function findClickableAncestor(el) {
  var cur = el, depth = 0;
  while (cur && depth < 8) {
    if (isClickable(cur)) return cur;
    cur = cur.parentElement;
    depth++;
  }
  return el;
}

function findBestTarget(el, e) {
  var deep = el;
  try {
    var path = e.composedPath && e.composedPath();
    if (path && path.length > 0) {
      for (var pi = 0; pi < path.length; pi++) {
        if (path[pi].nodeType === 1 && path[pi].tagName) {
          deep = path[pi];
          break;
        }
      }
    }
  } catch (ex) {}

  if (deep === el) {
    try {
      var fp = document.elementFromPoint(e.clientX, e.clientY);
      if (fp && fp !== el) deep = fp;
    } catch (ex) {}
  }

  var t = deep.tagName ? deep.tagName.toLowerCase() : "";

  // SVG/icon → always walk up
  if (SVG_TAGS.test(t)) {
    deep = walkUpToClickable(deep);
    t = deep.tagName ? deep.tagName.toLowerCase() : "";
  }

  // If element is NOT clickable itself, walk up to find one
  if (!isClickable(deep)) {
    var anc = findClickableAncestor(deep);
    if (anc !== deep && isClickable(anc)) {
      deep = anc;
      t = deep.tagName.toLowerCase();
    }
  }

  // If custom element with no real children, drill in
  var isKnown = /^(a|button|input|select|textarea|span|div|li|td|th|label|p|h[1-6]|em|strong|b)$/.test(t);
  if (!isKnown && t.indexOf("-") === -1) {
    var inner = deep.querySelector("a,button,span,input");
    if (inner) return inner;
    if (deep.shadowRoot) {
      var si = deep.shadowRoot.querySelector("a,button,span,input");
      if (si) return si;
    }
  }

  return deep;
}

// ========== HOVER HIGHLIGHT (like DevTools) ==========

function clearHover() {
  if (hoverEl) {
    hoverEl.style.outline = hoverOutline;
    hoverEl.style.backgroundColor = hoverBg;
    hoverEl = null;
    hoverOutline = "";
    hoverBg = "";
  }
}

function onHover(e) {
  if (!on) return;
  var el = e.target;
  if (el.closest && el.closest("#__xf_box,#__xf_toggle")) return;
  if (hoverEl === el) return;
  clearHover();
  hoverEl = el;
  hoverOutline = el.style.outline || "";
  hoverBg = el.style.backgroundColor || "";
  el.style.outline = "2px solid #4fc3f7";
  el.style.backgroundColor = "rgba(79,195,247,0.15)";
}

// ========== CLICK BLOCKING ==========
// Critical: block mousedown, pointerdown, mouseup AND click
// because dropdowns often open on mousedown not click

function blocker(e) {
  if (!on) return;
  if (e.target.closest && e.target.closest("#__xf_box,#__xf_toggle")) return;
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();
}

function clickHandler(e) {
  if (!on) return;
  if (e.target.closest && e.target.closest("#__xf_box,#__xf_toggle")) return;
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();
  show(e.target, e);
}

// ========== POPUP ==========

function show(el, e) {
  hide();
  el = findBestTarget(el, e);
  var results = gen(el);
  if (!results.length) return;

  var elTag = el.tagName.toLowerCase();
  var elTxt = (el.textContent || "").trim().substring(0, 30);
  var elAttrs = "";
  ["id", "data-label", "aria-label", "title", "name", "class", "href"]
    .forEach(function (a) {
      var v = el.getAttribute(a);
      if (v && !elAttrs)
        elAttrs = a + "=" + v.substring(0, 30);
    });

  box = document.createElement("div");
  box.id = "__xf_box";
  box.style.cssText =
    "position:fixed;z-index:2147483647;" +
    "background:#1e1e1e;color:#d4d4d4;" +
    "padding:12px 14px;border-radius:8px;" +
    "font:12px monospace;max-width:680px;" +
    "box-shadow:0 4px 16px rgba(0,0,0,0.5);";

  var top = e.clientY + 15;
  var left = e.clientX + 10;
  if (top + 300 > window.innerHeight) top = e.clientY - 300;
  if (left + 500 > window.innerWidth) left = e.clientX - 500;
  box.style.top = Math.max(0, top) + "px";
  box.style.left = Math.max(0, left) + "px";

  var title = document.createElement("div");
  title.style.cssText =
    "font-weight:bold;margin-bottom:4px;color:#4fc3f7;";
  title.textContent =
    "XPath (" + results.length + ")  <" + elTag + ">";
  box.appendChild(title);

  var info = document.createElement("div");
  info.style.cssText =
    "margin-bottom:8px;font-size:11px;color:#90a4ae;";
  info.textContent =
    (elTxt ? '"' + elTxt + '"' : "(no text)") +
    (elAttrs ? "  |  " + elAttrs : "");
  box.appendChild(info);

  results.forEach(function (item, i) {
    var row = document.createElement("div");
    row.style.cssText =
      "margin-bottom:6px;display:flex;" +
      "align-items:start;gap:6px;";

    var num = document.createElement("span");
    num.style.cssText = "color:#aaa;min-width:14px;";
    num.textContent = (i + 1) + ".";

    var code = document.createElement("code");
    var isUnique = item.count === 1;
    code.style.cssText =
      "flex:1;word-break:break-all;cursor:pointer;" +
      (isUnique ? "color:#a5d6a7;" : "color:#ef9a9a;");
    code.textContent = item.xp;

    var badge = document.createElement("span");
    badge.style.cssText =
      "font-size:10px;padding:1px 5px;" +
      "border-radius:3px;white-space:nowrap;" +
      (isUnique
        ? "background:#2e7d32;color:#fff;"
        : "background:#c62828;color:#fff;");
    if (item.count === 1) badge.textContent = "unique";
    else if (item.count === 0) badge.textContent = "0 hits";
    else badge.textContent = item.count + " hits";

    var cpBtn = document.createElement("button");
    cpBtn.style.cssText =
      "cursor:pointer;padding:2px 8px;" +
      "font-size:10px;background:#455a64;" +
      "color:#fff;border:none;border-radius:3px;" +
      "white-space:nowrap;";
    cpBtn.textContent = "Copy";

    function makeCopier(xpath, elem) {
      return function (ev) {
        ev.stopPropagation();
        ev.preventDefault();
        if (navigator.clipboard)
          navigator.clipboard.writeText(xpath)
            .then(function () {
              elem.style.color = "#4caf50";
              setTimeout(function () {
                elem.style.color = "";
              }, 600);
            });
      };
    }
    code.onclick = makeCopier(item.xp, code);
    cpBtn.onclick = makeCopier(item.xp, cpBtn);

    row.appendChild(num);
    row.appendChild(code);
    row.appendChild(badge);
    row.appendChild(cpBtn);
    box.appendChild(row);
  });

  var hint = document.createElement("div");
  hint.style.cssText =
    "margin-top:6px;font-size:10px;color:#777;";
  hint.textContent =
    "Click XPath to copy | Green=unique | Red=multiple";
  box.appendChild(hint);
  document.body.appendChild(box);
}

function hide() {
  if (box && box.parentNode)
    box.parentNode.removeChild(box);
  box = null;
}

// ========== TOGGLE ==========

function focusBlocker(e) {
  if (!on) return;
  if (e.target.closest && e.target.closest("#__xf_box,#__xf_toggle")) return;
  // Block focus loss events so dropdowns don't close
  e.stopPropagation();
  e.stopImmediatePropagation();
}

function toggle() {
  on = !on;
  var btn = document.getElementById("__xf_toggle");
  if (on) {
    document.addEventListener("mousedown", blocker, true);
    document.addEventListener("pointerdown", blocker, true);
    document.addEventListener("mouseup", blocker, true);
    document.addEventListener("pointerup", blocker, true);
    document.addEventListener("click", clickHandler, true);
    document.addEventListener("dblclick", blocker, true);
    document.addEventListener("contextmenu", blocker, true);
    document.addEventListener("mouseover", onHover, true);
    // Block focus loss so dropdowns/popovers don't close
    document.addEventListener("focusout", focusBlocker, true);
    document.addEventListener("blur", focusBlocker, true);
    btn.textContent = "XPath: ON (Alt+X)";
    btn.style.background = "#4caf50";
  } else {
    document.removeEventListener("mousedown", blocker, true);
    document.removeEventListener("pointerdown", blocker, true);
    document.removeEventListener("mouseup", blocker, true);
    document.removeEventListener("pointerup", blocker, true);
    document.removeEventListener("click", clickHandler, true);
    document.removeEventListener("dblclick", blocker, true);
    document.removeEventListener("contextmenu", blocker, true);
    document.removeEventListener("mouseover", onHover, true);
    document.removeEventListener("focusout", focusBlocker, true);
    document.removeEventListener("blur", focusBlocker, true);
    hide();
    clearHover();
    btn.textContent = "XPath: OFF (Alt+X)";
    btn.style.background = "#f44336";
  }
}

// ========== INIT ==========

var btn = document.createElement("button");
btn.id = "__xf_toggle";
btn.textContent = "XPath: OFF (Alt+X)";
btn.style.cssText =
  "position:fixed;bottom:12px;right:12px;" +
  "z-index:2147483647;padding:8px 16px;" +
  "font:13px sans-serif;font-weight:bold;" +
  "color:#fff;background:#f44336;border:none;" +
  "border-radius:8px;cursor:pointer;" +
  "box-shadow:0 2px 8px rgba(0,0,0,0.3);";
btn.onclick = toggle;
document.body.appendChild(btn);

function shortcutHandler(e) {
  // Accept Cmd+Shift+X (Mac), Ctrl+Shift+X (Win/Linux),
  // or Alt+X (universal fallback)
  var modOk = (e.ctrlKey || e.metaKey) && e.shiftKey;
  var altOk = e.altKey && !e.ctrlKey && !e.metaKey;
  var keyOk = e.code === "KeyX" ||
              e.key === "X" || e.key === "x";
  if ((modOk || altOk) && keyOk) {
    e.preventDefault();
    e.stopPropagation();
    toggle();
  }
}

// Attach in CAPTURE phase to both window and document
// so Salesforce can't swallow the event first
window.addEventListener("keydown", shortcutHandler, true);
document.addEventListener("keydown", shortcutHandler, true);
})();
