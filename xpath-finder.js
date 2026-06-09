/**
 * Salesforce XPath Finder v10 (clean rebuild)
 *
 * Click any element -> get up to 6 ranked, validated XPath suggestions.
 * Built for Salesforce Lightning (Shadow DOM, dynamic IDs, tables, grids).
 *
 * Usage:
 *   - Paste this whole file into DevTools Console, OR load via bookmarklet
 *   - Toggle ON/OFF: Cmd+Shift+X (Mac) / Ctrl+Shift+X (Win/Linux),
 *     or click the floating button (bottom-right)
 *   - Hover = blue highlight (like DevTools inspect)
 *   - Click an element = popup with ranked XPaths
 *   - Copy = copy the XPath | Test = copy a console command to verify
 *
 * Dropdowns: turn OFF, open the dropdown manually, turn ON, click an
 * option. You get both text-based AND position-based XPaths (option #N).
 */
(function () {
"use strict";
if (window.__xf) { console.warn("XPath Finder already loaded."); return; }
window.__xf = true;

// ====================== state ======================
var on = false;
var box = null;
var hoverEl = null;
var hoverOutline = "";
var hoverBg = "";

var SVG_TAGS = /^(svg|path|use|circle|line|rect|polygon|g|img|i)$/;

// ====================== small helpers ======================

// Quote a string for use in an XPath literal (handles ' and ")
function wq(s) {
  if (s == null) return "''";
  s = String(s);
  if (s.indexOf("'") === -1) return "'" + s + "'";
  if (s.indexOf('"') === -1) return '"' + s + '"';
  return "concat('" + s.replace(/'/g, "',\"'\",'") + "')";
}

// Count how many elements an XPath matches on the page
function countMatches(xp) {
  try {
    return document.evaluate(
      "count(" + xp + ")", document, null,
      XPathResult.NUMBER_TYPE, null
    ).numberValue;
  } catch (e) { return -1; }
}

// Element's own direct text (ignores text from children)
function ownText(el) {
  var t = "";
  for (var i = 0; i < el.childNodes.length; i++) {
    if (el.childNodes[i].nodeType === 3) t += el.childNodes[i].textContent;
  }
  return t.trim();
}

// Trimmed full text, collapsed whitespace
function fullText(el) {
  try { return (el.textContent || "").replace(/\s+/g, " ").trim(); }
  catch (e) { return ""; }
}

function tagOf(el) {
  return (el && el.tagName) ? el.tagName.toLowerCase() : "";
}

// Is an ID auto-generated/dynamic? (Salesforce, LWC, Aura, Angular, etc.)
function isFlakyId(id) {
  if (!id) return true;
  if (id.length < 2) return true;
  if (/\d{3,}/.test(id)) return true;
  if (/^(lwc-|ember|ng-|aura|sfdc|cke_|tmp_|x-|window_|input-|combobox-|button-|panel-|modal-|listbox-|menu-|datepicker-|j_?id)/i.test(id)) return true;
  if (/:/.test(id)) return true;
  if (/[-_]\d/.test(id) && id.replace(/[^\d]/g, "").length >= 2) return true;
  return false;
}

// Does a text/value look dynamic (changes between runs)?
function looksDynamic(v) {
  if (!v) return false;
  var s = String(v);
  if (/\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(s)) return true;       // date
  if (/\d{1,2}[-/]\d{1,2}[-/]\d{2,4}/.test(s)) return true;     // date
  if (/\d{1,2}:\d{2}/.test(s)) return true;                      // time
  if (/\d{5,}/.test(s)) return true;                            // long number
  if (/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i.test(s)) return true; // guid
  if (s.length >= 15 && /^[a-zA-Z0-9]{15}([a-zA-Z0-9]{3})?$/.test(s)) return true; // SF id
  if (/^(case|tkt|ord|ref|so|inv|po|sr|sub)-?\d{3,}/i.test(s)) return true; // CASE-123
  if (/^\(\d+\)$/.test(s)) return true;                         // (12)
  return false;
}

// Walk up from an SVG/icon/span to a real clickable element
function walkUpToClickable(el) {
  var cur = el, depth = 0;
  while (cur && depth < 6) {
    var t = tagOf(cur);
    if (t === "button" || t === "a") return cur;
    var role = cur.getAttribute && cur.getAttribute("role");
    if (role === "button" || role === "menuitem" || role === "tab" ||
        role === "option" || role === "link") return cur;
    if (t === "div" && cur.getAttribute && cur.getAttribute("onclick")) return cur;
    cur = cur.parentElement; depth++;
  }
  return el;
}

// Is the element directly interactable?
function isClickable(el) {
  if (!el || !el.tagName) return false;
  var t = tagOf(el);
  if (/^(a|button|input|select|textarea)$/.test(t)) return true;
  var role = el.getAttribute && el.getAttribute("role");
  if (/^(button|link|menuitem|tab|option|checkbox|radio|switch)$/.test(role || "")) return true;
  if (el.getAttribute && (el.getAttribute("onclick") || el.getAttribute("tabindex") === "0")) return true;
  if (t.indexOf("-") > 0) return true; // custom element
  return false;
}

// Find the label text for an input/field
function findLabel(el) {
  if (el.id) {
    try {
      var lbl = document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
      if (lbl) {
        var s = lbl.querySelector("span");
        return (s && s.textContent.trim()) || lbl.textContent.trim();
      }
    } catch (e) {}
  }
  var w = el.closest(
    "label,.slds-form-element,lightning-input,lightning-combobox," +
    "lightning-checkbox-group,lightning-radio-group,lightning-textarea," +
    "lightning-datepicker,lightning-input-field,lightning-select"
  );
  if (w) {
    var wl = w.querySelector(
      "span.slds-form-element__label,label span,legend span,label," +
      ".slds-form-element__legend"
    );
    if (wl && wl.textContent.trim()) return wl.textContent.trim();
  }
  return el.getAttribute("aria-label") || el.getAttribute("data-label") || "";
}

// Clean header text — strip sort arrows, counts, nested controls
function cleanHeaderText(headerEl) {
  if (!headerEl) return "";
  var lbl = headerEl.querySelector(
    ".slds-truncate,span.slds-th__action,a.slds-th__action," +
    "[role='presentation'] span,button span,span"
  );
  if (lbl && lbl.textContent.trim()) return lbl.textContent.trim().replace(/\s+/g, " ");
  return fullText(headerEl).substring(0, 40);
}

// ====================== XPath generation ======================

function gen(rawEl) {
  var el = rawEl;
  if (!el || !el.tagName) return [];
  var t = tagOf(el);

  // SVG/icon -> walk up to clickable parent
  if (SVG_TAGS.test(t)) {
    el = walkUpToClickable(rawEl);
    t = tagOf(el);
  }

  var r = [];
  var ft = fullText(el);
  var txt = ft.length <= 50 ? ft : "";   // safe text for matching
  var oTxt = ownText(el);

  // ---------- Lightning custom element (tag has a dash) ----------
  if (t.indexOf("-") > 0) {
    ["data-id", "data-name", "data-label", "aria-label", "title", "name"].forEach(function (a) {
      var v = el.getAttribute(a);
      if (v && v.length < 80 && !looksDynamic(v))
        r.push("//" + t + "[@" + a + "=" + wq(v) + "]");
    });
    if (el.id && !isFlakyId(el.id)) r.push("//" + t + "[@id='" + el.id + "']");
    try { if (document.querySelectorAll(t).length === 1) r.push("//" + t); } catch (e) {}
  }

  // ---------- Shadow DOM host attributes ----------
  try {
    var root = el.getRootNode && el.getRootNode();
    if (root && root !== document && root.host) {
      var h = root.host, ht = tagOf(h);
      ["data-id", "data-name", "data-label", "aria-label", "title"].forEach(function (a) {
        var hv = h.getAttribute(a);
        if (hv && !looksDynamic(hv)) r.push("//" + ht + "[@" + a + "=" + wq(hv) + "]");
      });
    }
  } catch (e) {}

  // ---------- Button ----------
  if (t === "button") {
    var bSpan = el.querySelector(":scope > span, :scope > div > span") || el.querySelector("span");
    var bSpanTxt = bSpan ? bSpan.textContent.trim() : "";
    if (bSpanTxt && bSpanTxt.length < 50 && !looksDynamic(bSpanTxt))
      r.push("//span[text()=" + wq(bSpanTxt) + "]/parent::button");
    if (el.getAttribute("title"))
      r.push("//button[@title=" + wq(el.getAttribute("title")) + "]");
    if (txt && !bSpanTxt && !looksDynamic(txt))
      r.push("//button[normalize-space()=" + wq(txt) + "]");
  }

  // ---------- Link ----------
  if (t === "a") {
    if (txt && !looksDynamic(txt))
      r.push("//a[normalize-space()=" + wq(txt) + "]");
    if (el.getAttribute("title"))
      r.push("//a[@title=" + wq(el.getAttribute("title")) + "]");
    var href = el.getAttribute("href");
    var hrefFlaky = !href || href === "#" || /^javascript:/i.test(href.trim()) ||
                    /\/[a-zA-Z0-9]{15,18}(\/|$)/.test(href) || /\d{6,}/.test(href);
    if (!hrefFlaky && href.length < 60)
      r.push("//a[@href=" + wq(href) + "]");
    var aSpan = el.querySelector("span");
    if (aSpan && aSpan.textContent.trim() && !looksDynamic(aSpan.textContent.trim()))
      r.push("//span[text()=" + wq(aSpan.textContent.trim()) + "]/parent::a");
  }

  // ---------- Span / div leaf text ----------
  if (t === "span" && (oTxt || txt)) {
    var sTxt = oTxt || txt;
    if (sTxt.length <= 50 && !looksDynamic(sTxt)) {
      var par = el.parentElement, pt = tagOf(par);
      if (pt === "button") r.push("//span[text()=" + wq(sTxt) + "]/parent::button");
      else if (pt === "a") r.push("//span[text()=" + wq(sTxt) + "]/parent::a");
      else r.push("//span[text()=" + wq(sTxt) + "]");
    }
  }
  if (t === "div" && (oTxt || txt) && el.children.length === 0) {
    var dTxt = oTxt || txt;
    if (dTxt.length <= 50 && !looksDynamic(dTxt))
      r.push("//div[text()=" + wq(dTxt) + "]");
  }

  // ---------- Radio / checkbox ----------
  if (t === "input" && el.type === "radio") {
    var rl = findLabel(el);
    if (rl) r.push("//span[text()=" + wq(rl) + "]/ancestor::label//input[@type='radio']");
  }
  if (t === "input" && el.type === "checkbox") {
    var cl = findLabel(el);
    if (cl) r.push("//span[text()=" + wq(cl) + "]/ancestor::label//input[@type='checkbox']");
  }

  // ---------- Input / textarea via wrappers + label ----------
  if (t === "input" || t === "textarea") {
    var dlw = el.closest("[data-label]");
    if (dlw) r.push("//*[@data-label=" + wq(dlw.getAttribute("data-label")) + "]//" + t);
    var lblTxt = findLabel(el);
    if (lblTxt && lblTxt.length < 60) {
      r.push("//label[normalize-space()=" + wq(lblTxt) + "]/following::" + t + "[1]");
      r.push("//*[contains(@class,'slds-form-element')][.//*[text()=" + wq(lblTxt) + "]]//" + t);
    }
    if (el.getAttribute("placeholder"))
      r.push("//" + t + "[@placeholder=" + wq(el.getAttribute("placeholder")) + "]");
    if (el.getAttribute("name") && !isFlakyId(el.getAttribute("name")))
      r.push("//" + t + "[@name=" + wq(el.getAttribute("name")) + "]");
  }

  // ---------- Generic stable attributes ----------
  ["data-label", "data-id", "data-name", "aria-label", "title", "name", "placeholder", "role"]
    .forEach(function (a) {
      var v = el.getAttribute(a);
      if (!v || v.length > 80 || looksDynamic(v)) return;
      if (a === "role" && /^(presentation|none|group)$/.test(v)) return;
      r.push("//" + t + "[@" + a + "=" + wq(v) + "]");
    });

  // ---------- Stable id ----------
  if (el.id && /^[a-zA-Z][\w-]*$/.test(el.id) && !isFlakyId(el.id))
    r.push("//*[@id='" + el.id + "']");

  // ---------- Clickable-ancestor resolution ----------
  // If this element is a text node holder (span/div/etc.) that lives
  // inside a real clickable (<a>/<button>/[role=button]), also emit
  // XPaths that RESOLVE to that clickable so .click() actually works.
  appendClickableAncestorXPaths(el, t, txt, oTxt, r);

  // ---------- DROPDOWN OPTION (text AND position) ----------
  appendDropdownOptionXPaths(el, t, r);

  // ---------- Neighbor anchoring ----------
  appendNeighborXPaths(el, t, txt, r);

  // ---------- Table / grid anchoring ----------
  appendTableXPaths(el, t, r);

  // ---------- Combination of two stable attributes ----------
  appendCombinationXPaths(el, t, txt, r);

  // ---------- Positional fallback (short) ----------
  r.push(positionalXPath(el));

  // ---------- Dedupe + validate + rank + diversify ----------
  return rankAndPick(r, el);
}

// Find nearest clickable ancestor (button / a / [role=button|link|...])
function clickableAncestor(el) {
  var cur = el.parentElement, depth = 0;
  while (cur && depth < 5) {
    var ct = tagOf(cur);
    if (ct === "button" || ct === "a") return cur;
    var role = cur.getAttribute && cur.getAttribute("role");
    if (/^(button|link|menuitem|tab|option)$/.test(role || "")) return cur;
    cur = cur.parentElement; depth++;
  }
  return null;
}

// Emit XPaths that resolve to the clickable wrapper of a text element
function appendClickableAncestorXPaths(el, t, txt, oTxt, r) {
  // Only relevant when the element itself is NOT directly clickable
  if (/^(a|button|input|select|textarea)$/.test(t)) return;
  var role = el.getAttribute && el.getAttribute("role");
  if (/^(button|link|menuitem|tab|option)$/.test(role || "")) return;

  var anc = clickableAncestor(el);
  if (!anc) return;
  var at = tagOf(anc);
  var ancExpr = (at === "button" || at === "a")
    ? at
    : "*[@role=" + wq(anc.getAttribute("role")) + "]";

  var useTxt = (oTxt && oTxt.length <= 50 && !looksDynamic(oTxt)) ? oTxt
             : (txt && txt.length <= 50 && !looksDynamic(txt)) ? txt : "";

  if (useTxt) {
    // text element -> resolve up to the clickable ancestor
    r.push("//" + t + "[normalize-space()=" + wq(useTxt) +
           "]/ancestor::" + ancExpr + "[1]");
    // clickable ancestor that CONTAINS this text (often cleaner)
    r.push("//" + ancExpr + "[.//*[normalize-space()=" + wq(useTxt) + "]]");
  }

  // Anchor on a stable attribute of the text element, resolve to ancestor
  ["data-label", "title", "aria-label"].forEach(function (a) {
    var v = el.getAttribute(a);
    if (v && v.length < 60 && !looksDynamic(v)) {
      r.push("//" + t + "[@" + a + "=" + wq(v) +
             "]/ancestor::" + ancExpr + "[1]");
    }
  });
}

// Dropdown option XPaths — both text-based and POSITION-based (#N)
function appendDropdownOptionXPaths(el, t, r) {
  var optEl = el.closest(
    "[role='option'],lightning-base-combobox-item,[role='listbox'] li"
  );
  if (!optEl) {
    // maybe the clicked element IS the option container
    if (!(el.getAttribute && el.getAttribute("role") === "option")) return;
    optEl = el;
  }

  var listbox = optEl.closest("[role='listbox'],ul.slds-listbox,.slds-dropdown");
  var optTxt = fullText(optEl);
  if (optTxt.length > 60) {
    var sp = optEl.querySelector("span");
    optTxt = sp ? sp.textContent.trim() : "";
  }

  // Position of this option among its siblings
  var idx = 1;
  if (listbox) {
    var opts = listbox.querySelectorAll(
      "[role='option'],lightning-base-combobox-item,li"
    );
    for (var i = 0; i < opts.length; i++) {
      if (opts[i] === optEl || opts[i].contains(el)) { idx = i + 1; break; }
    }
  }

  // --- text-based (when option text is stable) ---
  if (optTxt && optTxt.length < 60 && !looksDynamic(optTxt)) {
    r.push("//lightning-base-combobox-item[.//span[text()=" + wq(optTxt) + "]]");
    r.push("//*[@role='option'][normalize-space()=" + wq(optTxt) + "]");
  }

  // --- POSITION-based (select option #N without text) ---
  r.push("(//lightning-base-combobox-item)[" + idx + "]");
  r.push("(//*[@role='option'])[" + idx + "]");
  r.push("(//div[@role='listbox']//*[@role='option'])[" + idx + "]");
  r.push("(//ul[contains(@class,'slds-listbox')]/li)[" + idx + "]");
}

// Neighbor-anchored XPaths (label/heading nearby with unique text)
function appendNeighborXPaths(el, t, txt, r) {
  function isUniqueText(text, tag) {
    var xp = "//" + tag + "[normalize-space()=" + wq(text) + "]";
    return countMatches(xp) === 1;
  }
  function labelText(node) {
    if (!node || !node.tagName) return "";
    var tx = fullText(node);
    if (!tx || tx.length > 40) return "";
    if (node.children && node.children.length > 3) return "";
    return tx;
  }

  // direct previous/next siblings
  var prev = el.previousElementSibling;
  if (prev) {
    var pTx = labelText(prev), pTag = tagOf(prev);
    if (pTx && !looksDynamic(pTx) && isUniqueText(pTx, pTag)) {
      r.push("//" + pTag + "[normalize-space()=" + wq(pTx) + "]/following-sibling::" + t + "[1]");
      r.push("//" + pTag + "[normalize-space()=" + wq(pTx) + "]/following::" + t + "[1]");
    }
  }
  var next = el.nextElementSibling;
  if (next) {
    var nTx = labelText(next), nTag = tagOf(next);
    if (nTx && !looksDynamic(nTx) && isUniqueText(nTx, nTag)) {
      r.push("//" + nTag + "[normalize-space()=" + wq(nTx) + "]/preceding-sibling::" + t + "[1]");
    }
  }

  // nearest heading in the surrounding section
  var section = el.closest("section,article,fieldset,.slds-section,.slds-card,[role='region']");
  if (section) {
    var h = section.querySelector("h1,h2,h3,h4,h5,h6,.slds-section__title,.slds-card__header-title");
    if (h) {
      var hTx = fullText(h), hTag = tagOf(h);
      if (hTx && hTx.length < 60 && !looksDynamic(hTx)) {
        var headExpr = /^h[1-6]$/.test(hTag) ? hTag : "*";
        r.push("//" + headExpr + "[normalize-space()=" + wq(hTx) + "]/following::" + t + "[1]");
      }
    }
  }
}

// Table & Lightning-grid anchoring
function appendTableXPaths(el, t, r) {
  // header click
  if (t === "th" || (el.getAttribute && el.getAttribute("role") === "columnheader")) {
    var thTxt = cleanHeaderText(el);
    if (thTxt && thTxt.length < 50) {
      r.push("//th[normalize-space()=" + wq(thTxt) + "]");
      r.push("//*[@role='columnheader'][.//*[normalize-space()=" + wq(thTxt) + "]]");
    }
    return;
  }

  var td = el.closest("td,[role='gridcell'],[role='cell']");
  if (!td) return;
  var tr = td.closest("tr,[role='row']");
  var table = td.closest("table,[role='grid'],[role='treegrid']");
  if (!table || !tr) return;
  var isGrid = !table.matches("table");

  // column index
  var colIdx = 1, sib = td;
  while (sib.previousElementSibling) { sib = sib.previousElementSibling; colIdx++; }

  // header text for this column
  var heads = table.querySelectorAll("thead th, tr:first-child th, [role='columnheader']");
  var headerTxt = cleanHeaderText(heads[colIdx - 1]);

  var rowExpr = isGrid ? "//*[@role='row']" : "//tr";
  var cellExpr = isGrid ? "/*[@role='gridcell' or @role='cell']" : "/td";
  var linkTxt = t === "a" ? fullText(el) : "";

  // header-based column anchor (text-free, position by column)
  if (headerTxt && headerTxt.length < 40) {
    if (isGrid) {
      r.push("//*[@role='columnheader'][.//*[normalize-space()=" + wq(headerTxt) +
             "]]/ancestor::*[@role='grid' or @role='treegrid']" +
             "//*[@role='row'][2]/*[@role='gridcell'][" + colIdx + "]//" + t + "[1]");
    } else {
      r.push("//th[normalize-space()=" + wq(headerTxt) +
             "]/ancestor::table//tbody//tr[1]/td[" + colIdx + "]//" + t + "[1]");
    }
  }

  // row identifier — cleanest other cell
  var cells = tr.querySelectorAll("td,[role='gridcell'],[role='cell']");
  var bestKey = { score: 1e9, txt: "" };
  for (var i = 0; i < cells.length; i++) {
    if (cells[i] === td) continue;
    var raw = fullText(cells[i]);
    if (!raw || raw.length < 2 || raw.length > 50) continue;
    if (/^(edit|delete|view|more|\u2026)$/i.test(raw)) continue;
    if (looksDynamic(raw)) continue;
    var sc = raw.length + cells[i].children.length * 3;
    if (sc < bestKey.score) bestKey = { score: sc, txt: raw };
  }
  var rowKey = bestKey.txt;
  if (rowKey) {
    r.push(rowExpr + "[.//*[normalize-space()=" + wq(rowKey) + "]]//" + t + "[1]");
    if (linkTxt && !looksDynamic(linkTxt))
      r.push(rowExpr + "[.//*[normalize-space()=" + wq(rowKey) + "]]//a[normalize-space()=" + wq(linkTxt) + "]");
    if (headerTxt)
      r.push(rowExpr + "[.//*[normalize-space()=" + wq(rowKey) + "]]" + cellExpr + "[" + colIdx + "]//" + t + "[1]");
  }

  // table-scoped fallback
  var tblAria = table.getAttribute("aria-label");
  if (tblAria && tblAria.length < 60) {
    var scope = "//" + (isGrid ? "*" : "table") + "[@aria-label=" + wq(tblAria) + "]";
    r.push(scope + cellExpr.replace("/", "//") + "[" + colIdx + "]//" + t);
  }
}

// Combine two stable attributes into one XPath
function appendCombinationXPaths(el, t, txt, r) {
  var props = [];
  if (txt && txt.length < 50 && !looksDynamic(txt))
    props.push("normalize-space()=" + wq(txt));
  ["title", "name", "placeholder", "data-id", "data-label", "data-name", "aria-label", "role"]
    .forEach(function (a) {
      var v = el.getAttribute(a);
      if (v && v.length < 60 && !looksDynamic(v)) props.push("@" + a + "=" + wq(v));
    });
  for (var i = 0; i < props.length; i++) {
    for (var j = i + 1; j < props.length; j++) {
      r.push("//" + t + "[" + props[i] + " and " + props[j] + "]");
    }
  }
}

// Short positional XPath (stops at body or first stable id)
function positionalXPath(el) {
  var parts = [], c = el, max = 6;
  while (c && c.nodeType === 1 && max > 0) {
    var tg = tagOf(c);
    if (tg === "body" || tg === "html") break;
    if (c.id && /^[a-zA-Z][\w-]*$/.test(c.id) && !isFlakyId(c.id)) {
      parts.unshift(tg + "[@id='" + c.id + "']"); break;
    }
    var sib = c, cnt = 0, pos = 0;
    while (sib) {
      if (sib.nodeType === 1 && tagOf(sib) === tg) { cnt++; if (sib === c) pos = cnt; }
      sib = sib.previousElementSibling;
    }
    parts.unshift(cnt > 1 ? tg + "[" + pos + "]" : tg);
    c = c.parentElement; max--;
  }
  return parts.length ? "//" + parts.join("/") : "//*";
}

// Validate, rank by stability score, return up to 6 diverse XPaths
function rankAndPick(rawList, el) {
  var seen = {}, valid = [];
  rawList.forEach(function (xp) {
    if (!xp || seen[xp]) return;
    seen[xp] = 1;
    valid.push({ xp: xp, count: countMatches(xp) });
  });

  // If nothing is unique, add an indexed version of the best candidate
  var anyUnique = valid.some(function (v) { return v.count === 1; });
  if (!anyUnique) {
    var best = null;
    valid.forEach(function (v) {
      if (v.count > 0 && v.count < 30 && (!best || v.count < best.count)) best = v;
    });
    if (best) {
      try {
        var res = document.evaluate(best.xp, document, null,
          XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
        var idx = -1;
        for (var i = 0; i < res.snapshotLength; i++) {
          if (res.snapshotItem(i) === el) { idx = i + 1; break; }
        }
        if (idx > 0) {
          var ix = "(" + best.xp + ")[" + idx + "]";
          if (!seen[ix]) { valid.unshift({ xp: ix, count: countMatches(ix) }); seen[ix] = 1; }
        }
      } catch (e) {}
    }
  }

  function score(xp) {
    var s = xp.length / 15;
    if (/\[\d+\]\//.test(xp) || /\/\w+\[\d+\]$/.test(xp)) s += 100; // positional
    if (/^\(/.test(xp)) s += 25;                                    // indexed
    if (/@id=/.test(xp)) s += 60;                                  // id
    if (/@href=/.test(xp)) s += 50;                               // href
    if (xp.indexOf("javascript") > -1) s += 200;
    if (/@data-(id|name|label|testid)/.test(xp)) s -= 25;          // data attrs good
    if (/\/\/th\[|@role='columnheader'/.test(xp)) s -= 30;         // table header
    if (/\/\/tr\[\.\/\/|@role='row'\]\[\.\/\//.test(xp)) s -= 30;  // table row
    if (/\/\/label\[/.test(xp)) s -= 18;                          // label anchor
    if (/following::|preceding::|following-sibling|preceding-sibling/.test(xp)) s -= 8;
    if (/text\(\)|normalize-space/.test(xp)) s -= 10;             // semantic text
    // Resolves to a real clickable element -> .click() will work
    if (/ancestor::(a|button|\*\[@role)/.test(xp)) s -= 22;
    if (/^\/\/(a|button)\[/.test(xp)) s -= 14;                    // starts at clickable
    if (/\/parent::(a|button)/.test(xp)) s -= 12;
    if (/\sand\s/.test(xp) && (xp.match(/=/g) || []).length >= 2) s -= 15; // combination
    // penalize dynamic-looking quoted values
    (xp.match(/'([^']+)'/g) || []).forEach(function (q) {
      if (looksDynamic(q.slice(1, -1))) s += 80;
    });
    return s;
  }

  valid.sort(function (a, b) {
    if (a.count === 1 && b.count !== 1) return -1;
    if (b.count === 1 && a.count !== 1) return 1;
    if (a.count !== b.count) return (a.count < 0 ? 999 : a.count) - (b.count < 0 ? 999 : b.count);
    return score(a.xp) - score(b.xp);
  });

  // diversity: one per technique first
  function category(xp) {
    if (/^\(/.test(xp)) return "position-index";
    if (/@role='columnheader'|\/\/th\[/.test(xp)) return "table-header";
    if (/@role='row'\]\[\.\/\/|\/\/tr\[\.\/\//.test(xp)) return "table-row";
    if (/following-sibling|preceding-sibling/.test(xp)) return "sibling";
    if (/following::|preceding::/.test(xp)) return "axis";
    if (/ancestor::/.test(xp)) return "ancestor";
    if (/parent::/.test(xp)) return "parent";
    if (/\sand\s/.test(xp)) return "combination";
    if (/@data-/.test(xp)) return "data-attr";
    if (/@aria-/.test(xp)) return "aria";
    if (/@title=/.test(xp)) return "title";
    if (/@name=/.test(xp)) return "name";
    if (/@placeholder=/.test(xp)) return "placeholder";
    if (/@id=/.test(xp)) return "id";
    if (/@href=/.test(xp)) return "href";
    if (/normalize-space|text\(\)/.test(xp)) return "text";
    return "other";
  }
  // Prefer candidates that actually match something (count >= 1).
  // Keep 0-hit / invalid ones only as a last resort.
  var good = valid.filter(function (v) { return v.count >= 1; });
  var poolPrimary = good.length ? good : valid;

  var picked = [], usedCat = {};
  for (var p = 0; p < poolPrimary.length && picked.length < 6; p++) {
    var c = category(poolPrimary[p].xp);
    if (!usedCat[c]) { usedCat[c] = true; picked.push(poolPrimary[p]); }
  }
  for (var q = 0; q < poolPrimary.length && picked.length < 6; q++) {
    if (picked.indexOf(poolPrimary[q]) === -1) picked.push(poolPrimary[q]);
  }
  return picked;
}

// Does the first element matched by this XPath actually click?
// True if the element itself, an ancestor, or a child is interactive.
function xpathHitsClickable(xp) {
  try {
    var res = document.evaluate(xp, document, null,
      XPathResult.FIRST_ORDERED_NODE_TYPE, null);
    var node = res.singleNodeValue;
    if (!node || node.nodeType !== 1) return false;
    if (isClickable(node)) return true;
    // clickable ancestor within a few levels
    var cur = node.parentElement, d = 0;
    while (cur && d < 4) { if (isClickable(cur)) return true; cur = cur.parentElement; d++; }
    // clickable descendant
    if (node.querySelector && node.querySelector("a,button,input,select,textarea,[role='button'],[role='link'],[role='option']"))
      return true;
    return false;
  } catch (e) { return false; }
}

// ====================== target resolution ======================

function bestTarget(el, e) {
  var deep = el;
  try {
    var path = e.composedPath && e.composedPath();
    if (path && path.length) {
      for (var i = 0; i < path.length; i++) {
        if (path[i].nodeType === 1 && path[i].tagName) { deep = path[i]; break; }
      }
    }
  } catch (ex) {}
  if (deep === el) {
    try { var fp = document.elementFromPoint(e.clientX, e.clientY); if (fp) deep = fp; } catch (ex) {}
  }
  var t = tagOf(deep);
  if (SVG_TAGS.test(t)) { deep = walkUpToClickable(deep); t = tagOf(deep); }
  if (!isClickable(deep)) {
    var cur = deep, d = 0;
    while (cur && d < 8) { if (isClickable(cur)) { deep = cur; break; } cur = cur.parentElement; d++; }
  }
  return deep;
}

// ====================== hover highlight ======================

function clearHover() {
  if (hoverEl) {
    hoverEl.style.outline = hoverOutline;
    hoverEl.style.backgroundColor = hoverBg;
    hoverEl = null; hoverOutline = ""; hoverBg = "";
  }
}
function onHover(e) {
  if (!on) return;
  var el = e.target;
  try {
    var path = e.composedPath && e.composedPath();
    if (path && path.length && path[0].nodeType === 1) el = path[0];
  } catch (ex) {}
  if (!el || !el.tagName) return;
  if (el.closest && el.closest("#__xf_box,#__xf_toggle")) return;
  if (hoverEl === el) return;
  clearHover();
  hoverEl = el;
  hoverOutline = el.style.outline || "";
  hoverBg = el.style.backgroundColor || "";
  el.style.outline = "2px solid #4fc3f7";
  el.style.backgroundColor = "rgba(79,195,247,0.12)";
}

// ====================== click blocking ======================

function blocker(e) {
  if (!on) return;
  if (e.target.closest && e.target.closest("#__xf_box,#__xf_toggle")) return;
  e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
}
function clickHandler(e) {
  if (!on) return;
  if (e.target.closest && e.target.closest("#__xf_box,#__xf_toggle")) return;
  e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
  show(e.target, e);
}

// ====================== popup ======================

function copyText(text, elem) {
  function flash() {
    if (!elem) return;
    var o = elem.textContent; elem.textContent = "\u2713";
    setTimeout(function () { elem.textContent = o; }, 800);
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(flash);
  } else {
    var ta = document.createElement("textarea");
    ta.value = text; document.body.appendChild(ta); ta.select();
    document.execCommand("copy"); document.body.removeChild(ta); flash();
  }
}

function show(rawEl, e) {
  hide();
  var el = bestTarget(rawEl, e);
  var results = gen(el);
  if (!results.length) return;

  var elTag = tagOf(el);
  var elTxt = fullText(el).substring(0, 30);
  var attrInfo = "";
  ["id", "data-label", "aria-label", "title", "name", "class"].forEach(function (a) {
    var v = el.getAttribute(a);
    if (v && !attrInfo) attrInfo = a + "=" + v.substring(0, 28);
  });

  box = document.createElement("div");
  box.id = "__xf_box";
  box.style.cssText =
    "position:fixed;z-index:2147483647;background:#1e1e1e;color:#d4d4d4;" +
    "padding:12px 14px;border-radius:8px;font:12px monospace;max-width:720px;" +
    "box-shadow:0 4px 18px rgba(0,0,0,0.55);";
  var top = e.clientY + 14, left = e.clientX + 10;
  if (top + 320 > window.innerHeight) top = Math.max(8, e.clientY - 320);
  if (left + 540 > window.innerWidth) left = Math.max(8, e.clientX - 540);
  box.style.top = top + "px"; box.style.left = left + "px";

  var title = document.createElement("div");
  title.style.cssText = "font-weight:bold;margin-bottom:3px;color:#4fc3f7;";
  title.textContent = "XPath (" + results.length + ")  <" + elTag + ">";
  box.appendChild(title);

  var info = document.createElement("div");
  info.style.cssText = "margin-bottom:8px;font-size:11px;color:#90a4ae;";
  info.textContent = (elTxt ? '"' + elTxt + '"' : "(no text)") + (attrInfo ? "  |  " + attrInfo : "");
  box.appendChild(info);

  results.forEach(function (item, i) {
    var row = document.createElement("div");
    row.style.cssText = "margin-bottom:6px;display:flex;align-items:start;gap:6px;";

    var num = document.createElement("span");
    num.style.cssText = "color:#888;min-width:14px;";
    num.textContent = (i + 1) + ".";

    var code = document.createElement("code");
    var uniq = item.count === 1;
    code.style.cssText = "flex:1;word-break:break-all;cursor:pointer;" +
      (uniq ? "color:#a5d6a7;" : "color:#ef9a9a;");
    code.textContent = item.xp;

    var badge = document.createElement("span");
    badge.style.cssText = "font-size:10px;padding:1px 6px;border-radius:3px;white-space:nowrap;" +
      (uniq ? "background:#2e7d32;color:#fff;" : "background:#c62828;color:#fff;");
    badge.textContent = item.count === 1 ? "unique" :
                        item.count === 0 ? "0 hits" :
                        item.count < 0 ? "invalid" : item.count + " hits";

    // clickability indicator: does the matched element actually click?
    var clk = document.createElement("span");
    clk.style.cssText = "font-size:10px;padding:1px 6px;border-radius:3px;white-space:nowrap;";
    var clickable = xpathHitsClickable(item.xp);
    if (clickable) {
      clk.style.background = "#1b5e20"; clk.style.color = "#fff";
      clk.textContent = "clickable";
    } else {
      clk.style.background = "#6d4c00"; clk.style.color = "#ffd54f";
      clk.textContent = "not clickable";
    }

    var copyBtn = document.createElement("button");
    copyBtn.style.cssText = "cursor:pointer;padding:2px 8px;font-size:10px;" +
      "background:#455a64;color:#fff;border:none;border-radius:3px;white-space:nowrap;";
    copyBtn.textContent = "Copy";

    var testBtn = document.createElement("button");
    testBtn.style.cssText = "cursor:pointer;padding:2px 8px;font-size:10px;" +
      "background:#1565c0;color:#fff;border:none;border-radius:3px;white-space:nowrap;";
    testBtn.textContent = "Test";

    code.onclick = function (ev) { ev.stopPropagation(); copyText(item.xp, code); };
    copyBtn.onclick = function (ev) { ev.stopPropagation(); copyText(item.xp, copyBtn); };
    testBtn.onclick = function (ev) {
      ev.stopPropagation();
      copyText("$x(" + JSON.stringify(item.xp) + ")[0].click()", testBtn);
    };

    row.appendChild(num); row.appendChild(code);
    row.appendChild(badge); row.appendChild(clk);
    row.appendChild(copyBtn); row.appendChild(testBtn);
    box.appendChild(row);
  });

  var hint = document.createElement("div");
  hint.style.cssText = "margin-top:6px;font-size:10px;color:#777;";
  hint.textContent = "Copy = copy xpath | Test = copy console click cmd | Green = unique";
  box.appendChild(hint);

  document.body.appendChild(box);
  el.style.outline = "3px solid #4fc3f7";
  setTimeout(function () { try { el.style.outline = ""; } catch (e) {} }, 1800);
}

function hide() {
  if (box && box.parentNode) box.parentNode.removeChild(box);
  box = null;
}

// ====================== toggle + init ======================

var EVENTS = ["mousedown", "pointerdown", "mouseup", "pointerup",
              "dblclick", "contextmenu", "focusout", "blur"];

function toggle() {
  on = !on;
  var btn = document.getElementById("__xf_toggle");
  if (on) {
    EVENTS.forEach(function (ev) { document.addEventListener(ev, blocker, true); });
    document.addEventListener("click", clickHandler, true);
    document.addEventListener("mouseover", onHover, true);
    document.addEventListener("pointermove", onHover, true);
    btn.textContent = "XPath: ON (\u2318\u21E7X)";
    btn.style.background = "#4caf50";
  } else {
    EVENTS.forEach(function (ev) { document.removeEventListener(ev, blocker, true); });
    document.removeEventListener("click", clickHandler, true);
    document.removeEventListener("mouseover", onHover, true);
    document.removeEventListener("pointermove", onHover, true);
    hide(); clearHover();
    btn.textContent = "XPath: OFF (\u2318\u21E7X)";
    btn.style.background = "#f44336";
  }
}

var btn = document.createElement("button");
btn.id = "__xf_toggle";
btn.textContent = "XPath: OFF (\u2318\u21E7X)";
btn.style.cssText =
  "position:fixed;bottom:12px;right:12px;z-index:2147483647;padding:8px 16px;" +
  "font:13px sans-serif;font-weight:bold;color:#fff;background:#f44336;" +
  "border:none;border-radius:8px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,0.3);";
btn.onclick = toggle;
document.body.appendChild(btn);

function shortcut(e) {
  if (e.code === "KeyX" && (e.metaKey || e.ctrlKey) && e.shiftKey) {
    e.preventDefault(); e.stopPropagation(); toggle();
  }
}
window.addEventListener("keydown", shortcut, true);
document.addEventListener("keydown", shortcut, true);

console.log("XPath Finder v10 loaded. Toggle: Cmd/Ctrl+Shift+X or click the button.");
})();
