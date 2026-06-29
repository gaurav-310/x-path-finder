/**
 * sSalesforce XPath Finder v10 (clean rebuild)
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
var mode = "quick";        // "quick" | "extract"
var extractFmt = "compact";   // "compact" | "text" | "json"

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

// Walk up from an SVG/icon/span to a real clickable element.
// Crosses shadow boundaries (e.g. svg inside lightning-primitive-icon
// shadow -> jump to the host -> reach the parent <button>).
function walkUpToClickable(el) {
  var cur = el, depth = 0;
  while (cur && depth < 10) {
    var t = tagOf(cur);
    if (t === "button" || t === "a") return cur;
    var role = cur.getAttribute && cur.getAttribute("role");
    if (role === "button" || role === "menuitem" || role === "tab" ||
        role === "option" || role === "link") return cur;
    if (t === "div" && cur.getAttribute && cur.getAttribute("onclick")) return cur;
    if (cur.parentElement) { cur = cur.parentElement; }
    else {
      var root = cur.getRootNode && cur.getRootNode();
      cur = (root && root.host) ? root.host : null;
    }
    depth++;
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
  // Custom elements: ONLY genuinely interactive ones — NOT layout/page wrappers
  // (one-record-home-flexipage2, records-record-layout-*, force-*, flexipage-*).
  if (t.indexOf("-") > 0) {
    if (/(^|-)(button|link|combobox|menu|tab|toggle|checkbox|radio|input|picklist|datepicker)(-|$)/.test(t)) return true;
    if (el.getAttribute && (el.getAttribute("data-navigation") || el.getAttribute("onclick"))) return true;
    return false;
  }
  return false;
}

// Layout / page wrapper custom elements that must NEVER be used as a locator
// target (one-record-home-flexipage2, records-record-layout-*, flexipage-*, ...).
function isLayoutTag(t) {
  if (!t || t.indexOf("-") < 0) return false;
  return /^(one-|flexipage|forcegenerated|forcecommunity|force-record-layout|records-record-layout|records-lwc|active-|oneflexipage|comm-)/.test(t) ||
         /(flexipage\d*|layout-block|layout-section|layout-row|-template|-container|-region|-broker)$/.test(t);
}

// Is this element a form control (or inside a Lightning form wrapper)?
// Such elements must be anchored by their OWN label, never by a heading/title.
function isFormControl(el) {
  if (!el || !el.tagName) return false;
  var tg = tagOf(el);
  if (/^(input|textarea|select)$/.test(tg)) return true;
  var role = el.getAttribute && el.getAttribute("role");
  if (/^(combobox|listbox|textbox|spinbutton|searchbox|slider|radio|checkbox|switch)$/.test(role || "")) return true;
  if (el.getAttribute && el.getAttribute("aria-haspopup") === "listbox") return true;
  if (closestAcrossShadow(el,
      "lightning-input,lightning-textarea,lightning-select,lightning-combobox," +
      "lightning-picklist,lightning-grouped-combobox,lightning-dual-listbox," +
      "lightning-datepicker,lightning-timepicker,lightning-radio-group," +
      "lightning-checkbox-group,lightning-input-field,lightning-input-address," +
      "lightning-input-name,lightning-input-location,lightning-quill")) return true;
  return false;
}

// Next element going up, crossing shadow boundaries (host elements).
function parentAcrossShadow(el) {
  if (!el) return null;
  if (el.parentElement) return el.parentElement;
  var root = el.getRootNode && el.getRootNode();
  return (root && root.host) ? root.host : null;
}

// Walk up the DOM, jumping across shadow boundaries (host elements).
function closestAcrossShadow(el, selector) {
  var cur = el;
  while (cur) {
    if (cur.nodeType === 1 && cur.matches && cur.matches(selector)) return cur;
    cur = parentAcrossShadow(cur);
  }
  return null;
}

// Find the label text for an input/field — shadow-DOM aware.
function findLabel(el) {
  function clean(s) { return s ? s.replace(/\s+/g, " ").trim() : ""; }

  // 1. label[for=id] — search the element's own root (shadow or document)
  if (el.id) {
    try {
      var root = el.getRootNode && el.getRootNode();
      var sel = 'label[for="' + CSS.escape(el.id) + '"]';
      var lbl = (root && root.querySelector && root.querySelector(sel)) ||
                document.querySelector(sel);
      if (lbl) {
        var s = lbl.querySelector("span");
        var lt = clean((s && s.textContent) || lbl.textContent);
        if (lt) return lt;
      }
    } catch (e) {}
  }

  // 2. aria-labelledby -> referenced element's text
  var alb = el.getAttribute && el.getAttribute("aria-labelledby");
  if (alb) {
    try {
      var rootA = el.getRootNode && el.getRootNode();
      var id0 = alb.split(/\s+/)[0];
      var refEl = (rootA && rootA.getElementById && rootA.getElementById(id0)) ||
                  document.getElementById(id0);
      var rt = clean(refEl && refEl.textContent);
      if (rt) return rt;
    } catch (e) {}
  }

  // 3. a <label> in the SAME shadow root (only when it's a real shadow
  //    root — scoping to that input's shadow keeps it correct).
  try {
    var r = el.getRootNode && el.getRootNode();
    if (r && r !== document && r.host && r.querySelector) {
      var anyLbl = r.querySelector("label,.slds-form-element__label,legend");
      if (anyLbl) {
        var alt = clean(anyLbl.textContent);
        if (alt) return alt;
      }
    }
  } catch (e) {}

  // 4. walk up across shadow hosts to a form wrapper, read its label
  var w = closestAcrossShadow(el,
    "label,.slds-form-element,lightning-input,lightning-combobox," +
    "lightning-checkbox-group,lightning-radio-group,lightning-textarea," +
    "lightning-datepicker,lightning-input-field,lightning-select,lightning-picklist"
  );
  if (w) {
    var wl = w.querySelector(
      "span.slds-form-element__label,label span,legend span,label," +
      ".slds-form-element__legend"
    );
    if (wl && clean(wl.textContent)) return clean(wl.textContent);
  }

  return el.getAttribute("aria-label") || el.getAttribute("data-label") || "";
}

// Get the OPTION label for a single radio/checkbox (NOT the group label).
function optionLabel(el) {
  function clean(s) { return s ? s.replace(/\s+/g, " ").trim() : ""; }

  // 1. its own label[for=id] (the option text)
  if (el.id) {
    try {
      var root = el.getRootNode && el.getRootNode();
      var sel = 'label[for="' + CSS.escape(el.id) + '"]';
      var lbl = (root && root.querySelector && root.querySelector(sel)) ||
                document.querySelector(sel);
      if (lbl) {
        // prefer the text span, skip the faux radio/checkbox span
        var txtSpan = lbl.querySelector(
          ".slds-form-element__label,span:not([class*='faux']):not([class*='_faux'])"
        );
        var lt = clean((txtSpan && txtSpan.textContent) || lbl.textContent);
        if (lt) return lt;
      }
    } catch (e) {}
  }

  // 2. sibling label inside the same .slds-radio / .slds-checkbox wrapper
  var wrap = el.closest(".slds-radio,.slds-checkbox,.slds-button--radio,span,div");
  if (wrap) {
    var wl = wrap.querySelector("label .slds-form-element__label,label span:last-child,label");
    if (wl && clean(wl.textContent)) return clean(wl.textContent);
  }

  // 3. immediate next/prev sibling label
  var sib = el.nextElementSibling || el.previousElementSibling;
  if (sib && tagOf(sib) === "label" && clean(sib.textContent)) return clean(sib.textContent);

  // 4. value or aria-label as last resort
  return el.getAttribute("aria-label") || el.getAttribute("value") || "";
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
  // Skip layout/page wrappers (one-record-home-flexipage2, records-record-layout-*)
  // — they must never become a locator target.
  if (t.indexOf("-") > 0 && !isLayoutTag(t)) {
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
    if (root && root !== document && root.host && !isLayoutTag(tagOf(root.host))) {
      var h = root.host, ht = tagOf(h);
      ["data-id", "data-name", "data-label", "aria-label", "title"].forEach(function (a) {
        var hv = h.getAttribute(a);
        if (hv && !looksDynamic(hv)) r.push("//" + ht + "[@" + a + "=" + wq(hv) + "]");
      });
    }
  } catch (e) {}

  // ---------- Button ----------
  if (t === "button") {
    // title (close/icon buttons usually have it)
    if (el.getAttribute("title"))
      r.push("//button[@title=" + wq(el.getAttribute("title")) + "]");
    // aria-label
    if (el.getAttribute("aria-label") && !looksDynamic(el.getAttribute("aria-label")))
      r.push("//button[@aria-label=" + wq(el.getAttribute("aria-label")) + "]");
    // assistive text span (icon-only buttons: <span class="slds-assistive-text">Close</span>)
    var asst = el.querySelector(".slds-assistive-text,[class*='assistive']");
    var asstTxt = asst ? asst.textContent.trim() : "";
    if (asstTxt && asstTxt.length < 50 && !looksDynamic(asstTxt))
      r.push("//button[.//span[normalize-space()=" + wq(asstTxt) + "]]");
    // visible span text
    var bSpan = el.querySelector(":scope > span, :scope > div > span") || el.querySelector("span");
    var bSpanTxt = bSpan ? bSpan.textContent.trim() : "";
    if (bSpanTxt && bSpanTxt.length < 50 && !looksDynamic(bSpanTxt) && bSpanTxt !== asstTxt)
      r.push("//span[text()=" + wq(bSpanTxt) + "]/parent::button");
    if (txt && !bSpanTxt && !looksDynamic(txt))
      r.push("//button[normalize-space()=" + wq(txt) + "]");
    // stable class (e.g. slds-modal__close)
    var cls = (el.getAttribute("class") || "").split(/\s+/).filter(function (c) {
      return /close|modal__close|cancel|next|save|submit/.test(c) && !looksDynamic(c);
    })[0];
    if (cls) r.push("//button[contains(@class," + wq(cls) + ")]");
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

  // ---------- Combobox / picklist trigger (Lightning dropdown in a form) ----------
  // The trigger is usually <button role="combobox"> (or an input lookup). Anchor it
  // to its OWN field label, NOT a page/section heading.
  var comboHost = closestAcrossShadow(el,
    "lightning-combobox,lightning-picklist,lightning-grouped-combobox,lightning-dual-listbox");
  var isComboTrigger = (el.getAttribute &&
      (el.getAttribute("role") === "combobox" ||
       el.getAttribute("aria-haspopup") === "listbox")) || !!comboHost;
  if (isComboTrigger) {
    var comboLbl = findLabel(el) || (comboHost ? findLabel(comboHost) : "");
    if (comboLbl && comboLbl.length < 60 && !looksDynamic(comboLbl)) {
      if (comboHost) {
        var cHostTag = tagOf(comboHost);
        // MOST RELIABLE: the lightning host scoped by its own label
        r.push("//" + cHostTag + "[.//label[normalize-space()=" + wq(comboLbl) + "]]//" + t +
               "[@role='combobox' or @aria-haspopup='listbox']");
        r.push("//" + cHostTag + "[.//label[normalize-space()=" + wq(comboLbl) + "]]//" + t);
      }
      // SLDS form-element scoped by its own label
      r.push("//*[contains(@class,'slds-form-element')][.//label[normalize-space()=" + wq(comboLbl) +
             "]]//" + t + "[@role='combobox' or @aria-haspopup='listbox']");
      // label -> following combobox trigger
      r.push("//label[normalize-space()=" + wq(comboLbl) + "]/following::" + t + "[@role='combobox'][1]");
    }
    // aria-label on the trigger itself (often equals the field label)
    var cAria = el.getAttribute && el.getAttribute("aria-label");
    if (cAria && !looksDynamic(cAria)) {
      r.push("//" + t + "[@aria-label=" + wq(cAria) + " and @role='combobox']");
      r.push("//" + t + "[@aria-label=" + wq(cAria) + "]");
    }
    // VERIFICATION: the SELECTED value shown in the trigger, scoped to the field
    // label (presence-based verify — matches only when this value is selected).
    var selVal = fullText(el);
    if (selVal && selVal.length < 60 && !looksDynamic(selVal) &&
        selVal !== comboLbl && !/^select(\b| an option|\.\.\.)/i.test(selVal)) {
      if (comboHost) {
        r.push("//" + tagOf(comboHost) + "[.//label[normalize-space()=" + wq(comboLbl) +
               "]]//*[normalize-space()=" + wq(selVal) + "]");
      }
      r.push("//*[contains(@class,'slds-form-element')][.//label[normalize-space()=" + wq(comboLbl) +
             "]]//*[normalize-space()=" + wq(selVal) + "]");
    }
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
  if (t === "input" && (el.type === "radio" || el.type === "checkbox")) {
    var inType = el.type;            // radio | checkbox
    var optLbl = optionLabel(el);    // THIS option's own label (not group)
    var val = el.getAttribute("value");
    var grp = closestAcrossShadow(el,
      "lightning-radio-group,lightning-checkbox-group,fieldset," +
      ".slds-form-element");
    var grpLbl = grp ? findLabel(grp) : "";

    // 1. by value (very stable for radios in Salesforce)
    if (val && !looksDynamic(val))
      r.push("//input[@type='" + inType + "' and @value=" + wq(val) + "]");

    // 2. by this option's own label text (SLDS: input is sibling of label)
    if (optLbl && optLbl.length < 60 && !looksDynamic(optLbl)) {
      r.push("//label[normalize-space()=" + wq(optLbl) +
             "]/preceding-sibling::input[@type='" + inType + "']");
      r.push("//*[normalize-space()=" + wq(optLbl) +
             "]/ancestor::label/preceding-sibling::input[@type='" + inType + "']");
      r.push("//span[contains(@class,'slds-" + inType + "')]" +
             "[.//*[normalize-space()=" + wq(optLbl) + "]]//input");
      // group + option (most precise)
      if (grp && grpLbl && !looksDynamic(grpLbl)) {
        var grpTag = tagOf(grp);
        r.push("//" + (grpTag.indexOf("-") > 0 ? grpTag : "*") +
               "[.//*[normalize-space()=" + wq(grpLbl) + "]]" +
               "//label[normalize-space()=" + wq(optLbl) +
               "]/preceding-sibling::input");
      }
    }

    // 3. label[for] if id is stable
    if (el.id && !isFlakyId(el.id))
      r.push("//label[@for='" + el.id + "']/preceding-sibling::input");
  }

  // ---------- Input / textarea / select via wrappers + label ----------
  if (t === "input" || t === "textarea" || t === "select") {
    var lblTxt = findLabel(el);

    // 0. FIELD/GROUP label — for compound fields (date+time) the inner label is
    //    generic ("Date"/"Time"); the real field label comes from the group
    //    wrapper's legend or from the field name (Preferred_Contact_Date__c ->
    //    "Preferred Contact Date"). Anchor to that so it's unique.
    var grpLblTxt = "";
    var grpWrap = closestAcrossShadow(el,
      "flowruntime-record-field,lightning-record-field,lightning-input-field,fieldset,[role='group']");
    if (grpWrap) {
      var leg = grpWrap.querySelector("legend,.slds-form-element__legend");
      if (leg) { var lt = (leg.textContent || "").replace(/\s+/g, " ").trim();
        if (lt && lt.length < 60 && lt.toLowerCase() !== (lblTxt || "").toLowerCase()) grpLblTxt = lt; }
    }
    if (!grpLblTxt) {
      var nmRaw = el.getAttribute && el.getAttribute("name");
      if (nmRaw && !/^[a-z0-9]{12,}$/i.test(nmRaw)) {
        var human = nmRaw.replace(/__c$/i, "").replace(/[_]+/g, " ").replace(/\s+/g, " ").trim();
        if (human && human.length < 60 && human.toLowerCase() !== (lblTxt || "").toLowerCase() &&
            /[A-Za-z]/.test(human) && human.indexOf(" ") > -1) grpLblTxt = human;
      }
    }
    if (grpLblTxt) {
      // anchor to the field label, then the input (and the sub-label for compound)
      r.push("//*[normalize-space()=" + wq(grpLblTxt) + "]/following::" + t + "[1]");
      if (lblTxt && lblTxt.length < 40 && !looksDynamic(lblTxt))
        r.push("//*[normalize-space()=" + wq(grpLblTxt) +
               "]/following::label[normalize-space()=" + wq(lblTxt) + "]/following::" + t + "[1]");
    }

    // 1. Lightning record-form field: lightning-input-field[field-name]
    var fieldWrap = el.closest("[field-name],[data-field]");
    if (fieldWrap) {
      var fn = fieldWrap.getAttribute("field-name") || fieldWrap.getAttribute("data-field");
      if (fn && !looksDynamic(fn)) {
        r.push("//*[@field-name=" + wq(fn) + "]//" + t);
        r.push("//*[@data-field=" + wq(fn) + "]//" + t);
      }
    }

    // 2. data-label wrapper (most common in Lightning) — scoped to wrapper
    var dlw = el.closest("[data-label]");
    if (dlw) {
      var dl = dlw.getAttribute("data-label");
      if (dl && !looksDynamic(dl)) r.push("//*[@data-label=" + wq(dl) + "]//" + t);
    }

    // 3. SLDS form-element scoped by its OWN label (most reliable —
    //    avoids grabbing a different input elsewhere on the page)
    if (lblTxt && lblTxt.length < 60 && !looksDynamic(lblTxt)) {
      r.push("//*[contains(@class,'slds-form-element')]" +
             "[.//label[normalize-space()=" + wq(lblTxt) + "]]//" + t);
      r.push("//*[contains(@class,'slds-form-element')]" +
             "[.//*[normalize-space()=" + wq(lblTxt) + "]]//" + t);
      // label -> following control (last resort of the label group)
      r.push("//label[normalize-space()=" + wq(lblTxt) + "]/following::" + t + "[1]");
      r.push("//label[contains(normalize-space()," + wq(lblTxt) + ")]/following::" + t + "[1]");
    }

    // 4. label[for] association (only if id is stable)
    if (el.id && !isFlakyId(el.id))
      r.push("//label[@for='" + el.id + "']/following::" + t + "[1]");

    // 5. aria-labelledby -> the labelling element's text
    var alb = el.getAttribute("aria-labelledby");
    if (alb) {
      try {
        var lblEl = document.getElementById(alb.split(/\s+/)[0]);
        var lt = lblEl ? fullText(lblEl) : "";
        if (lt && lt.length < 60 && !looksDynamic(lt))
          r.push("//*[normalize-space()=" + wq(lt) + "]/following::" + t + "[1]");
      } catch (e) {}
    }

    // 6. placeholder (stable, user-visible)
    var ph = el.getAttribute("placeholder");
    if (ph && !looksDynamic(ph)) r.push("//" + t + "[@placeholder=" + wq(ph) + "]");

    // 7. name (only if not auto-generated)
    var nm = el.getAttribute("name");
    if (nm && !isFlakyId(nm)) r.push("//" + t + "[@name=" + wq(nm) + "]");

    // 8. aria-label
    var al = el.getAttribute("aria-label");
    if (al && !looksDynamic(al)) r.push("//" + t + "[@aria-label=" + wq(al) + "]");

    // 9. Lightning host element — search ACROSS shadow boundaries
    //    (the input is often inside lightning-primitive-input-simple's
    //     shadow root, nested inside lightning-input).
    var lwcHost = closestAcrossShadow(el, "lightning-input,lightning-textarea," +
      "lightning-combobox,lightning-input-field,lightning-picklist," +
      "lightning-grouped-combobox,lightning-dual-listbox");
    if (lwcHost) {
      var hostTag = tagOf(lwcHost);
      var hid = lwcHost.getAttribute("data-id");
      if (hid && !looksDynamic(hid))
        r.push("//" + hostTag + "[@data-id=" + wq(hid) + "]//" + t);
      var hfn = lwcHost.getAttribute("field-name") || lwcHost.getAttribute("data-field");
      if (hfn && !looksDynamic(hfn))
        r.push("//" + hostTag + "[@field-name=" + wq(hfn) + "]//" + t);
      if (lblTxt && lblTxt.length < 60 && !looksDynamic(lblTxt)) {
        // MOST RELIABLE for shadow-nested inputs: host scoped by its label
        r.push("//" + hostTag + "[.//label[normalize-space()=" + wq(lblTxt) + "]]//" + t);
        r.push("//" + hostTag + "[.//label[contains(normalize-space()," + wq(lblTxt) + ")]]//" + t);
      }
    }
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

  // ---------- Modal / dialog scoping (popups, e.g. New Product form) ----------
  appendModalScopedXPaths(el, t, txt, r);

  // ---------- Read-only record field (for VERIFICATION) ----------
  appendRecordFieldXPaths(el, t, r);

  // ---------- Positional fallback (short) ----------
  r.push(positionalXPath(el));

  // ---------- Dedupe + validate + rank + diversify ----------
  return rankAndPick(r, el);
}

// Find nearest clickable ancestor (button / a / [role=button|link|...]),
// crossing shadow boundaries.
function clickableAncestor(el) {
  var cur = parentAcrossShadow(el), depth = 0;
  while (cur && depth < 8) {
    var ct = tagOf(cur);
    if (ct === "button" || ct === "a") return cur;
    var role = cur.getAttribute && cur.getAttribute("role");
    if (/^(button|link|menuitem|tab|option)$/.test(role || "")) return cur;
    cur = parentAcrossShadow(cur); depth++;
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

// Dropdown option XPaths — by data-value, by text, and by POSITION (#N)
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

  // VALUE of the option. Salesforce sets data-value on combobox items; fall back to
  // title, then the visible text (incl. a .slds-truncate / span child if the item's
  // own textContent reads empty — e.g. when the click resolves to a wrapper).
  var optVal = (optEl.getAttribute &&
    (optEl.getAttribute("data-value") || optEl.getAttribute("title"))) || "";
  var optTxt = fullText(optEl);
  if (!optTxt || optTxt.length > 60) {
    var tEl = optEl.querySelector && optEl.querySelector("[title],.slds-truncate,span");
    optTxt = (tEl && (tEl.getAttribute("title") || (tEl.textContent || "").trim())) || optVal || "";
  }
  if (optTxt.length > 60) optTxt = "";

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

  // Owning dropdown's field label (to scope options to THIS dropdown)
  var comboHost = closestAcrossShadow(optEl,
    "lightning-combobox,lightning-grouped-combobox,lightning-picklist,lightning-base-combobox");
  if (!comboHost && listbox && listbox.id) {
    try {
      var trigRes = document.evaluate("//*[@aria-controls=" + wq(listbox.id) + "]",
        document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
      var trig = trigRes.singleNodeValue;
      if (trig) comboHost = closestAcrossShadow(trig,
        "lightning-combobox,lightning-grouped-combobox,lightning-picklist");
    } catch (e) {}
  }
  var fieldLbl = comboHost ? findLabel(comboHost) : "";
  var hostScope = (fieldLbl && fieldLbl.length < 60 && !looksDynamic(fieldLbl))
    ? "//" + tagOf(comboHost) + "[.//label[normalize-space()=" + wq(fieldLbl) + "]]" : "";

  // --- by DATA-VALUE (most reliable for Lightning combobox items) ---
  if (optVal && optVal.length < 60 && !looksDynamic(optVal)) {
    if (hostScope) r.push(hostScope + "//*[@role='option'][@data-value=" + wq(optVal) + "]");
    r.push("//lightning-base-combobox-item[@data-value=" + wq(optVal) + "]");
    r.push("//*[@role='option'][@data-value=" + wq(optVal) + "]");
  }

  // --- by TEXT (value-included; great for verification) ---
  if (optTxt && optTxt.length < 60 && !looksDynamic(optTxt)) {
    if (hostScope) {
      r.push(hostScope + "//*[@role='option'][normalize-space()=" + wq(optTxt) + "]");
      r.push(hostScope + "//lightning-base-combobox-item[.//span[normalize-space()=" + wq(optTxt) + "]]");
    }
    r.push("//*[@role='option'][normalize-space()=" + wq(optTxt) + "]");
    r.push("//lightning-base-combobox-item[.//span[normalize-space()=" + wq(optTxt) + "]]");
  }

  // --- by POSITION (select option #N without text) ---
  if (hostScope) r.push("(" + hostScope + "//*[@role='option'])[" + idx + "]");
  r.push("(//lightning-base-combobox-item)[" + idx + "]");
  r.push("(//*[@role='option'])[" + idx + "]");
  r.push("(//div[@role='listbox']//*[@role='option'])[" + idx + "]");
  r.push("(//ul[contains(@class,'slds-listbox')]/li)[" + idx + "]");
}

// Neighbor-anchored XPaths (label/heading nearby with unique text)
function appendNeighborXPaths(el, t, txt, r) {
  // never anchor neighbors/headings to a layout/page wrapper tag
  if (isLayoutTag(t)) return;
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

  // Heading anchor — ONLY for non-form elements. Any form control (input, select,
  // combobox/picklist trigger, lookup, datepicker, radio/checkbox group, ...) must
  // be anchored by its OWN label, never by the form/section/page heading.
  if (isFormControl(el)) return;

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
// Pick the navigable element tag inside a datatable cell.
// Prefers a custom link element (records-hoverable-link, *-link), then <a>,
// otherwise falls back to the clicked element's own tag.
function cellLinkTag(cellEl, clickedTag) {
  if (/-link$/.test(clickedTag) || clickedTag === "a") return clickedTag;
  // Prefer a custom link element; else ANY anchor (list-view links often have no
  // href / use lstOutputLookup), else a role=link.
  var custom = cellEl.querySelector(
    "records-hoverable-link,lightning-formatted-url,a[href],a,[role='link']"
  );
  if (custom) {
    var ct = tagOf(custom);
    return ct === "lightning-formatted-url" ? (custom.querySelector("a") ? "a" : ct) : ct;
  }
  return clickedTag;
}

// Salesforce lightning-datatable cells expose data-label="<Column Header>".
// Build column-anchored XPaths (position by row, and row-anchored by data-row-number)
// that ignore the link's value — works for <td> and <th> rowheader cells.
function appendDataLabelCellXPaths(el, t, r) {
  var cell = el.closest(
    "td[data-label],th[data-label],[role='gridcell'][data-label],[role='rowheader'][data-label]"
  );
  if (!cell) return;
  var dl = cell.getAttribute("data-label");
  if (!dl || dl.length > 60) return;

  var cellTag = tagOf(cell);                 // td or th (keep exact so it matches)
  var linkTag = cellLinkTag(cell, t);        // records-hoverable-link / a / ...

  // 1) position-based: Nth row's link in this column (what you asked for)
  r.push("(//" + cellTag + "[@data-label=" + wq(dl) + "]//" + linkTag + ")[1]");

  // 2) row-anchored by the row's data-row-number (deterministic per row)
  var trNum = cell.closest("tr[data-row-number]");
  if (trNum && trNum.getAttribute("data-row-number")) {
    r.push("//tr[@data-row-number=" + wq(trNum.getAttribute("data-row-number")) +
           "]//" + cellTag + "[@data-label=" + wq(dl) + "]//" + linkTag);
  }

  // 3) un-indexed base (all rows in this column) — handy as a building block
  r.push("//" + cellTag + "[@data-label=" + wq(dl) + "]//" + linkTag);
}

function appendTableXPaths(el, t, r) {
  // COLUMN header click — the header is often a SORT BUTTON, so the click may
  // resolve to a <button>/<span> INSIDE the header cell. Detect the owning
  // column-header cell (not a rowheader data cell).
  var headerCell = (el.getAttribute && el.getAttribute("role") === "columnheader")
    ? el
    : (el.closest && el.closest("th,[role='columnheader']"));
  function isColumnHeader(c) {
    if (!c) return false;
    var role = c.getAttribute && c.getAttribute("role");
    if (role === "columnheader") return true;
    if (role === "rowheader") return false;                 // data cell, not a header
    var scope = c.getAttribute && c.getAttribute("scope");
    if (scope === "col") return true;
    if (scope === "row") return false;                      // data cell
    return !!(c.closest && c.closest("thead"));             // in <thead> => header
  }
  if (headerCell && isColumnHeader(headerCell)) {
    var rawHdr = cleanHeaderText(headerCell) ||
                 (headerCell.getAttribute && (headerCell.getAttribute("aria-label") ||
                  headerCell.getAttribute("data-label"))) || "";
    // Strip Salesforce sort wording: "Sort by:Opportunity Name" -> "Opportunity Name",
    // and trailing "- currently sorted ascending" etc.
    var colName = rawHdr
      .replace(/^\s*sort(ed)?\s*by\s*:?\s*/i, "")
      .replace(/\s*[-\u2013]\s*(currently\s*)?sorted.*$/i, "")
      .trim();
    var headerTextForSort = rawHdr.trim();

    if (colName && colName.length < 50) {
      // FIRST data-cell LINK under this column (the common need) — uses the CLEAN
      // column name, which is what lightning-datatable puts in cells' data-label.
      r.push("(//*[(self::td or self::th) and @data-label=" + wq(colName) +
             "]//*[self::a or self::records-hoverable-link or self::lightning-formatted-url])[1]");
      r.push("(//td[@data-label=" + wq(colName) + "]//a)[1]");
      r.push("(//th[@data-label=" + wq(colName) + "]//records-hoverable-link)[1]");
      // the column header / sort cell itself
      r.push("//th[@data-label=" + wq(colName) + "]");
      r.push("//*[@role='columnheader'][.//*[contains(normalize-space()," + wq(colName) + ")]]");
    }
    // the exact sort link the user clicked (kept for sorting use)
    if (headerTextForSort && headerTextForSort.length < 60) {
      r.push("//a[normalize-space()=" + wq(headerTextForSort) + " and @role='button']");
    }
    return;
  }

  // ---- Salesforce lightning-datatable: data-label is the most reliable column anchor.
  //      Cells can be <td> OR <th scope=row role=rowheader>, and the clickable can be a
  //      custom element (records-hoverable-link, lightning-formatted-url) not a plain <a>. ----
  appendDataLabelCellXPaths(el, t, r);

  var td = el.closest("td,th,[data-label],[role='gridcell'],[role='cell'],[role='rowheader']");
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

