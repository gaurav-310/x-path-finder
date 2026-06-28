/**
 * Salesforce XPath Recorder v4 (Final)
 * XML: <screen> -> <object objectId=""> -> <objectProperty>xpath=...</objectProperty>
 * Gherkin: And I click "objectId" on "ScreenName" screen
 * Prefixes: btn_, lnk_, input_, rdo_, chk_, dd_, txt_
 */
(function(){
"use strict";
if(window.__xpathRecorderActive){console.warn("XPath Recorder already loaded.");return;}
var steps=[],isRecording=false,stepIndex=0,lastFocusedEl=null,lastFocusedValue="",screenName="RecordedScreen",usedObjIds={};
var PID="xr-panel",OID="xr-output",BID="xr-backdrop";
var STORE_KEY="__xr_steps",STORE_STATE="__xr_state";

function saveState(){
  try{sessionStorage.setItem(STORE_KEY,JSON.stringify(steps));
    sessionStorage.setItem(STORE_STATE,JSON.stringify({recording:isRecording,stepIndex:stepIndex,screenName:screenName,usedObjIds:usedObjIds}));
  }catch(e){}}

function loadState(){
  try{var s=sessionStorage.getItem(STORE_KEY),st=sessionStorage.getItem(STORE_STATE);
    if(s&&st){steps=JSON.parse(s);var state=JSON.parse(st);
      stepIndex=state.stepIndex||0;screenName=state.screenName||"RecordedScreen";
      usedObjIds=state.usedObjIds||{};return state.recording===true;}
  }catch(e){}return false;}

function clearState(){try{sessionStorage.removeItem(STORE_KEY);sessionStorage.removeItem(STORE_STATE);}catch(e){}}

function isUI(el){while(el){if(el.id===PID||el.id===OID||el.id===BID)return true;el=el.parentElement;}return false;}
function stag(el){return(el&&el.tagName)?el.tagName.toLowerCase():"";}

function wq(s){
  if(s==null)return"''";s=String(s);
  if(s.indexOf("'")===-1)return"'"+s+"'";
  if(s.indexOf('"')===-1)return'"'+s+'"';
  return"concat('"+s.replace(/'/g,"',\"'\",'")+"')";
}

// ===== Embedded XPath engine (ported from xpath-finder.js) =====
// Isolated namespace so it never collides with recorder helpers.
var XF=(function(){
"use strict";
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
  if (t.indexOf("-") > 0) return true; // custom element
  return false;
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

  // --- SCOPED to the owning dropdown's FIELD LABEL (unique across multiple
  //     dropdowns; e.g. two Yes/No pickers won't clash) ---
  var comboHost = closestAcrossShadow(optEl,
    "lightning-combobox,lightning-grouped-combobox,lightning-picklist,lightning-base-combobox");
  // If the listbox is a separate overlay, find the trigger via aria-controls.
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
  if (fieldLbl && fieldLbl.length < 60 && !looksDynamic(fieldLbl)) {
    var chTag = tagOf(comboHost);
    var hostScope = "//" + chTag + "[.//label[normalize-space()=" + wq(fieldLbl) + "]]";
    var formScope = "//*[contains(@class,'slds-form-element')]" +
                    "[.//label[normalize-space()=" + wq(fieldLbl) + "]]";
    if (optTxt && optTxt.length < 60 && !looksDynamic(optTxt)) {
      // option by text, scoped to THIS field (preferred — unique)
      r.push(hostScope + "//*[@role='option'][normalize-space()=" + wq(optTxt) + "]");
      r.push(hostScope + "//lightning-base-combobox-item[.//span[normalize-space()=" + wq(optTxt) + "]]");
      r.push(formScope + "//*[@role='option'][normalize-space()=" + wq(optTxt) + "]");
    }
    // option by position, scoped to THIS field
    r.push("(" + hostScope + "//*[@role='option'])[" + idx + "]");
  }

  // --- text-based (global; works when only one dropdown is open) ---
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
  var custom = cellEl.querySelector(
    "records-hoverable-link,lightning-formatted-url,a[href],[role='link']"
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
  // COLUMN header click (sort headers) — only real column headers, not rowheader data cells
  if ((el.getAttribute && el.getAttribute("role") === "columnheader") ||
      (t === "th" && el.getAttribute && el.getAttribute("scope") === "col")) {
    var thTxt = cleanHeaderText(el);
    if (thTxt && thTxt.length < 50) {
      // the header/sort element itself
      r.push("//th[normalize-space()=" + wq(thTxt) + "]");
      r.push("//*[@role='columnheader'][.//*[normalize-space()=" + wq(thTxt) + "]]");
      // ALSO offer the FIRST data-cell LINK under this column (common need):
      // lightning-datatable cells carry data-label=<column header>.
      r.push("(//*[(self::td or self::th) and @data-label=" + wq(thTxt) +
             "]//*[self::a or self::records-hoverable-link])[1]");
      r.push("(//td[@data-label=" + wq(thTxt) + "]//a)[1]");
      r.push("(//th[@data-label=" + wq(thTxt) + "]//records-hoverable-link)[1]");
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

  // Radio/checkbox: if the click landed on the label, faux box, or text
  // span, resolve to the actual <input> for that single option.
  var radioInput = resolveRadioInput(deep);
  if (radioInput) return radioInput;

  if (!isClickable(deep)) {
    var cur = deep, d = 0;
    while (cur && d < 10) { if (isClickable(cur)) { deep = cur; break; } cur = parentAcrossShadow(cur); d++; }
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
return {gen:gen, bestTarget:bestTarget, positionalXPath:positionalXPath, isClickable:isClickable};
})();
// ===== end embedded engine =====

function findClickParent(el){
  var t=stag(el);
  if(t==="span"||t==="div"||t==="svg"||t==="path"||t==="img"||t==="i"){
    var c=el.parentElement,d=0;
    while(c&&d<4){var p=stag(c);
      if(p==="button"||p==="a"||c.getAttribute("role")==="button"||c.getAttribute("role")==="menuitem")return c;
      c=c.parentElement;d++;}
  }return el;
}

function getSfXPath(el){
  if(!el||!el.ownerDocument)return"";
  // Prefer the ported finder engine (ranked, validated, shadow/table aware)
  try{ var rs=XF.gen(el); if(rs&&rs.length&&rs[0]&&rs[0].xp) return rs[0].xp; }catch(e){}
  return getSfXPathLegacy(el);
}

function getSfXPathLegacy(el){
  if(!el||!el.ownerDocument)return"";
  var t=stag(el);
  if(t==="button"){
    var bs=el.querySelector(":scope > span, :scope > div > span");
    if(bs&&bs.textContent.trim())return"//span[text()="+wq(bs.textContent.trim())+"]/parent::button";
    if(el.getAttribute("title"))return"//button[@title="+wq(el.getAttribute("title"))+"]";
    var bt=(el.textContent||"").trim();
    if(bt&&bt.length<50)return"//button[normalize-space()="+wq(bt)+"]";
  }
  if(t==="a"){
    var at=(el.textContent||"").trim(),adl=el.getAttribute("data-label");
    if(at&&adl)return"//a[text()="+wq(at)+"][@data-label="+wq(adl)+"]";
    if(el.getAttribute("title"))return"//a[@title="+wq(el.getAttribute("title"))+"]";
    if(at&&at.length<50){var sa=el.querySelector("span");
      if(sa&&sa.textContent.trim()===at)return"//span[text()="+wq(at)+"]/parent::a";
      return"//a[text()="+wq(at)+"]";}
  }
  if(t==="span"){var st=(el.textContent||"").trim();
    if(st&&st.length<50){var sp=el.parentElement;if(sp){var pt=stag(sp);
      if(pt==="button")return"//span[text()="+wq(st)+"]/parent::button";
      if(pt==="a")return"//span[text()="+wq(st)+"]/parent::a";
      return"//span[text()="+wq(st)+"]";}}}
  if(t==="div"){var dt=(el.textContent||"").trim();
    if(dt&&dt.length<50&&el.children.length===0){var dp=el.parentElement;
      if(dp&&stag(dp)==="a")return"//div[text()="+wq(dt)+"]/parent::a";
      return"//div[text()="+wq(dt)+"]";}}
  if(t==="input"&&el.type==="radio"){var rl=findLabel(el);if(rl)return"//span[text()="+wq(rl)+"]/ancestor::label//input[@type='radio']";}
  if(t==="input"&&el.type==="checkbox"){var cl=findLabel(el);if(cl)return"//span[text()="+wq(cl)+"]/ancestor::label//input[@type='checkbox']";}
  if(t==="input"||t==="textarea"){
    var dw=el.closest("[data-label]");if(dw)return"//*[@data-label="+wq(dw.getAttribute("data-label"))+"]//" +t;
    var aw=el.closest("[aria-label]");if(aw&&aw!==el)return"//*[@aria-label="+wq(aw.getAttribute("aria-label"))+"]//" +t;
    if(el.getAttribute("placeholder"))return"//"+t+"[@placeholder="+wq(el.getAttribute("placeholder"))+"]";
    if(el.getAttribute("name"))return"//"+t+"[@name="+wq(el.getAttribute("name"))+"]";
    if(el.getAttribute("aria-label"))return"//"+t+"[@aria-label="+wq(el.getAttribute("aria-label"))+"]";
  }
  if(t==="select"){if(el.getAttribute("name"))return"//select[@name="+wq(el.getAttribute("name"))+"]";var sl=findLabel(el);if(sl)return"//select[@aria-label="+wq(sl)+"]";}
  if(el.getAttribute("data-id"))return"//*[@data-id="+wq(el.getAttribute("data-id"))+"]";
  if(el.getAttribute("data-name"))return"//*[@data-name="+wq(el.getAttribute("data-name"))+"]";
  if(el.getAttribute("aria-label"))return"//*[@aria-label="+wq(el.getAttribute("aria-label"))+"]";
  if(el.id&&/^[a-zA-Z][\w-]*$/.test(el.id))return"//*[@id='"+el.id+"']";
  if(el.getAttribute("title"))return"//*[@title="+wq(el.getAttribute("title"))+"]";
  return posXPath(el);
}

function posXPath(el){
  var parts=[],c=el;
  while(c&&c.nodeType===1){var t=stag(c);if(!t)break;
    if(c.id&&/^[a-zA-Z][\w-]*$/.test(c.id)){parts.unshift(t+"[@id='"+c.id+"']");break;}
    var s=c,cnt=0,pos=0;while(s){if(s.nodeType===1&&stag(s)===t){cnt++;if(s===c)pos=cnt;}s=s.previousElementSibling;}
    parts.unshift(cnt>1?t+"["+pos+"]":t);c=c.parentElement;}
  return parts.length?"//"+parts.join("/"):"//*";
}

function findLabel(el){
  if(el.id){try{var l=document.querySelector('label[for="'+CSS.escape(el.id)+'"]');
    if(l){var s=l.querySelector("span");return(s&&s.textContent.trim())||l.textContent.trim();}}catch(e){}}
  var w=el.closest("label,.slds-form-element,lightning-input,lightning-combobox,lightning-checkbox-group,lightning-radio-group,lightning-textarea,lightning-datepicker,lightning-input-field");
  if(w){var wl=w.querySelector("span.slds-form-element__label,label span,legend span,label");if(wl&&wl.textContent.trim())return wl.textContent.trim();}
  return el.getAttribute("aria-label")||el.getAttribute("data-label")||"";
}

function fieldLabel(el){return el.getAttribute("data-label")||el.getAttribute("aria-label")||el.getAttribute("placeholder")||el.getAttribute("title")||findLabel(el)||el.getAttribute("name")||stag(el);}

function clickDesc(el){
  var t=stag(el);
  if(t==="button"){var s=el.querySelector("span");if(s&&s.textContent.trim())return s.textContent.trim();return el.getAttribute("title")||(el.textContent||"").trim()||"button";}
  if(t==="a")return el.getAttribute("title")||(el.textContent||"").trim()||"link";
  if(t==="span"||t==="div"){var x=(el.textContent||"").trim();if(x&&x.length<50)return x;}
  return el.getAttribute("aria-label")||el.getAttribute("title")||(el.textContent||"").trim().substring(0,40)||t;
}

function makeObjId(action,el,desc){
  var t=stag(el),pfx="el_";
  if(action==="click"||action==="hover_click"){pfx=t==="a"?"lnk_":"btn_";}
  else if(action==="submit")pfx="btn_";
  else if(action==="fill")pfx=(t==="textarea")?"txt_":"input_";
  else if(action==="select")pfx="dd_";
  else if(action==="check")pfx=(t==="input"&&el.type==="radio")?"rdo_":"chk_";
  var base=(desc||"Element").replace(/[^a-zA-Z0-9]/g,"").substring(0,30);
  if(!base)base="Element";
  var id=pfx+base,xp=getSfXPath(el);
  if(usedObjIds[id]&&usedObjIds[id]!==xp){var i=2;while(usedObjIds[id+i])i++;id=id+i;}
  usedObjIds[id]=xp;return id;
}

function inputType(el){var t=stag(el);if(!t)return"other";if(t==="select")return"select";if(t==="textarea")return"textarea";
  if(t==="input"){var tp=(el.getAttribute("type")||"text").toLowerCase();if(tp==="checkbox")return"checkbox";if(tp==="radio")return"radio";if(tp==="date"||tp==="datetime-local")return"date";return"text";}
  if(el.getAttribute("contenteditable")==="true")return"textarea";return"other";}

function addStep(action,rawEl,value,ev){
  if(!rawEl)return;
  var isClickType=(action==="click"||action==="submit"||action==="hover_click");
  var el=rawEl;
  if(isClickType){
    // Use the finder's shadow-aware target resolution (svg/icon -> real clickable)
    try{ el=(ev&&XF&&XF.bestTarget)?XF.bestTarget(rawEl,ev):findClickParent(rawEl); }
    catch(e){ el=findClickParent(rawEl); }
  }
  stepIndex++;
  var xp=getSfXPath(el),isClk=action==="click"||action==="submit"||action==="hover_click"||action==="key";
  var desc=isClk?clickDesc(el):fieldLabel(el);
  var oid=makeObjId(action,el,desc);
  steps.push({n:stepIndex,action:action,desc:desc,objectId:oid,xpath:xp,tag:stag(el),inputType:inputType(el),value:value||""});
  console.log("[Rec] "+stepIndex+": "+action+(value?' ="'+value+'"':"")+"|"+oid+"|"+xp);
  updateCount();flash(el);saveState();
}

function flash(el){try{var o=el.style.outline,b=el.style.backgroundColor;el.style.outline="3px solid #f44336";el.style.backgroundColor="rgba(244,67,54,0.15)";setTimeout(function(){el.style.outline=o;el.style.backgroundColor=b;},400);}catch(e){}}
function updateCount(){var c=document.getElementById("xr-cnt");if(c)c.textContent="Steps: "+steps.length;}
function flushInput(){if(!lastFocusedEl)return;var v=lastFocusedEl.value||"";if(v!==lastFocusedValue&&v!==""){var t=inputType(lastFocusedEl);if(t!=="checkbox"&&t!=="radio")addStep("fill",lastFocusedEl,v);}lastFocusedEl=null;lastFocusedValue="";}
function undoStep(){if(steps.length>0){var r=steps.pop();stepIndex--;console.log("[Rec] Undo: "+r.objectId);updateCount();}}

function inModal(el){return!!(el.closest(".slds-modal,[role='dialog'],[role='alertdialog'],.uiModal,.forceModalContainer"));}
function isSubmit(el){var t=stag(el);if(t==="input"&&el.type==="submit")return true;if(t==="button"&&el.type==="submit")return true;
  var txt=(el.textContent||"").trim().toLowerCase();return/^(submit|save|ok|confirm|yes|apply|done)$/.test(txt)&&inModal(el);}
function needsHover(el){return!!(el.closest("[role='menu'],[role='menubar'],[role='listbox'],.slds-dropdown,.slds-popover"));}
function detectAction(el){if(isSubmit(el))return"submit";if(needsHover(el))return"hover_click";return"click";}

function onClick(e){if(!isRecording||isUI(e.target))return;
  var el=e.target,t=stag(el);
  if(t==="input"&&(el.type==="checkbox"||el.type==="radio")){e.preventDefault();addStep("check",el,(!el.checked)?"true":"false");return;}
  flushInput();
  if(t==="option"){var s=el.closest("select");if(s){addStep("select",s,el.textContent.trim());return;}}
  addStep(detectAction(el),el,undefined,e);
  saveState();
  var linkEl=el.closest("a");
  if(linkEl&&linkEl.getAttribute("target")==="_blank"){e.preventDefault();linkEl.removeAttribute("target");linkEl.click();}
}

function onKey(e){if(!isRecording||isUI(e.target))return;var k=e.key;
  if(k==="Enter"||k==="Tab"||k==="Escape"){if(k!=="Tab")flushInput();addStep("key",e.target,k.toUpperCase());}}

function onFocus(e){if(!isRecording||isUI(e.target))return;var el=e.target,t=stag(el);
  if(t==="input"||t==="textarea"||t==="select"||el.getAttribute("contenteditable")==="true"){flushInput();lastFocusedEl=el;lastFocusedValue=el.value||"";}}

function onChange(e){if(!isRecording||isUI(e.target))return;var el=e.target,t=stag(el);
  if(t==="select"){var o=el.options[el.selectedIndex];addStep("select",el,o?o.textContent.trim():el.value);lastFocusedEl=null;return;}
  if(t==="input"&&(el.type==="checkbox"||el.type==="radio")){addStep("check",el,el.checked?"true":"false");return;}
  if((t==="input"||t==="textarea")&&el.value&&el.value!==lastFocusedValue){addStep("fill",el,el.value);lastFocusedEl=null;lastFocusedValue="";}}

function onBlur(e){if(!isRecording||isUI(e.target))return;flushInput();}

function escXml(s){return(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;");}

function dedup(){var m={},o=[];steps.forEach(function(s){if(!m[s.xpath]){m[s.xpath]=s.objectId;o.push(s.xpath);}});return{m:m,o:o};}

function genXML(){var d=dedup(),L=['<?xml version="1.0" encoding="UTF-8"?>',"<class>",'    <screen screenID="'+escXml(screenName)+'">'];
  d.o.forEach(function(xp){L.push('        <object objectId="'+escXml(d.m[xp])+'">');L.push("            <objectProperty>xpath="+xp+"</objectProperty>");L.push("        </object>");L.push("");});
  L.push("    </screen>","</class>");return L.join("\n");}

function genGherkin(){var d=dedup(),sn=screenName,L=["Feature: Recorded Salesforce flow","","  @Recorded_Flow","  Scenario: Recorded steps on "+sn,"","    Given I have launched App"];
  steps.forEach(function(s){var id=d.m[s.xpath];
    switch(s.action){
      case"click":L.push('    And I click "'+id+'" on "'+sn+'" screen','    And I wait for ".1" mins');break;
      case"submit":L.push('    And I submit "'+id+'" on "'+sn+'" screen','    And I wait for ".2" mins');break;
      case"hover_click":L.push('    Then I mouse hover and click on "'+id+'" on "'+sn+'" screen','    And I wait for ".2" mins');break;
      case"fill":L.push('    And I enter "'+s.value+'" details in "'+id+'" on "'+sn+'" screen','    And I wait for ".1" mins');break;
      case"select":L.push('    And I select "'+s.value+'" from "'+id+'" dropdown using "visibleText" selection type on "'+sn+'" screen','    And I wait for ".1" mins');break;
      case"check":L.push('    And I click "'+id+'" on "'+sn+'" screen','    And I wait for ".1" mins');break;
      case"key":L.push('    And I hit "'+s.value+'" key on "'+sn+'" screen','    And I wait for ".1" mins');break;
    }});L.push("");return L.join("\n");}

function genStepDefs(){var u={};steps.forEach(function(s){u[s.action]=true;});
  var D={click:['@Then("^I click \\"(.*?)\\" on \\"(.*?)\\" screen$")','public void i_click_on_screen(String field, String screenName) {','    stepDefinitionHelperWebClassInstance.clickOnElementOnScreen(field, screenName);','}'],
    submit:['@Then("^I submit \\"(.*?)\\" on \\"(.*?)\\" screen$")','public void i_submit_on_screen(String field, String screenName) {','    stepDefinitionHelperWebClassInstance.submitOnScreen(field, screenName);','}'],
    hover_click:['@Then("^I mouse hover and click on \\"(.*?)\\" on \\"(.*?)\\" screen$")','public void i_mouse_hover_and_click_on_screen(String field, String screenName) {','    stepDefinitionHelperWebClassInstance.mouseHoverAndClickOnScreen(field, screenName);','}'],
    fill:['@Then("^I enter \\"(.*?)\\" details in \\"(.*?)\\" on \\"(.*?)\\" screen$")','public void i_enter_details_in_on_screen(String value, String field, String screenName) {','    stepDefinitionHelperWebClassInstance.enterDetailsOnScreen(value, field, screenName);','}'],
    select:['@Then("^I select \\"(.*?)\\" from \\"(.*?)\\" dropdown using \\"(.*?)\\" selection type on \\"(.*?)\\" screen$")','public void i_select_from_dropdown_using_selection_type_on_screen(String strOptionToSelect, String strDDName, String strSelectionType, String strScreenName) {','    stepDefinitionHelperWebClassInstance.selectFromDropdownUsingSelectionTypeOnScreen(strOptionToSelect, strDDName, strSelectionType, strScreenName);','}'],
    key:['@Then("^I hit \\"(.*?)\\" key on \\"(.*?)\\" screen$")','public void i_hit_key_on_screen(String keyName, String screenName) {','    stepDefinitionHelperWebClassInstance.hitKeyOnScreen(keyName, screenName);','}']};
  var L=["// @Then Step Definitions (StepDefinition.java)","// Add any missing ones to your class",""];
  Object.keys(D).forEach(function(k){if(u[k]||(k==="click"&&u.check)){L.push("");D[k].forEach(function(x){L.push(x);});}});
  L.push("",'@Then("^I wait for \\"(.*?)\\" mins$")','public void i_wait_for_mins(String mins) {','    stepDefinitionHelperWebClassInstance.waitForMins(mins);','}');
  return L.join("\n");}

function genHelpers(){var u={};steps.forEach(function(s){u[s.action]=true;});
  var L=["// Helper Methods (StepDefinitionHelperWeb.java)","// Add any missing ones to your helper class",""];
  if(u.click||u.check){L.push("public void clickOnElementOnScreen(String field, String screenName) {","    String[] objectPropertyArray = this.genGetLocator(field, screenName);","    String locatorValue = objectPropertyArray[1];","    WebElement element = DriverManagerThreadSafe.getDriver().findElement(By.xpath(locatorValue));","    element.click();","    Thread.sleep(1000);","}","");}
  if(u.submit){L.push("public void submitOnScreen(String field, String screenName) {","    String[] objectPropertyArray = this.genGetLocator(field, screenName);","    String locatorValue = objectPropertyArray[1];","    WebElement element = DriverManagerThreadSafe.getDriver().findElement(By.xpath(locatorValue));","    element.click();","    Thread.sleep(2000);","}","");}
  if(u.hover_click){L.push("public void mouseHoverAndClickOnScreen(String field, String screenName) {","    String[] objectPropertyArray = this.genGetLocator(field, screenName);","    String locatorValue = objectPropertyArray[1];","    Actions act = new Actions(DriverManagerThreadSafe.getDriver());","    WebElement element = DriverManagerThreadSafe.getDriver().findElement(By.xpath(locatorValue));","    act.moveToElement(element).click().build().perform();","    Thread.sleep(2000);","}","");}
  if(u.fill){L.push("public void enterDetailsOnScreen(String value, String field, String screenName) {","    String[] objectPropertyArray = this.genGetLocator(field, screenName);","    String locatorValue = objectPropertyArray[1];","    String data = this.getglobalOrDatajsonData(value);","    Actions act = new Actions(DriverManagerThreadSafe.getDriver());","    WebElement element = DriverManagerThreadSafe.getDriver().findElement(By.xpath(locatorValue));","    act.doubleClick(element).doubleClick(element).sendKeys(data).sendKeys(Keys.ENTER).build().perform();","    Thread.sleep(1000);","}","");}
  if(u.select){L.push("public void selectFromDropdownUsingSelectionTypeOnScreen(String strOptionToSelect, String strDDName, String strSelectionType, String strScreenName) {","    String[] objectPropertyArray = this.genGetLocator(strDDName, strScreenName);","    String locatorValue = objectPropertyArray[1];","    WebElement element = DriverManagerThreadSafe.getDriver().findElement(By.xpath(locatorValue));","    new Select(element).selectByVisibleText(strOptionToSelect);","    Thread.sleep(1000);","}","");}
  if(u.key){L.push("public void hitKeyOnScreen(String keyName, String screenName) {","    WebElement activeEl = DriverManagerThreadSafe.getDriver().switchTo().activeElement();","    if (keyName.equalsIgnoreCase(\"ENTER\")) activeEl.sendKeys(Keys.ENTER);","    else if (keyName.equalsIgnoreCase(\"TAB\")) activeEl.sendKeys(Keys.TAB);","    else if (keyName.equalsIgnoreCase(\"ESCAPE\")) activeEl.sendKeys(Keys.ESCAPE);","    Thread.sleep(1000);","}","");}
  return L.join("\n");}

// Console replay script — mirrors exactly what the Java helpers do
// (click / fill with input+change+blur / select / key). Paste in
// Console to verify the whole flow before writing any Java.
function genConsoleTest(){
  var L=[];
  L.push("(async function(){");
  L.push("  function xp(p){return document.evaluate(p,document,null,XPathResult.FIRST_ORDERED_NODE_TYPE,null).singleNodeValue;}");
  L.push("  function wait(ms){return new Promise(function(r){setTimeout(r,ms);});}");
  L.push("  function hl(e){try{e.scrollIntoView({block:'center'});e.style.outline='3px solid #e53935';setTimeout(function(){e.style.outline='';},700);}catch(x){}}");
  L.push("  function clk(p){var e=xp(p);if(!e){console.error('NOT FOUND:',p);return false;}hl(e);e.focus&&e.focus();e.click();console.log('clicked:',p);return true;}");
  L.push("  function fill(p,v){var e=xp(p);if(!e){console.error('NOT FOUND:',p);return false;}hl(e);e.focus();e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));e.dispatchEvent(new Event('blur',{bubbles:true}));console.log('filled:',p,'=',v);return true;}");
  L.push("  function sel(p,v){var e=xp(p);if(!e){console.error('NOT FOUND:',p);return false;}hl(e);if(e.tagName==='SELECT'){for(var i=0;i<e.options.length;i++){if(e.options[i].textContent.trim()===v){e.selectedIndex=i;break;}}e.dispatchEvent(new Event('change',{bubbles:true}));}else{e.click();}console.log('selected:',v,'in',p);return true;}");
  L.push("  function key(p,k){var e=xp(p)||document.activeElement;hl(e);var kc={ENTER:13,TAB:9,ESCAPE:27}[k]||13;e.dispatchEvent(new KeyboardEvent('keydown',{key:k.charAt(0)+k.slice(1).toLowerCase(),keyCode:kc,bubbles:true}));console.log('key:',k);return true;}");
  L.push("  console.log('--- REPLAY START ---');");
  steps.forEach(function(s){
    var p=JSON.stringify(s.xpath);
    if(s.action==="click"||s.action==="submit"||s.action==="hover_click"||s.action==="check")
      L.push("  clk("+p+"); await wait(900);");
    else if(s.action==="fill")
      L.push("  fill("+p+","+JSON.stringify(s.value||"")+"); await wait(900);");
    else if(s.action==="select")
      L.push("  sel("+p+","+JSON.stringify(s.value||"")+"); await wait(900);");
    else if(s.action==="key")
      L.push("  key("+p+","+JSON.stringify(s.value||"ENTER")+"); await wait(600);");
  });
  L.push("  console.log('--- REPLAY DONE ---');");
  L.push("})();");
  return L.join("\n");
}

function escH(s){var d=document.createElement("div");d.textContent=s;return d.innerHTML;}
function cpTxt(t){if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(t).then(function(){alert("Copied!");});}else{var a=document.createElement("textarea");a.value=t;document.body.appendChild(a);a.select();document.execCommand("copy");document.body.removeChild(a);alert("Copied!");}}

function showOut(){
  var xml=genXML(),ghk=genGherkin(),sd=genStepDefs(),hm=genHelpers(),ct=genConsoleTest();
  var ps="background:#2d2d2d;padding:10px;overflow:auto;white-space:pre-wrap;max-height:200px;border-radius:4px;",
      bs="cursor:pointer;padding:3px 10px;font-size:11px;background:#455a64;color:#fff;border:none;border-radius:3px;margin-left:8px;";
  var h='<div id="'+OID+'" style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#1e1e1e;color:#d4d4d4;padding:20px;border-radius:8px;width:88%;max-width:950px;max-height:92%;overflow:auto;z-index:999999;font-family:monospace;font-size:12px;box-shadow:0 4px 20px rgba(0,0,0,0.5);">';
  h+='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;"><strong style="font-size:14px;">'+steps.length+" steps | "+screenName+'</strong><button id="xr-close" style="cursor:pointer;padding:4px 12px;">Close</button></div>';
  h+='<p><b>1. XML (BBCRM.xml)</b><button class="xr-cp" data-t="xml" style="'+bs+'">Copy</button></p><pre style="'+ps+'">'+escH(xml)+"</pre>";
  h+='<p><b>2. Gherkin (.feature)</b><button class="xr-cp" data-t="ghk" style="'+bs+'">Copy</button></p><pre style="'+ps+'">'+escH(ghk)+"</pre>";
  h+='<p><b>3. @Then (StepDefinition.java)</b><button class="xr-cp" data-t="sd" style="'+bs+'">Copy</button></p><pre style="'+ps+'">'+escH(sd)+"</pre>";
  h+='<p><b>4. Helpers (StepDefinitionHelperWeb.java)</b><button class="xr-cp" data-t="hm" style="'+bs+'">Copy</button></p><pre style="'+ps+'">'+escH(hm)+"</pre>";
  h+='<p><b>5. Console Test (paste in Console to replay & verify)</b><button class="xr-cp" data-t="ct" style="'+bs+'background:#1565c0;">Copy</button></p><pre style="'+ps+'">'+escH(ct)+"</pre>";
  h+='</div><div id="'+BID+'" style="position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:999998;"></div>';
  document.body.insertAdjacentHTML("beforeend",h);
  var cm={xml:xml,ghk:ghk,sd:sd,hm:hm,ct:ct};
  document.querySelectorAll(".xr-cp").forEach(function(b){b.onclick=function(e){e.stopPropagation();cpTxt(cm[b.getAttribute("data-t")]);};});
  document.getElementById("xr-close").onclick=closeOut;document.getElementById(BID).onclick=closeOut;}

function closeOut(){var o=document.getElementById(OID),b=document.getElementById(BID);if(o)o.remove();if(b)b.remove();}

function attachListeners(){
  document.addEventListener("click",onClick,true);document.addEventListener("keydown",onKey,true);
  document.addEventListener("focusin",onFocus,true);document.addEventListener("change",onChange,true);
  document.addEventListener("blur",onBlur,true);}

function setRecUI(){
  document.getElementById("xr-st").textContent="REC";document.getElementById("xr-st").style.background="#d32f2f";
  document.getElementById("xr-go").disabled=true;document.getElementById("xr-sp").disabled=false;document.getElementById("xr-un").disabled=false;
  var ni=document.getElementById("xr-scr");if(ni)ni.value=screenName;
  updateCount();}

function startRec(){
  if(isRecording)return;var ni=document.getElementById("xr-scr");
  if(ni&&ni.value.trim())screenName=ni.value.trim();
  steps=[];stepIndex=0;usedObjIds={};lastFocusedEl=null;lastFocusedValue="";isRecording=true;
  attachListeners();setRecUI();saveState();}

function detachListeners(){
  document.removeEventListener("click",onClick,true);document.removeEventListener("keydown",onKey,true);
  document.removeEventListener("focusin",onFocus,true);document.removeEventListener("change",onChange,true);
  document.removeEventListener("blur",onBlur,true);}

function stopRec(){
  if(!isRecording)return;flushInput();isRecording=false;
  detachListeners();clearState();
  document.getElementById("xr-st").textContent="Stopped";document.getElementById("xr-st").style.background="#388e3c";
  document.getElementById("xr-go").disabled=false;document.getElementById("xr-sp").disabled=true;document.getElementById("xr-un").disabled=true;
  if(steps.length>0)showOut();else alert("No steps recorded.");}

var bS="cursor:pointer;padding:6px 14px;color:#fff;border:none;border-radius:4px;font-size:12px;font-weight:600;";
var ph='<div id="'+PID+'" style="position:fixed;top:12px;right:12px;background:#263238;color:#eceff1;padding:14px 16px;border-radius:10px;font-family:sans-serif;font-size:13px;z-index:999997;box-shadow:0 2px 12px rgba(0,0,0,0.4);cursor:move;min-width:175px;">'+
  '<div style="font-weight:bold;margin-bottom:6px;font-size:14px;">XPath Recorder v4</div>'+
  '<span id="xr-st" style="display:inline-block;padding:2px 10px;border-radius:4px;background:#555;font-size:11px;letter-spacing:1px;">Stopped</span>'+
  '<div id="xr-cnt" style="margin:6px 0;font-size:12px;">Steps: 0</div>'+
  '<div style="margin-bottom:10px;"><label style="font-size:11px;opacity:0.7;">Screen ID</label><br>'+
  '<input id="xr-scr" type="text" value="RecordedScreen" style="width:150px;padding:4px 8px;font-size:12px;border-radius:4px;border:1px solid #546e7a;background:#37474f;color:#eceff1;margin-top:2px;"></div>'+
  '<button id="xr-go" style="'+bS+'background:#4caf50;margin-right:4px;">Start</button>'+
  '<button id="xr-sp" style="'+bS+'background:#f44336;margin-right:4px;" disabled>Stop</button>'+
  '<button id="xr-un" style="'+bS+'background:#ff9800;font-size:11px;padding:6px 8px;" disabled title="Undo last step">Undo</button>'+
  "</div>";
document.body.insertAdjacentHTML("beforeend",ph);
document.getElementById("xr-go").onclick=startRec;
document.getElementById("xr-sp").onclick=stopRec;
document.getElementById("xr-un").onclick=function(e){e.stopPropagation();undoStep();};

var panel=document.getElementById(PID),drag=false,dx=0,dy=0;
panel.addEventListener("mousedown",function(e){if(e.target.tagName==="BUTTON"||e.target.tagName==="INPUT")return;drag=true;dx=e.clientX-panel.getBoundingClientRect().left;dy=e.clientY-panel.getBoundingClientRect().top;});
document.addEventListener("mousemove",function(e){if(!drag)return;panel.style.left=(e.clientX-dx)+"px";panel.style.top=(e.clientY-dy)+"px";panel.style.right="auto";});
document.addEventListener("mouseup",function(){drag=false;});

window.__xpathRecorderActive=true;

var wasRecording=loadState();
if(wasRecording){
  isRecording=true;attachListeners();setRecUI();
  console.log("[Rec] Resumed recording after navigation. "+steps.length+" steps so far. Screen: "+screenName);
}else{
  console.log("XPath Recorder v4 loaded. Set Screen ID -> Start -> interact -> Stop.");
}
})();