// Nearest modal/dialog ancestor (shadow-aware).
function modalAncestor(el) {
  return closestAcrossShadow(el,
    "[role='dialog'],[role='alertdialog'],.slds-modal,.slds-modal__container," +
    ".forceModal,.uiModal,lightning-modal,.modal-container,section.slds-modal");
}

// Modal/dialog scoping — a Submit/Save/Cancel button (or any control) inside a
// popup must be scoped to THAT open dialog, not matched against the background
// page (where another "Submit" may exist). Prefer scoping by the modal title.
function appendModalScopedXPaths(el, t, txt, r) {
  var modal = modalAncestor(el);
  if (!modal) return;

  var titleEl = modal.querySelector(
    ".slds-modal__title,.slds-modal__header h1,.slds-modal__header h2," +
    "h1,h2,[id*='modal-heading'],header h2");
  var titleTxt = titleEl ? fullText(titleEl) : "";

  var scopes = [];
  if (titleTxt && titleTxt.length < 60 && !looksDynamic(titleTxt)) {
    scopes.push("//*[@role='dialog'][.//*[normalize-space()=" + wq(titleTxt) + "]]");
  }
  scopes.push("//*[@role='dialog']");
  scopes.push("//*[contains(@class,'slds-modal')]");

  // text/label that identifies this control inside the modal
  var label = txt;
  if (!label && (t === "button" || t === "a")) {
    var sp = el.querySelector("span");
    label = (sp && sp.textContent.trim()) || "";
  }
  var aria = el.getAttribute && el.getAttribute("aria-label");

  scopes.forEach(function (scope) {
    if (label && label.length < 50 && !looksDynamic(label) && (t === "button" || t === "a")) {
      r.push(scope + "//" + t + "[normalize-space()=" + wq(label) + "]");
    }
    if (aria && !looksDynamic(aria)) {
      r.push(scope + "//" + t + "[@aria-label=" + wq(aria) + "]");
    }
  });
}

// Read-only record-detail field (record pages). For VERIFICATION: anchor by the
// field-label attribute / SLDS label and point at the VALUE container so the test
// can read getText()/getAttribute()/getCssValue(). NOTE: if the field is in native
// shadow DOM these will show 0 hits — use the deep-shadow getFieldValueByLabel()
// helper (see VERIFY-FIELD-VALUE.md) for those.
function appendRecordFieldXPaths(el, t, r) {
  var item = closestAcrossShadow(el, "records-record-layout-item,[field-label]");
  var sldsEl = closestAcrossShadow(el, ".slds-form-element");
  var host = item || sldsEl;
  if (!host) return;

  // label: field-label attr, else a recognized label element, else findLabel
  var fl = (host.getAttribute && host.getAttribute("field-label")) || "";
  var lblEl = host.querySelector &&
    host.querySelector(".slds-form-element__label,.test-id__field-label,legend");
  var lbl = (fl || (lblEl && lblEl.textContent) || findLabel(el) || "")
              .replace(/^\s*sort(ed)?\s*by\s*:?\s*/i, "").replace(/\s+/g, " ").trim();
  if (!lbl || lbl.length > 60 || looksDynamic(lbl)) return;

  // value = the clicked element's own text (when you click the value, not the label)
  var valTxt = fullText(el);
  if (valTxt === lbl) valTxt = "";

  // 1. field-label attribute anchors (cleanest when present)
  if (fl && !looksDynamic(fl)) {
    r.push("//records-record-layout-item[@field-label=" + wq(fl) + "]");
    r.push("//*[@field-label=" + wq(fl) + "]//lightning-formatted-text");
    r.push("//*[@field-label=" + wq(fl) + "]//*[contains(@class,'slds-form-element__static')]");
  }

  // 2. value CONTAINER scoped by label (for getText-based verify)
  r.push("//*[contains(@class,'slds-form-element')][.//*[normalize-space()=" + wq(lbl) +
         "]]//*[contains(@class,'slds-form-element__static')]");

  // 3. value-INCLUDED, label-scoped (PRESENCE-based verify — matches only when the
  //    value is correct; this is the //div[slds-form-element][label]//span[value] pattern)
  if (valTxt && valTxt.length < 60 && !looksDynamic(valTxt)) {
    r.push("//*[contains(@class,'slds-form-element')][.//*[normalize-space()=" + wq(lbl) +
           "]]//*[normalize-space()=" + wq(valTxt) + "]");
    r.push("//*[normalize-space()=" + wq(lbl) +
           "]/ancestor::*[contains(@class,'slds-form-element')][1]" +
           "//lightning-formatted-text[normalize-space()=" + wq(valTxt) + "]");
    r.push("//*[normalize-space()=" + wq(lbl) +
           "]/ancestor::*[contains(@class,'slds-form-element')][1]//*[normalize-space()=" + wq(valTxt) + "]");
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
    // Skip XPaths that reference the finder's own injected UI
    if (/XPath:\s*(ON|OFF)|Mode:\s|__xf_/.test(xp)) return;
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
    // Modal/dialog-scoped (unique inside popups — Submit/Save/Cancel)
    if (/@role='dialog'|slds-modal/.test(xp)) s -= 24;
    // Layout/page wrappers are useless as a target — bury them hard
    if (/(one-[\w-]*flexipage|records-record-layout|force-record-layout|flexipage-|forcegenerated|records-lwc)/.test(xp)) s += 300;
    // Salesforce form-field strategies (very reliable for inputs)
    if (/lightning-[a-z-]+\[\.\/\/label.*\/\/(input|textarea|select)/.test(xp)) s -= 34; // host scoped by label (best for shadow)
    if (/slds-form-element.*\/\/(input|textarea|select)/.test(xp)) s -= 28;
    if (/@field-name=|@data-field=/.test(xp)) s -= 30;   // record-form field
    if (/@data-label=.*\/\/(input|textarea|select)/.test(xp)) s -= 24;
    if (/@placeholder=/.test(xp)) s -= 12;               // user-visible, stable
    // Heading-following anchors are bad for inputs — penalize hard
    if (/\/\/h[1-6]\[.*following::(input|textarea|select)/.test(xp)) s += 70;
    // Radio/checkbox: value-based and option-label-scoped are best
    if (/@type='(radio|checkbox)' and @value=/.test(xp)) s -= 30;
    if (/slds-(radio|checkbox)'\)\]\[\.\/\//.test(xp)) s -= 26;
    if (/\/preceding-sibling::input/.test(xp)) s -= 14;
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

// Build the right Console command for an XPath based on the element type.
//  - text input / textarea -> focus + set value + dispatch input/change/blur
//  - contenteditable        -> focus + set text + dispatch input
//  - everything else        -> scrollIntoView + focus + click
function testCommandFor(xp) {
  var kind = "click";
  try {
    var res = document.evaluate(xp, document, null,
      XPathResult.FIRST_ORDERED_NODE_TYPE, null);
    var node = res.singleNodeValue;
    if (node && node.nodeType === 1) {
      var tg = tagOf(node);
      var typ = (node.getAttribute && (node.getAttribute("type") || "")).toLowerCase();
      if (tg === "textarea") kind = "input";
      else if (tg === "input" && !/^(checkbox|radio|button|submit|reset|file)$/.test(typ)) kind = "input";
      else if (node.getAttribute && node.getAttribute("contenteditable") === "true") kind = "ce";
    }
  } catch (e) {}

  var xj = JSON.stringify(xp);
  if (kind === "input") {
    return "(function(){var e=$x(" + xj + ")[0];e.scrollIntoView({block:'center'});" +
           "e.focus();e.value='YOUR_TEXT';" +
           "e.dispatchEvent(new Event('input',{bubbles:true}));" +
           "e.dispatchEvent(new Event('change',{bubbles:true}));" +
           "e.dispatchEvent(new Event('blur',{bubbles:true}));})()";
  }
  if (kind === "ce") {
    return "(function(){var e=$x(" + xj + ")[0];e.scrollIntoView({block:'center'});" +
           "e.focus();e.textContent='YOUR_TEXT';" +
           "e.dispatchEvent(new Event('input',{bubbles:true}));})()";
  }
  return "(function(){var e=$x(" + xj + ")[0];e.scrollIntoView({block:'center'});" +
         "e.focus();e.click();})()";
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
    // clickable ancestor within a few levels (cross shadow)
    var cur = parentAcrossShadow(node), d = 0;
    while (cur && d < 6) { if (isClickable(cur)) return true; cur = parentAcrossShadow(cur); d++; }
    // clickable descendant
    if (node.querySelector && node.querySelector("a,button,input,select,textarea,[role='button'],[role='link'],[role='option']"))
      return true;
    return false;
  } catch (e) { return false; }
}

// ====================== interaction-kind detection ======================

// Classify an element so the AI / user knows HOW to interact with it.
// Returns one of: text-input, textarea, contenteditable, select,
// dropdown-trigger, dropdown-option, checkbox, radio, link, button,
// hover-click, key-target, generic.
function detectKind(el) {
  var t = tagOf(el);
  var type = (el.getAttribute && (el.getAttribute("type") || "")).toLowerCase();
  var role = (el.getAttribute && (el.getAttribute("role") || "")).toLowerCase();

  if (t === "textarea") return "textarea";
  if (el.getAttribute && el.getAttribute("contenteditable") === "true") return "contenteditable";
  if (t === "select") return "select";
  if (t === "input") {
    if (type === "checkbox") return "checkbox";
    if (type === "radio") return "radio";
    if (/^(button|submit|reset)$/.test(type)) return "button";
    if (type === "file") return "file";
    return "text-input"; // text, email, tel, number, search, url, date...
  }
  if (role === "checkbox" || role === "switch") return "checkbox";
  if (role === "radio") return "radio";
  if (role === "option" || el.closest && el.closest("[role='option'],lightning-base-combobox-item")) return "dropdown-option";
  if (role === "combobox" || (el.closest && el.closest("lightning-combobox,lightning-grouped-combobox,[role='combobox']"))) return "dropdown-trigger";
  if (role === "tab" || (el.closest && el.closest("[role='tab'],lightning-tab"))) return "tab";
  if (role === "menuitem" || (el.closest && el.closest("[role='menuitem']"))) return "menu-item";
  if (t === "a") return "link";
  if (t === "button" || role === "button") return "button";
  // inside a menu/popover that usually needs hover
  if (el.closest && el.closest("[role='menu'],.slds-dropdown,.slds-popover")) return "hover-click";
  if (isClickable(el)) return "button";
  return "generic";
}

// How to interact with each kind (Console + Selenium Java summary)
function interactionFor(kind) {
  switch (kind) {
    case "text-input":
    case "textarea":
      return {
        console: "focus + set value + dispatch input/change/blur",
        java: "el.clear(); el.sendKeys(value);  // or JS dispatch if sendKeys fails"
      };
    case "contenteditable":
      return {
        console: "focus + set textContent + dispatch input",
        java: "JS: el.textContent=value; dispatch input event"
      };
    case "select":
      return {
        console: "set selectedIndex / option + dispatch change",
        java: "new Select(el).selectByVisibleText(value);"
      };
    case "dropdown-trigger":
      return { console: "click to open", java: "el.click();" };
    case "dropdown-option":
      return { console: "click the option (by text or position)", java: "el.click();" };
    case "checkbox":
    case "radio":
      return { console: "click", java: "if(!el.isSelected()) el.click();" };
    case "hover-click":
      return { console: "hover then click", java: "new Actions(driver).moveToElement(el).click().perform();" };
    case "tab":
      return { console: "click the tab", java: "el.click();  // wait for tab panel to load" };
    case "menu-item":
      return { console: "open the menu first, then click item", java: "el.click();" };
    case "link":
    case "button":
      return { console: "focus + click", java: "el.click();" };
    default:
      return { console: "focus + click (verify it responds)", java: "el.click();" };
  }
}

// ====================== extract-for-AI report ======================

function allAttrs(el) {
  var o = {};
  if (el && el.attributes) {
    for (var i = 0; i < el.attributes.length; i++) {
      o[el.attributes[i].name] = el.attributes[i].value;
    }
  }
  return o;
}

function describeShort(el) {
  if (!el || !el.tagName) return "(none)";
  var t = tagOf(el);
  var idp = el.id ? "#" + el.id : "";
  var rolep = el.getAttribute && el.getAttribute("role") ? "[role=" + el.getAttribute("role") + "]" : "";
  var tx = fullText(el); if (tx.length > 30) tx = tx.substring(0, 30) + "...";
  return t + idp + rolep + (tx ? ' "' + tx + '"' : "");
}

// If the element is a dropdown option/trigger, enumerate ALL options
// in the open listbox with both by-text and by-position XPaths.
function collectDropdownOptions(el) {
  var listbox = el.closest && el.closest(
    "[role='listbox'],ul.slds-listbox,.slds-dropdown,lightning-base-combobox"
  );
  if (!listbox) {
    // maybe a sibling/visible listbox is open elsewhere
    listbox = document.querySelector("[role='listbox'],ul.slds-listbox");
  }
  if (!listbox) return null;

  var opts = listbox.querySelectorAll(
    "[role='option'],lightning-base-combobox-item,li"
  );
  if (!opts.length) return null;

  var out = [];
  for (var i = 0; i < opts.length; i++) {
    var o = opts[i];
    var otext = fullText(o);
    if (otext.length > 60) {
      var sp = o.querySelector("span");
      otext = sp ? sp.textContent.trim() : otext.substring(0, 60);
    }
    var dyn = looksDynamic(otext);
    out.push({
      index: i + 1,
      text: otext,
      dynamic: dyn,
      byText: dyn ? "" :
        "//*[@role='option'][normalize-space()=" + wq(otext) + "]",
      byPosition: "(//*[@role='option'])[" + (i + 1) + "]"
    });
  }
  return out;
}

// Build a structured object holding everything the AI needs
// How many shadow boundaries between el and document (0 = light DOM).
function shadowDepthOf(el) {
  var d = 0, cur = el;
  while (cur) {
    var root = cur.getRootNode && cur.getRootNode();
    if (root && root !== document && root.host) { d++; cur = root.host; } else break;
  }
  return d;
}
// Chain of shadow host tags from document down to el.
function shadowPathOf(el) {
  var hosts = [], cur = el, guard = 0;
  while (cur && guard++ < 20) {
    var root = cur.getRootNode && cur.getRootNode();
    if (root && root !== document && root.host) { hosts.unshift(tagOf(root.host)); cur = root.host; } else break;
  }
  return hosts;
}
// Text content across shadow roots, skipping action links/buttons.
function deepTextOf(node) {
  var t = "";
  (function w(n) {
    if (n.nodeType === 3) { t += n.textContent; return; }
    if (n.nodeType === 1) { var g = tagOf(n);
      if (g === "a" || g === "button" || (n.getAttribute && n.getAttribute("role") === "button")) return; }
    if (n.shadowRoot) w(n.shadowRoot);
    var c = n.childNodes || []; for (var i = 0; i < c.length; i++) w(c[i]);
  })(node);
  return t.replace(/\s+/g, " ").trim();
}

function buildExtract(el, candidates) {
  var t = tagOf(el);
  var kind = detectKind(el);
  var dynamicValues = [];

  // collect dynamic-looking attribute values + text
  var attrs = allAttrs(el);
  Object.keys(attrs).forEach(function (k) {
    if (looksDynamic(attrs[k])) dynamicValues.push(k + "=" + attrs[k]);
  });
  if (looksDynamic(fullText(el))) dynamicValues.push("text=" + fullText(el).substring(0, 40));

  // shadow info
  var shadow = "none";
  try {
    var root = el.getRootNode && el.getRootNode();
    if (root && root !== document && root.host) {
      shadow = { hostTag: tagOf(root.host), hostAttrs: allAttrs(root.host) };
    }
  } catch (e) {}

  // parent chain
  var parents = [], cur = el.parentElement, depth = 0;
  while (cur && depth < 8 && tagOf(cur) !== "body") {
    parents.push({ level: depth + 1, tag: tagOf(cur), attrs: allAttrs(cur) });
    cur = cur.parentElement; depth++;
  }

  // clickable ancestor
  var ca = el.parentElement, d2 = 0, ancestor = null;
  while (ca && d2 < 8) { if (isClickable(ca)) { ancestor = { tag: tagOf(ca), level: d2 + 1 }; break; } ca = ca.parentElement; d2++; }

  // table context
  var table = null;
  var cell = el.closest && el.closest("td,th,[role='gridcell'],[role='columnheader'],[role='cell']");
  if (cell) {
    var tableEl = cell.closest("table,[role='grid'],[role='treegrid']");
    var rowEl = cell.closest("tr,[role='row']");
    var colIdx = 1, s = cell;
    while (s.previousElementSibling) { s = s.previousElementSibling; colIdx++; }
    var heads = tableEl ? tableEl.querySelectorAll("thead th, tr:first-child th, [role='columnheader']") : [];
    var rowCells = rowEl ? rowEl.querySelectorAll("td,[role='gridcell'],[role='cell']") : [];
    var rowTexts = [];
    rowCells.forEach(function (c) { var ct = fullText(c); if (ct) rowTexts.push(ct.substring(0, 30)); });
    table = {
      colIndex: colIdx,
      header: heads[colIdx - 1] ? cleanHeaderText(heads[colIdx - 1]) : "",
      ariaLabel: tableEl ? (tableEl.getAttribute("aria-label") || "") : "",
      rowCells: rowTexts
    };
  }

  // modal/dialog context — tells the AI to scope to THIS open popup
  var modal = null;
  try {
    var mEl = modalAncestor(el);
    if (mEl) {
      var mt = mEl.querySelector(
        ".slds-modal__title,.slds-modal__header h1,.slds-modal__header h2,h1,h2,[id*='modal-heading']");
      modal = { inModal: true, title: mt ? fullText(mt).substring(0, 60) : "" };
    }
  } catch (e) {}

  var html = "";
  try { html = el.outerHTML.replace(/\s+/g, " ").substring(0, 400); } catch (e) {}

  var pageUrl = "";
  try { pageUrl = (window.location && window.location.href) || ""; } catch (e) {}

  // The finder's own #1 pick — already validated unique + clickable.
  // This is the XPath the AI should return unless it spots a problem.
  var bestPick = "";
  for (var bi = 0; bi < candidates.length; bi++) {
    if (candidates[bi].count === 1) { bestPick = candidates[bi].xp; break; }
  }
  if (!bestPick && candidates.length) bestPick = candidates[0].xp;

  var kindForOpts = detectKind(el);
  var dropdownOptions = (kindForOpts === "dropdown-option" || kindForOpts === "dropdown-trigger")
    ? collectDropdownOptions(el) : null;

  var objId = objectIdFor(el);
  // reachability: does the BEST xpath actually resolve via document.evaluate?
  // (NO => element is in native shadow; By.xpath/$x can't reach it.)
  var anyReachable = candidates.some(function (c) { return c.count >= 1; });
  var bestReachable = bestPick ? (countMatches(bestPick) >= 1) : false;
  return {
    url: pageUrl,
    targetDescription: describeShort(el),
    bestXPath: bestPick,
    objectId: objId,
    objectXml: objectXmlFor(objId, bestPick),
    actionWord: actionWordFor(kind),
    reachable: bestReachable || anyReachable,
    shadowDepth: shadowDepthOf(el),
    shadowPath: shadowPathOf(el),
    deepValue: deepTextOf(el).substring(0, 80),
    dropdownOptions: dropdownOptions,
    tag: t,
    kind: kind,
    interaction: interactionFor(kind),
    ownText: ownText(el),
    fullText: fullText(el).substring(0, 120),
    label: findLabel(el),
    isInput: /^(text-input|textarea|contenteditable|select)$/.test(kind),
    isClickable: isClickable(el),
    attrs: attrs,
    shadow: shadow,
    clickableAncestor: ancestor,
    parents: parents,
    prevSibling: el.previousElementSibling ? describeShort(el.previousElementSibling) : "",
    nextSibling: el.nextElementSibling ? describeShort(el.nextElementSibling) : "",
    table: table,
    modal: modal,
    candidates: candidates.map(function (c) { return { xpath: c.xp, count: c.count }; }),
    dynamicValues: dynamicValues,
    html: html
  };
}

// Map a kind to the action verb used in the team's Gherkin.
function actionWordFor(kind) {
  switch (kind) {
    case "text-input":
    case "textarea":
    case "contenteditable": return "enter";
    case "select":
    case "dropdown-trigger":
    case "dropdown-option": return "select";
    case "checkbox":
    case "radio":           return "check";
    default:                return "click";
  }
}

// Human-readable version of the extract
function extractToText(x) {
  var L = [];
  L.push("=== XPATH EXTRACT (for AI) ===");
  L.push("URL: " + x.url);
  L.push("");
  L.push(">> TARGET I CLICKED: " + x.targetDescription);
  L.push(">> BEST XPATH (already validated unique + clickable): " + x.bestXPath);
  L.push("");
  L.push("ELEMENT: <" + x.tag + ">  KIND: " + x.kind);
  L.push("INTERACTION: " + x.interaction.console);
  L.push("  Java: " + x.interaction.java);
  L.push("OWN_TEXT: " + JSON.stringify(x.ownText));
  L.push("FULL_TEXT: " + JSON.stringify(x.fullText));
  L.push("LABEL: " + JSON.stringify(x.label));
  L.push("IS_INPUT: " + x.isInput + " | IS_CLICKABLE: " + x.isClickable);
  L.push("");
  L.push("ATTRS:");
  Object.keys(x.attrs).forEach(function (k) { L.push("  " + k + " = " + JSON.stringify(x.attrs[k])); });
  L.push("");
  if (x.shadow === "none") L.push("SHADOW: none (light DOM)");
  else L.push("SHADOW: host=<" + x.shadow.hostTag + "> hostAttrs=" + JSON.stringify(x.shadow.hostAttrs));
  L.push("CLICKABLE_ANCESTOR: " + (x.clickableAncestor ? "<" + x.clickableAncestor.tag + "> (level " + x.clickableAncestor.level + ")" : "none"));
  L.push("");
  L.push("PARENTS:");
  x.parents.forEach(function (p) {
    L.push("  ^" + p.level + " <" + p.tag + "> " + JSON.stringify(p.attrs).substring(0, 160));
  });
  L.push("");
  L.push("SIBLINGS: prev=" + (x.prevSibling || "none") + " | next=" + (x.nextSibling || "none"));
  if (x.modal) {
    L.push("");
    L.push("MODAL: element is inside an open popup/dialog; title=" + JSON.stringify(x.modal.title));
    L.push("  -> Scope the XPath to this dialog, e.g. //*[@role='dialog'][.//*[normalize-space()=" +
           JSON.stringify(x.modal.title) + "]]//<control>");
  }
  if (x.table) {
    L.push("");
    L.push("TABLE: col=" + x.table.colIndex + " header=" + JSON.stringify(x.table.header) +
           (x.table.ariaLabel ? " tableAria=" + JSON.stringify(x.table.ariaLabel) : ""));
    L.push("  rowCells: " + JSON.stringify(x.table.rowCells));
  }
  L.push("");
  L.push("CANDIDATE_XPATHS (count):");
  x.candidates.forEach(function (c) { L.push("  [" + c.count + "] " + c.xpath); });
  if (x.dynamicValues.length) {
    L.push("");
    L.push("DYNAMIC_VALUES (avoid these): " + JSON.stringify(x.dynamicValues));
  }
  if (x.dropdownOptions && x.dropdownOptions.length) {
    L.push("");
    L.push("DROPDOWN OPTIONS (all available in the open list):");
    x.dropdownOptions.forEach(function (o) {
      L.push("  #" + o.index + "  " + JSON.stringify(o.text) +
             (o.dynamic ? "  (text looks dynamic -> use position)" : ""));
      if (o.byText) L.push("       byText:     " + o.byText);
      L.push("       byPosition: " + o.byPosition);
    });
  }
  L.push("");
  L.push("HTML: " + x.html);
  L.push("");
  L.push("ASK:");
  L.push("- I clicked EXACTLY this target element (see TARGET above).");
  L.push("- Give me the single best, STABLE XPath for THIS element only.");
  L.push("- This element IS interactable. Do NOT say it is not clickable.");
  L.push("- Do NOT suggest a different element or alternative approach.");
  L.push("- Return: (1) the XPath, (2) the interaction function for KIND='" + x.kind + "'");
  L.push("  in both Console JS and Selenium Java.");
  L.push("- You may start from BEST XPATH above; only change it if it is");
  L.push("  not unique or uses a value listed under DYNAMIC_VALUES.");
  L.push("=== END ===");
  return L.join("\n");
}

// COMPACT extract — ~12 lines, self-contained, for small-context AIs.
// Includes its own one-line instruction so no separate system prompt is needed.
function extractToCompact(x) {
  var L = [];
  L.push("SF XPATH HELP — give the single best STABLE XPath for THIS element only.");
  L.push("TARGET: " + x.targetDescription + "  | KIND: " + x.kind + " | clickable:" + x.isClickable);
  if (x.label) L.push("LABEL: " + JSON.stringify(x.label));
  var keep = ["data-label", "aria-label", "name", "title", "role", "placeholder", "field-name", "data-id"];
  var sa = [];
  keep.forEach(function (k) { if (x.attrs[k]) sa.push(k + "=" + JSON.stringify(x.attrs[k])); });
  if (sa.length) L.push("ATTRS: " + sa.join("  "));
  if (x.shadow !== "none") L.push("SHADOW_HOST: <" + x.shadow.hostTag + ">");
  if (x.modal) L.push("MODAL: inside popup; title=" + JSON.stringify(x.modal.title) + " (scope the xpath to this dialog)");
  if (x.table) L.push("TABLE: col=" + x.table.colIndex + " header=" + JSON.stringify(x.table.header));
  L.push("BEST (validated unique+clickable): " + x.bestXPath);
  L.push("REACHABLE_BY_XPATH: " + (x.reachable ? "yes" :
         "NO — native shadow; By.xpath/$x cannot reach it, use a JS deep-shadow walk"));
  if (x.shadowDepth) L.push("SHADOW_DEPTH: " + x.shadowDepth + "  PATH: " + x.shadowPath.join(" >> "));
  if (x.deepValue && x.deepValue !== x.fullText) L.push("DEEP_TEXT: " + JSON.stringify(x.deepValue));
  L.push("ACTION: " + x.actionWord + "  (KIND=" + x.kind + ")  |  Java: " + x.interaction.java);
  L.push("OBJECT_ID: " + x.objectId);
  L.push("OBJECT_MAP:");
  L.push(x.objectXml);
  L.push("CANDIDATES [matchCount]:");
  x.candidates.slice(0, 5).forEach(function (c) { L.push("  [" + c.count + "] " + c.xpath); });
  if (x.dynamicValues.length) L.push("AVOID (dynamic): " + JSON.stringify(x.dynamicValues));
  if (x.dropdownOptions && x.dropdownOptions.length) {
    L.push("OPTIONS: " + x.dropdownOptions.map(function (o) {
      return "#" + o.index + "=" + JSON.stringify(o.text);
    }).join(" "));
  }

  // ---- explicit task for the agent (what to produce) ----
  L.push("");
  L.push("=== TASK FOR THE AGENT ===");
  L.push("I am performing a '" + x.actionWord + "' on THIS element (KIND=" + x.kind +
         "). For my Cucumber + Selenium framework, give me:");
  L.push("1) OBJECT-MAP entry: use the <object> block above (rename objectId if you have a better name).");
  L.push("2) GHERKIN step for the '" + x.actionWord + "' action, e.g.:  And I " + x.actionWord +
         " \"" + x.objectId + "\" on \"<ScreenName>\" screen");
  L.push("3) The @Then step definition + helper method (only if it doesn't already exist).");
  if (x.isInput || /select|combobox|checkbox|radio/.test(x.kind)) {
    L.push("4) The VALUE to " + x.actionWord + " (from my test data) and how it is applied.");
  } else {
    L.push("4) If I later VERIFY this, a value-included verification XPath + a presence/text verify step.");
  }
  if (!x.reachable) {
    L.push("NOTE: REACHABLE_BY_XPATH=NO -> do NOT use By.xpath. Use a JavascriptExecutor that walks the " +
           "shadowRoot chain (see SHADOW PATH), anchored on the field-label/attrs, and reads/clicks via a deep walk.");
  }
  L.push("RULES: use BEST unless count!=1 or it uses an AVOID value; never anchor a form field to a heading; " +
         "shadow-DOM aware; return XPath + 1-line Selenium Java for KIND='" + x.kind + "'.");
  L.push("=== END ===");
  return L.join("\n");
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

  // Never sit on a layout/page wrapper — drill to the deepest real element
  // rendered at the click point (fixes "everything resolves to flexipage").
  if (isLayoutTag(tagOf(deep))) {
    try {
      var fp2 = document.elementFromPoint(e.clientX, e.clientY);
      if (fp2 && fp2.nodeType === 1 && !isLayoutTag(tagOf(fp2))) { deep = fp2; t = tagOf(deep); }
    } catch (ex) {}
  }

  // Radio/checkbox: if the click landed on the label, faux box, or text
  // span, resolve to the actual <input> for that single option.
  var radioInput = resolveRadioInput(deep);
  if (radioInput) return radioInput;

  if (!isClickable(deep)) {
    var cur = deep, d = 0;
    while (cur && d < 10) {
      if (isClickable(cur)) { deep = cur; break; }
      var nxt = parentAcrossShadow(cur);
      if (nxt && isLayoutTag(tagOf(nxt))) break;   // stop before climbing into a wrapper
      cur = nxt; d++;
    }
  }
  return deep;
}

// If el is (or is inside) a radio/checkbox option's label/wrapper,
// return that option's <input>. Otherwise null.
function resolveRadioInput(el) {
  if (!el || el.nodeType !== 1) return null;
  // already the input
  if (tagOf(el) === "input" && /^(radio|checkbox)$/.test(el.type)) return el;
  // a label[for] pointing at a radio/checkbox
  if (tagOf(el) === "label" || el.closest) {
    var lbl = (tagOf(el) === "label") ? el : el.closest("label");
    if (lbl && lbl.getAttribute("for")) {
      try {
        var root = el.getRootNode && el.getRootNode();
        var byId = (root && root.getElementById && root.getElementById(lbl.getAttribute("for"))) ||
                   document.getElementById(lbl.getAttribute("for"));
        if (byId && tagOf(byId) === "input" && /^(radio|checkbox)$/.test(byId.type)) return byId;
      } catch (e) {}
    }
  }
  // inside a .slds-radio / .slds-checkbox wrapper -> its input
  var wrap = el.closest && el.closest(".slds-radio,.slds-checkbox,.slds-button--radio");
  if (wrap) {
    var inp = wrap.querySelector("input[type='radio'],input[type='checkbox']");
    if (inp) return inp;
  }
  return null;
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

// Build a sensible objectId from the element (prefix + cleaned descriptor),
// matching the recorder's naming convention.
function objectIdFor(el) {
  var tg = tagOf(el);
  var type = (el.getAttribute && (el.getAttribute("type") || "")).toLowerCase();
  var role = (el.getAttribute && (el.getAttribute("role") || "")).toLowerCase();
  var pfx = "el_";
  if (tg === "a" || role === "link") pfx = "lnk_";
  else if (tg === "button" || role === "button") pfx = "btn_";
  else if (tg === "textarea") pfx = "txt_";
  else if (tg === "select" || role === "combobox" || role === "listbox" ||
           (el.getAttribute && el.getAttribute("aria-haspopup") === "listbox") ||
           closestAcrossShadow(el, "lightning-combobox,lightning-picklist,lightning-grouped-combobox")) pfx = "dd_";
  else if (tg === "input" && type === "checkbox") pfx = "chk_";
  else if (tg === "input" && type === "radio") pfx = "rdo_";
  else if (tg === "input") pfx = "input_";
  else if (role === "option" || closestAcrossShadow(el, "[role='option'],lightning-base-combobox-item")) pfx = "opt_";

  var desc = findLabel(el) || fullText(el) ||
    (el.getAttribute && (el.getAttribute("aria-label") || el.getAttribute("data-label") ||
     el.getAttribute("title") || el.getAttribute("name"))) || "";
  desc = String(desc).replace(/[^a-zA-Z0-9]+/g, " ").trim().split(/\s+/).slice(0, 5)
    .map(function (w) { return w.charAt(0).toUpperCase() + w.slice(1); }).join("");
  if (!desc) desc = "Element";
  return pfx + desc;
}

// XML object-map block for the object repository (recorder format).
function objectXmlFor(objectId, xpath) {
  return '<object objectId="' + objectId + '">\n' +
         '    <objectProperty>xpath=' + xpath + '</objectProperty>\n' +
         '</object>';
}

function show(rawEl, e) {
  hide();
  var el = bestTarget(rawEl, e);
  var results = gen(el);
  if (!results.length) return;

  if (mode === "extract") { showExtract(el, results, e); return; }

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

    var objBtn = document.createElement("button");
    objBtn.style.cssText = "cursor:pointer;padding:2px 8px;font-size:10px;" +
      "background:#6a1b9a;color:#fff;border:none;border-radius:3px;white-space:nowrap;";
    objBtn.textContent = "Obj";

    code.onclick = function (ev) { ev.stopPropagation(); copyText(item.xp, code); };
    copyBtn.onclick = function (ev) { ev.stopPropagation(); copyText(item.xp, copyBtn); };
    testBtn.onclick = function (ev) {
      ev.stopPropagation();
      copyText(testCommandFor(item.xp), testBtn);
    };
    objBtn.onclick = function (ev) {
      ev.stopPropagation();
      copyText(objectXmlFor(objectIdFor(el), item.xp), objBtn);
    };

    row.appendChild(num); row.appendChild(code);
    row.appendChild(badge); row.appendChild(clk);
    row.appendChild(copyBtn); row.appendChild(testBtn); row.appendChild(objBtn);
    box.appendChild(row);
  });

  var hint = document.createElement("div");
  hint.style.cssText = "margin-top:6px;font-size:10px;color:#777;";
  hint.textContent = "Copy = xpath | Test = console cmd | Obj = object-map <object> block";
  box.appendChild(hint);

  document.body.appendChild(box);
  el.style.outline = "3px solid #4fc3f7";
  setTimeout(function () { try { el.style.outline = ""; } catch (e) {} }, 1800);
}

// Extract-for-AI popup: shows full report, JSON/Text toggle, auto-copy
function showExtract(el, results, e) {
  var x = buildExtract(el, results);
  var textOut = extractToText(x);
  var jsonOut = JSON.stringify(x, null, 2);
  var compactOut = extractToCompact(x);
  function pick(fmt) { return fmt === "json" ? jsonOut : fmt === "text" ? textOut : compactOut; }
  if (extractFmt !== "text" && extractFmt !== "json") extractFmt = "compact";
  var current = pick(extractFmt);

  box = document.createElement("div");
  box.id = "__xf_box";
  box.style.cssText =
    "position:fixed;z-index:2147483647;background:#1e1e1e;color:#d4d4d4;" +
    "padding:12px 14px;border-radius:8px;font:12px monospace;width:680px;" +
    "max-width:92vw;box-shadow:0 4px 18px rgba(0,0,0,0.55);";
  var top = e.clientY + 14, left = e.clientX + 10;
  if (top + 420 > window.innerHeight) top = Math.max(8, window.innerHeight - 430);
  if (left + 700 > window.innerWidth) left = Math.max(8, window.innerWidth - 700);
  box.style.top = top + "px"; box.style.left = left + "px";

  var head = document.createElement("div");
  head.style.cssText = "display:flex;align-items:center;gap:8px;margin-bottom:8px;";
  var title = document.createElement("strong");
  title.style.cssText = "color:#ffb74d;flex:1;";
  title.textContent = "Extract for AI — <" + x.tag + "> (" + x.kind + ")";
  head.appendChild(title);

  function mkBtn(label, bg) {
    var b = document.createElement("button");
    b.textContent = label;
    b.style.cssText = "cursor:pointer;padding:3px 10px;font-size:11px;color:#fff;" +
      "border:none;border-radius:3px;background:" + bg + ";";
    return b;
  }

  var pre = document.createElement("pre");
  pre.style.cssText = "background:#2d2d2d;padding:10px;overflow:auto;" +
    "white-space:pre-wrap;max-height:340px;border-radius:4px;margin:0;";
  pre.textContent = current;

  var compactBtn = mkBtn("Compact", extractFmt === "compact" ? "#4caf50" : "#455a64");
  var textBtn = mkBtn("Text", extractFmt === "text" ? "#4caf50" : "#455a64");
  var jsonBtn = mkBtn("JSON", extractFmt === "json" ? "#4caf50" : "#455a64");
  var copyBtn = mkBtn("Copy", "#1565c0");

  function setFmt(fmt) {
    extractFmt = fmt;
    pre.textContent = pick(fmt);
    compactBtn.style.background = fmt === "compact" ? "#4caf50" : "#455a64";
    textBtn.style.background = fmt === "text" ? "#4caf50" : "#455a64";
    jsonBtn.style.background = fmt === "json" ? "#4caf50" : "#455a64";
  }
  compactBtn.onclick = function (ev) { ev.stopPropagation(); setFmt("compact"); };
  textBtn.onclick = function (ev) { ev.stopPropagation(); setFmt("text"); };
  jsonBtn.onclick = function (ev) { ev.stopPropagation(); setFmt("json"); };
  copyBtn.onclick = function (ev) { ev.stopPropagation(); copyText(pick(extractFmt), copyBtn); };

  head.appendChild(compactBtn); head.appendChild(textBtn);
  head.appendChild(jsonBtn); head.appendChild(copyBtn);
  box.appendChild(head);
  box.appendChild(pre);

  var hint = document.createElement("div");
  hint.style.cssText = "margin-top:6px;font-size:10px;color:#777;";
  hint.textContent = "Auto-copied. Compact = small AI window (self-contained). Text/JSON = full detail.";
  box.appendChild(hint);

  document.body.appendChild(box);
  el.style.outline = "3px solid #ffb74d";
  setTimeout(function () { try { el.style.outline = ""; } catch (e) {} }, 1800);

  // auto-copy current view
  copyText(current, null);
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

// Mode switch: Quick XPath  <->  Extract for AI
var modeBtn = document.createElement("button");
modeBtn.id = "__xf_mode";
modeBtn.textContent = "Mode: Quick XPath";
modeBtn.style.cssText =
  "position:fixed;bottom:52px;right:12px;z-index:2147483647;padding:6px 14px;" +
  "font:12px sans-serif;font-weight:bold;color:#fff;background:#455a64;" +
  "border:none;border-radius:8px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,0.3);";
modeBtn.onclick = function (e) {
  e.stopPropagation();
  mode = (mode === "quick") ? "extract" : "quick";
  modeBtn.textContent = (mode === "quick") ? "Mode: Quick XPath" : "Mode: Extract for AI";
  modeBtn.style.background = (mode === "quick") ? "#455a64" : "#ef6c00";
  hide();
};
document.body.appendChild(modeBtn);

// Toggle shortcut. We listen on BOTH keydown and keyup because when a Lightning
// dropdown/listbox is open, Salesforce traps keydown (stopImmediatePropagation)
// and our keydown handler never fires — keyup is not trapped, so it still works.
// A debounce makes a single key press toggle exactly once.
var __xfLastToggle = 0;
function shortcut(e) {
  var isCombo = (e.code === "KeyX" || (e.key && e.key.toLowerCase() === "x")) &&
                (e.metaKey || e.ctrlKey) && e.shiftKey;
  if (!isCombo) return;
  var now = Date.now();
  if (now - __xfLastToggle < 400) return;   // ignore the paired keydown/keyup
  __xfLastToggle = now;
  e.preventDefault();
  e.stopPropagation();
  toggle();
}
window.addEventListener("keydown", shortcut, true);
window.addEventListener("keyup", shortcut, true);
document.addEventListener("keyup", shortcut, true);

console.log("XPath Finder v10 loaded. Toggle: Cmd/Ctrl+Shift+X (works while a dropdown is open) or click the button.");
})();
