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

// Detect dynamic-looking VALUES (text content / attribute values) that
// change between page loads — case numbers with dates, timestamps, GUIDs,
// long digit sequences, ISO dates, time stamps, percentage with decimals.
function looksDynamic(v) {
  if (!v) return false;
  var s = String(v);
  // Date patterns (any common format)
  if (/\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(s)) return true;
  if (/\d{1,2}[-/]\d{1,2}[-/]\d{2,4}/.test(s)) return true;
  // Time patterns
  if (/\d{1,2}:\d{2}(:\d{2})?\s*(am|pm)?/i.test(s)) return true;
  // Long digit sequences (case numbers, IDs)
  if (/\d{5,}/.test(s)) return true;
  // GUID / UUID
  if (/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i.test(s)) return true;
  // Salesforce 15/18-char record ID
  if (/\b[a-zA-Z0-9]{15}(?:[a-zA-Z0-9]{3})?\b/.test(s) && s.length >= 15) return true;
  // Prefix-number patterns: CASE-..., TKT-..., ORD-..., REF-..., SO-...
  if (/^(case|tkt|ord|ref|so|inv|po|sl|cn|sr|sub)-?\d{3,}/i.test(s)) return true;
  // Money-with-cents (often varies)
  if (/^\$?\d+\.\d{2}$/.test(s) && parseFloat(s.replace(/[^\d.]/g, "")) > 99) return true;
  // Counters like "(3)", "(125)"
  if (/^\(\d+\)$/.test(s)) return true;
  return false;
}

// Detect dynamic/auto-generated IDs (Salesforce LWC, Aura, Angular, Ember, etc.)
// These IDs change across page loads or module updates and should be avoided.
function isFlakyId(id) {
  if (!id) return true;
  if (id.length < 2) return true;
  // Multiple consecutive digits anywhere
  if (/\d{3,}/.test(id)) return true;
  // Common dynamic ID prefixes
  if (/^(lwc-|ember|ng-|aura:|sfdc:|cke_|tmp_|x-|window_|input-|combobox-|button-|panel-|modal-|listbox-|menu-|datepicker-)/i.test(id))
    return true;
  // Colons or random-looking patterns (e.g., "123:456:abc")
  if (/:/.test(id)) return true;
  // Mixed alphanumeric with multiple separators (e.g., "01-2a-3b")
  if (/[-_]\d/.test(id) && id.replace(/[^\d]/g, "").length >= 2) return true;
  // Single short letter prefix + numbers (e.g., "j_id12", "j2_id")
  if (/^j_?id/i.test(id)) return true;
  return false;
}

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
    if (el.id && !isFlakyId(el.id))
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
      if (h.id && !isFlakyId(h.id))
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
    if (bsTxt)
      r.push("//span[text()=" + wq(bsTxt) +
        "]/parent::button");
    var bTitle = el.getAttribute("title");
    if (bTitle)
      r.push("//button[@title=" + wq(bTitle) + "]");
    if (txt && !bsTxt)
      r.push("//button[normalize-space()=" + wq(txt) + "]");
  }

  // Link
  if (t === "a") {
    var adl = el.getAttribute("data-label");
    if (txt && adl)
      r.push("//a[text()=" + wq(txt) +
        "][@data-label=" + wq(adl) + "]");
    if (txt) {
      r.push("//a[normalize-space()=" + wq(txt) + "]");
      // contains() only useful if exact doesn't work; finder will
      // pick the unique one in the ranking
      if (txt.length > 15)
        r.push("//a[contains(normalize-space(),'" +
               txt.substring(0, 15).replace(/'/g, "") + "')]");
    }
    var aTitle = el.getAttribute("title");
    if (aTitle)
      r.push("//a[@title=" + wq(aTitle) + "]");
    var href = el.getAttribute("href");
    // Skip flaky hrefs:
    // - javascript:* (always flaky)
    // - "#" anchors
    // - URLs with Salesforce record IDs (15/18 char ID after /r/Object/)
    // - URLs with raw IDs that look auto-generated
    var hrefFlaky =
      !href || href === "#" ||
      /^javascript:/i.test(href.trim()) ||
      /\/[a-zA-Z0-9]{15,18}(\/|$)/.test(href) ||
      /\d{6,}/.test(href);
    if (!hrefFlaky) {
      if (href.length < 60)
        r.push("//a[@href=" + wq(href) + "]");
      // Use only static-looking parts of path
      var hp = href.split(/[\/?&=]/).filter(function (p) {
        return p && p.length > 3 && !/\d{4,}/.test(p) &&
               !/^[a-zA-Z0-9]{15,18}$/.test(p);
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
      } else if (pt === "a") {
        r.push("//span[text()=" + wq(sTxt) + "]/parent::a");
      } else {
        r.push("//span[text()=" + wq(sTxt) + "]");
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

  // Input/textarea wrappers + label-based
  if (t === "input" || t === "textarea") {
    var dlw = el.closest("[data-label]");
    if (dlw)
      r.push("//*[@data-label=" +
        wq(dlw.getAttribute("data-label")) + "]//" + t);
    var alw = el.closest("[aria-label]");
    if (alw && alw !== el)
      r.push("//*[@aria-label=" +
        wq(alw.getAttribute("aria-label")) + "]//" + t);

    // Label-text based (very stable for textareas)
    var lblTxt = findLabel(el);
    if (lblTxt && lblTxt.length < 60) {
      r.push("//label[normalize-space()=" + wq(lblTxt) +
        "]/following::" + t + "[1]");
      r.push("//span[text()=" + wq(lblTxt) +
        "]/ancestor::*[self::div or self::lightning-input or " +
        "self::lightning-textarea or self::lightning-input-field]" +
        "[1]//" + t);
      r.push("//*[contains(@class,'slds-form-element')]" +
        "[.//*[text()=" + wq(lblTxt) + "]]//" + t);
    }

    // Form section + field combo
    var section = el.closest(
      "section,[role='region'],fieldset," +
      "lightning-record-form,records-record-layout-section"
    );
    if (section) {
      var sectAttr =
        section.getAttribute("aria-label") ||
        section.getAttribute("data-label") ||
        section.getAttribute("data-target-section-name");
      if (sectAttr && lblTxt) {
        r.push("//*[@aria-label=" + wq(sectAttr) +
          "]//*[contains(@class,'slds-form-element')]" +
          "[.//*[text()=" + wq(lblTxt) + "]]//" + t);
      }
    }
  }

  // --- DROPDOWN TRIGGER (Lightning combobox) ---
  // Button with role=combobox or inside lightning-combobox
  var role = el.getAttribute && el.getAttribute("role");
  var inCombobox = el.closest && el.closest(
    "lightning-combobox,lightning-grouped-combobox," +
    "lightning-base-combobox,[role='combobox']"
  );
  if (inCombobox && (t === "button" || t === "input" ||
      role === "combobox")) {
    var cbLabel = findLabel(el);
    if (cbLabel && cbLabel.length < 60) {
      r.push("//*[@data-label=" + wq(cbLabel) +
        "]//button[contains(@class,'slds-combobox__input')]");
      r.push("//label[normalize-space()=" + wq(cbLabel) +
        "]/following::button[1]");
      r.push("//label[normalize-space()=" + wq(cbLabel) +
        "]/following::*[@role='combobox'][1]");
      r.push("//span[text()=" + wq(cbLabel) +
        "]/ancestor::lightning-combobox[1]//button");
      r.push("//*[contains(@class,'slds-form-element')]" +
        "[.//*[text()=" + wq(cbLabel) + "]]//button");
    }
  }

  // --- DROPDOWN OPTION (li/div with role=option) ---
  if (role === "option" || (t === "li" && el.closest("[role='listbox']")) ||
      el.closest("lightning-base-combobox-item")) {
    var optTxt = ownTxt || txt;
    if (!optTxt) {
      var optSpan = el.querySelector("span");
      if (optSpan) optTxt = optSpan.textContent.trim();
    }
    if (optTxt && optTxt.length < 60) {
      r.push("//lightning-base-combobox-item" +
        "[.//span[text()=" + wq(optTxt) + "]]");
      r.push("//*[@role='option']" +
        "[.//*[text()=" + wq(optTxt) + "]]");
      r.push("//*[@role='option']" +
        "[normalize-space()=" + wq(optTxt) + "]");
      r.push("//div[@role='listbox']" +
        "//span[text()=" + wq(optTxt) + "]");
    }
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
  if (el.id && /^[a-zA-Z][\w-]*$/.test(el.id) && !isFlakyId(el.id))
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
    if (aId && /^[a-zA-Z][\w-]*$/.test(aId) && !isFlakyId(aId)) {
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
    if (c.id && /^[a-zA-Z][\w-]*$/.test(c.id) && !isFlakyId(c.id)) {
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

  // === NEIGHBOR-ANCHORED XPATHS ===
  // When element's own text isn't unique, find a nearby element
  // with UNIQUE text and anchor from there using XPath axes.

  /**
   * Get text content for a "label-like" element.
   * Returns trimmed text if short enough to be a label.
   */
  function labelTextOf(node) {
    if (!node || !node.tagName) return "";
    var tx = (node.textContent || "").trim();
    if (!tx || tx.length > 40) return "";
    // Skip if element has many children (probably not a label)
    if (node.children && node.children.length > 3) return "";
    return tx;
  }

  /**
   * Returns the previous sibling element with usable text,
   * walking up if needed.
   */
  function findAnchorLabel(node, direction) {
    // direction: 'prev' or 'next'
    var anchors = [];
    var cur = node;
    var steps = 0;
    // Try direct sibling first
    var sib = direction === "prev"
      ? cur.previousElementSibling
      : cur.nextElementSibling;
    while (sib && steps < 5) {
      var stx = labelTextOf(sib);
      if (stx) {
        anchors.push({
          text: stx,
          tag: sib.tagName.toLowerCase(),
          rel: direction === "prev" ? "follow" : "preceding",
          distance: steps + 1,
          isSibling: true
        });
      }
      sib = direction === "prev"
        ? sib.previousElementSibling
        : sib.nextElementSibling;
      steps++;
    }
    // Then walk up to parent and look at parent's siblings
    var par = node.parentElement;
    steps = 0;
    while (par && steps < 3) {
      var psib = direction === "prev"
        ? par.previousElementSibling
        : par.nextElementSibling;
      while (psib) {
        // Look inside it for labels
        var inner = psib.querySelectorAll("label,span,h1,h2,h3,h4,h5,strong,legend");
        for (var ii = 0; ii < inner.length && ii < 3; ii++) {
          var itx = labelTextOf(inner[ii]);
          if (itx) {
            anchors.push({
              text: itx,
              tag: inner[ii].tagName.toLowerCase(),
              rel: direction === "prev" ? "follow" : "preceding",
              distance: 99,
              isSibling: false
            });
          }
        }
        psib = direction === "prev"
          ? psib.previousElementSibling
          : psib.nextElementSibling;
      }
      par = par.parentElement;
      steps++;
    }
    return anchors;
  }

  function isUniqueText(anchorText, anchorTag) {
    try {
      var xp = "//" + anchorTag + "[normalize-space()=" + wq(anchorText) + "]";
      var c = document.evaluate(
        "count(" + xp + ")", document, null,
        XPathResult.NUMBER_TYPE, null
      ).numberValue;
      return c === 1;
    } catch (e) { return false; }
  }

  // Build neighbor XPaths from anchors with unique text
  var prevAnchors = findAnchorLabel(el, "prev");
  var nextAnchors = findAnchorLabel(el, "next");

  prevAnchors.forEach(function (a) {
    if (!isUniqueText(a.text, a.tag)) return;
    if (a.isSibling) {
      r.push("//" + a.tag + "[normalize-space()=" + wq(a.text) +
             "]/following-sibling::" + t + "[1]");
    }
    r.push("//" + a.tag + "[normalize-space()=" + wq(a.text) +
           "]/following::" + t + "[1]");
    // Also generic: any label-like element with that text
    r.push("//*[normalize-space()=" + wq(a.text) +
           "]/following::" + t + "[1]");
  });

  nextAnchors.forEach(function (a) {
    if (!isUniqueText(a.text, a.tag)) return;
    if (a.isSibling) {
      r.push("//" + a.tag + "[normalize-space()=" + wq(a.text) +
             "]/preceding-sibling::" + t + "[1]");
    }
    r.push("//" + a.tag + "[normalize-space()=" + wq(a.text) +
           "]/preceding::" + t + "[1]");
  });

  // === TABLE HEADER (TH) — simple cases ===
  // If user clicked on a column header, just give clean header XPaths.
  // Don't generate sort/dropdown related complexity.
  if (t === "th") {
    var thTxt = (el.textContent || "").trim();
    if (thTxt && thTxt.length < 50) {
      r.push("//th[normalize-space()=" + wq(thTxt) + "]");
      r.push("//th[.//*[normalize-space()=" + wq(thTxt) + "]]");
    }
  }

  // === TABLE CELL — ANCHOR TO COLUMN HEADER + ROW IDENTITY ===
  // For elements inside a <td>, build XPaths that anchor to:
  //   1. Column header (<th>) — column position
  //   2. Row identifier text — which row
  //   3. The link's visible text — which item in the cell
  // This is the most stable way to target table elements when
  // href is flaky (javascript:void(0), dynamic IDs) and IDs change.
  var td = el.closest("td");
  if (td) {
    var tr = td.closest("tr");
    var table = td.closest("table");
    if (table) {
      // Compute column index
      var colIdx = 1;
      var sibTd = td;
      while (sibTd.previousElementSibling) {
        sibTd = sibTd.previousElementSibling;
        colIdx++;
      }
      // Find matching th in this column
      var ths = table.querySelectorAll(
        "thead th, tr:first-child th"
      );
      var headerEl = ths[colIdx - 1];
      var headerTxt = headerEl
        ? (headerEl.textContent || "").trim()
        : "";

      // Get the clicked link's own text (if it's a link)
      var linkTxt = t === "a"
        ? (el.textContent || "").trim()
        : "";

      // === Strategies based on what we have ===

      if (headerTxt && headerTxt.length < 40) {
        // === TEXT-INDEPENDENT (when link text is dynamic) ===
        // Column index computed dynamically from header position
        // — survives column reorders too.
        var colByHeader =
          "count(//th[normalize-space()=" + wq(headerTxt) +
          "]/preceding-sibling::th)+1";

        // T1. First link in the column with this header,
        //     first row (no link text needed)
        r.push(
          "//th[normalize-space()=" + wq(headerTxt) +
          "]/ancestor::table//tbody//tr[1]/td[" +
          colByHeader + "]//a[1]"
        );
        // T2. First link in the column (any row) — fragile if
        //     there are multiple rows
        r.push(
          "//th[normalize-space()=" + wq(headerTxt) +
          "]/ancestor::table//tbody//tr/td[" +
          colByHeader + "]//a[1]"
        );
        // T3. Static colIdx version (only works if columns
        //     never reorder)
        r.push(
          "//th[normalize-space()=" + wq(headerTxt) +
          "]/ancestor::table//tbody//tr[1]/td[" + colIdx +
          "]//a[1]"
        );

        // === TEXT-DEPENDENT (only when link text is stable) ===
        if (linkTxt && linkTxt.length < 60) {
          r.push(
            "//table//th[normalize-space()=" + wq(headerTxt) +
            "]/ancestor::table//tbody//tr/td[" + colIdx +
            "]//a[normalize-space()=" + wq(linkTxt) + "]"
          );
          r.push(
            "//th[normalize-space()=" + wq(headerTxt) +
            "]/ancestor::table//td[" + colIdx +
            "]//a[contains(.," + wq(linkTxt) + ")]"
          );
        }
        // Generic any-tag versions (not just <a>)
        r.push(
          "//table//th[normalize-space()=" + wq(headerTxt) +
          "]/ancestor::table//tbody//tr/td[" + colIdx +
          "]//" + t
        );
        r.push(
          "//table//th[normalize-space()=" + wq(headerTxt) +
          "]/ancestor::table//tbody//tr[1]/td[" + colIdx +
          "]//" + t
        );
      }

      // Row-based strategies
      if (tr) {
        // Pick the cleanest "row key" from another cell.
        // Prefer cells with short, single-line, simple text.
        var rowKey = "";
        var trCells = tr.querySelectorAll("td");
        var bestKey = { score: 1e9, txt: "" };
        for (var rci = 0; rci < trCells.length; rci++) {
          if (trCells[rci] === td) continue;
          var raw = (trCells[rci].textContent || "").trim();
          // Skip empties and obvious action menus
          if (!raw || raw.length < 2) continue;
          if (/^(edit|delete|view|more|\u2026)$/i.test(raw)) continue;
          // Normalize whitespace for the key
          var clean = raw.replace(/\s+/g, " ").trim();
          if (clean.length > 50) continue;
          // Score: shorter + fewer extra elements = better
          var keyScore = clean.length +
            (trCells[rci].children.length * 3);
          if (keyScore < bestKey.score) {
            bestKey = { score: keyScore, txt: clean };
          }
        }
        var rowKey = bestKey.txt;
        if (rowKey) {
          // === TEXT-INDEPENDENT row anchors ===
          // First link in the row containing this row-key
          r.push(
            "//tr[.//*[normalize-space()=" + wq(rowKey) +
            "]]//a[1]"
          );
          // First link in a specific column of the row
          if (headerTxt) {
            r.push(
              "//tr[.//*[normalize-space()=" + wq(rowKey) +
              "]]/td[" + colIdx + "]//a[1]"
            );
            // Most robust combo — row id + header-counted column
            r.push(
              "//tr[.//*[normalize-space()=" + wq(rowKey) +
              "]]/td[count(//th[normalize-space()=" +
              wq(headerTxt) +
              "]/preceding-sibling::th)+1]//a[1]"
            );
          }

          // 4. Link with text X in row that contains Y
          if (linkTxt) {
            r.push(
              "//tr[.//*[normalize-space()=" + wq(rowKey) +
              "]]//a[normalize-space()=" + wq(linkTxt) + "]"
            );
            r.push(
              "//tr[contains(.," + wq(rowKey) +
              ")]//a[normalize-space()=" + wq(linkTxt) + "]"
            );
          }
          // 5. Anything in the row containing Y
          r.push(
            "//tr[.//*[normalize-space()=" + wq(rowKey) +
            "]]//" + t
          );
          // 6. Specific column in the row containing Y
          if (headerTxt) {
            r.push(
              "//tr[.//*[normalize-space()=" + wq(rowKey) +
              "]]/td[" + colIdx + "]//" + t
            );
          }
        }

        // 7. Link with this text — if it's unique within
        //    the table, that's enough
        if (linkTxt && linkTxt.length < 60) {
          r.push("//table//a[normalize-space()=" + wq(linkTxt) + "]");
        }
      }
    }
  }

  // === HEADING ANCHOR ===
  // Find the nearest preceding heading (h1-h6, section title)
  // and anchor from it.
  var headingTags = ["h1", "h2", "h3", "h4", "h5", "h6"];
  var nearestHeading = null;
  var nearestHeadingTxt = "";
  // Walk up to find a section, then look for heading inside it
  var section = el.closest(
    "section,article,fieldset," +
    ".slds-section,.slds-card,[role='region']"
  );
  if (section) {
    for (var hi = 0; hi < headingTags.length; hi++) {
      var h = section.querySelector(
        headingTags[hi] + ",.slds-section__title," +
        ".slds-card__header-title"
      );
      if (h) {
        var htx = (h.textContent || "").trim();
        if (htx && htx.length < 60) {
          nearestHeading = h;
          nearestHeadingTxt = htx;
          break;
        }
      }
    }
  }
  // Also try preceding heading anywhere in DOM
  if (!nearestHeading) {
    var allH = document.querySelectorAll("h1,h2,h3,h4,h5,h6");
    for (var ai = allH.length - 1; ai >= 0; ai--) {
      var hpos = allH[ai].compareDocumentPosition(el);
      if (hpos & Node.DOCUMENT_POSITION_FOLLOWING) {
        var htxt = (allH[ai].textContent || "").trim();
        if (htxt && htxt.length < 60 && isUniqueText(htxt, allH[ai].tagName.toLowerCase())) {
          nearestHeading = allH[ai];
          nearestHeadingTxt = htxt;
          break;
        }
      }
    }
  }
  if (nearestHeading && nearestHeadingTxt) {
    var hTag = nearestHeading.tagName.toLowerCase();
    // "first tag below heading X"
    r.push("//" + hTag + "[normalize-space()=" + wq(nearestHeadingTxt) +
           "]/following::" + t + "[1]");
    // Generic version (any heading-like element)
    r.push("//*[self::h1 or self::h2 or self::h3 or self::h4 or " +
           "self::h5 or self::h6][normalize-space()=" +
           wq(nearestHeadingTxt) + "]/following::" + t + "[1]");
    // Scoped to section containing heading
    if (txt) {
      r.push("//" + hTag + "[normalize-space()=" + wq(nearestHeadingTxt) +
             "]/ancestor::section[1]//" + t +
             "[normalize-space()=" + wq(txt) + "]");
    }
  }

  // === MODAL / DIALOG SCOPE ===
  // If element is inside an open modal/dialog, scope XPath to it
  // This avoids matching the same text in closed/hidden modals
  var modalAnc = el.closest(
    "section.slds-modal,[role='dialog']," +
    "[role='alertdialog'],.uiModal," +
    ".forceModalContainer"
  );
  if (modalAnc) {
    var modalScope = "//section[contains(@class,'slds-modal') " +
                     "and not(contains(@style,'display:none'))]";
    if (txt) {
      r.push(modalScope + "//" + t +
             "[normalize-space()=" + wq(txt) + "]");
    }
    var bsTxtMod = getDirectSpanText(el);
    if (bsTxtMod) {
      r.push(modalScope + "//" + t +
             "[.//span[text()=" + wq(bsTxtMod) + "]]");
    }
    if (el.getAttribute("title")) {
      r.push(modalScope + "//" + t +
             "[@title=" + wq(el.getAttribute("title")) + "]");
    }
  }

  // === VISIBLE-ONLY XPATH (kept short and readable) ===
  // Use a single compact predicate that covers the common cases
  var visFilter =
    "not(ancestor-or-self::*[@aria-hidden='true' or @hidden]) and " +
    "not(ancestor-or-self::*[contains(@style,'display:none')])";
  // Only add a visible-only variant when text-based XPath might match
  // multiple elements (otherwise it's redundant noise)
  if (txt && txt.length <= 30) {
    var simpleTxt = "//" + t + "[normalize-space()=" + wq(txt) + "]";
    if (countMatches(simpleTxt) > 1) {
      r.push("//" + t + "[normalize-space()=" + wq(txt) +
             " and " + visFilter + "]");
    }
  }

  // === COMBINATION XPATHS ===
  // When single attribute isn't unique, try combining 2 stable
  // attributes/text into one XPath. Skip dynamic-looking values.
  var stableProps = [];
  if (txt && txt.length < 50 && !looksDynamic(txt)) {
    stableProps.push({
      cond: "normalize-space()=" + wq(txt),
      key: "text"
    });
  }
  ["title", "name", "placeholder", "data-id", "data-label",
   "data-name", "data-aura-class", "aria-label", "role"]
    .forEach(function (a) {
      var v = el.getAttribute(a);
      if (!v || v.length > 60 || looksDynamic(v)) return;
      stableProps.push({
        cond: "@" + a + "=" + wq(v),
        key: a
      });
    });
  // Build pair combinations
  for (var i = 0; i < stableProps.length; i++) {
    for (var j = i + 1; j < stableProps.length; j++) {
      var combo = "//" + t + "[" +
                  stableProps[i].cond + " and " +
                  stableProps[j].cond + "]";
      r.push(combo);
    }
  }

  // Dedupe + validate
  var seen = {}, valid = [];
  r.forEach(function (xp) {
    if (seen[xp]) return;
    seen[xp] = 1;
    valid.push({ xp: xp, count: countMatches(xp) });
  });

  // Indexed XPath fallback:
  // For the best non-unique XPath, generate an indexed
  // version that targets THIS specific element by its
  // position among matches.
  var hasUnique = false;
  valid.forEach(function (v) { if (v.count === 1) hasUnique = true; });
  if (!hasUnique && valid.length > 0) {
    // Find the most specific (shortest count > 0) candidate
    var best = null;
    valid.forEach(function (v) {
      if (v.count > 0 && v.count < 20) {
        if (!best || v.count < best.count) best = v;
      }
    });
    if (best) {
      try {
        var res = document.evaluate(
          best.xp, document, null,
          XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null
        );
        var idx = -1;
        for (var i = 0; i < res.snapshotLength; i++) {
          if (res.snapshotItem(i) === el) { idx = i + 1; break; }
        }
        if (idx > 0) {
          var indexedXp = "(" + best.xp + ")[" + idx + "]";
          if (!seen[indexedXp]) {
            valid.unshift({
              xp: indexedXp,
              count: countMatches(indexedXp)
            });
            seen[indexedXp] = 1;
          }
          // [last()] is often the visible/active one (modal at end)
          if (idx === res.snapshotLength) {
            var lastXp = "(" + best.xp + ")[last()]";
            if (!seen[lastXp]) {
              valid.unshift({
                xp: lastXp,
                count: countMatches(lastXp)
              });
              seen[lastXp] = 1;
            }
          }
        }
      } catch (e) {}
    }
  }

  // Quality score: prefer semantic XPaths over positional
  function score(xp) {
    var s = 0;
    // Positional XPaths are very fragile
    if (/\[\d+\]\//.test(xp) || /\/\w+\[\d+\]$/.test(xp)) s += 100;
    // Indexed by position [N] (better than pure positional)
    if (/^\(/.test(xp)) s += 30;
    // ID-based XPaths penalized — IDs are often dynamic in SF
    if (/@id=/.test(xp)) s += 60;
    // Long XPaths penalty (smaller weight than fragility)
    s += xp.length / 15;
    // Bonuses (lower = better)
    if (xp.indexOf("slds-modal") > -1) s -= 20;
    if (xp.indexOf("not(ancestor-or-self") > -1) s -= 15;
    if (/text\(\)|normalize-space/.test(xp)) s -= 12;
    // Heading-anchored (semantic, very stable)
    if (/^\/\/h\d\[|self::h1/.test(xp)) s -= 30;
    // Table cell anchored to column header
    if (xp.indexOf("//th[") > -1) s -= 35;
    // Row-anchored (anchored to row identifier text)
    if (/\/\/tr\[\.\/\//.test(xp)) s -= 35;
    // Column index computed from header (survives reorder)
    if (xp.indexOf("count(//th[") > -1) s -= 30;
    // Position-only link selectors (good when text is dynamic)
    if (/\/\/a\[1\]/.test(xp) || /\/\/a\[last\(\)\]/.test(xp)) s -= 5;
    // Combination XPath (two stable attributes) — very precise
    if (/\sand\s/.test(xp) && (xp.match(/=/g) || []).length >= 2) s -= 18;
    // Penalize href-based — they're often flaky (record IDs etc)
    if (/@href=/.test(xp)) s += 50;
    if (xp.indexOf("javascript") > -1) s += 200;
    // Penalize XPaths whose quoted values look dynamic
    // (case numbers, dates, timestamps, etc.)
    var quoted = xp.match(/'([^']+)'/g) || [];
    quoted.forEach(function (q) {
      var v = q.slice(1, -1);
      if (looksDynamic(v)) s += 80;
    });
    // Label following-sibling/following — common form pattern
    if (/\/\/label\[/.test(xp)) s -= 20;
    // Following-sibling on form labels
    if (/following-sibling/.test(xp)) s -= 8;
    // data-* attributes are intentional Salesforce hooks
    if (/@data-(id|name|label|testid)/.test(xp)) s -= 25;
    return s;
  }

  valid.sort(function (a, b) {
    if (a.count === 1 && b.count !== 1) return -1;
    if (b.count === 1 && a.count !== 1) return 1;
    if (a.count !== b.count) return a.count - b.count;
    return score(a.xp) - score(b.xp);
  });

  // === DIVERSITY FILTER ===
  // Categorize each XPath by which "technique" it uses,
  // then return up to 5 from DIFFERENT techniques so the
  // user sees variety, not 3 versions of the same approach.
  function category(xp) {
    if (xp.indexOf("//th[") > -1 && xp.indexOf("//tr[") > -1) return "table:row+col";
    if (xp.indexOf("//th[") > -1) return "table:header";
    if (/\/\/tr\[\.\/\//.test(xp)) return "table:row";
    if (xp.indexOf("slds-modal") > -1) return "modal";
    if (xp.indexOf("not(ancestor-or-self") > -1) return "visible";
    if (/following-sibling/.test(xp)) return "sibling:follow";
    if (/preceding-sibling/.test(xp)) return "sibling:precede";
    if (/following::/.test(xp)) return "follow:axis";
    if (/preceding::/.test(xp)) return "precede:axis";
    if (xp.indexOf("ancestor::") > -1) return "ancestor";
    if (xp.indexOf("parent::") > -1) return "parent";
    if (/@data-/.test(xp)) return "data-attr";
    if (/@aria-/.test(xp)) return "aria";
    if (/@id=/.test(xp)) return "id";
    if (/@href=/.test(xp)) return "href";
    if (/@title=/.test(xp)) return "title";
    if (/@name=/.test(xp)) return "name";
    if (/@placeholder=/.test(xp)) return "placeholder";
    if (/contains\(@class/.test(xp)) return "class";
    // Combination XPath = two stable conditions joined by " and "
    if (/\sand\s/.test(xp) && (xp.match(/=/g) || []).length >= 2) return "combination";
    if (/normalize-space|text\(\)/.test(xp)) return "text";
    return "other";
  }
  var picked = [], usedCat = {};
  // First pass: one per category
  for (var pi = 0; pi < valid.length && picked.length < 5; pi++) {
    var cat = category(valid[pi].xp);
    if (!usedCat[cat]) {
      usedCat[cat] = true;
      picked.push(valid[pi]);
    }
  }
  // Second pass: fill remaining slots with best remaining
  for (var pj = 0; pj < valid.length && picked.length < 5; pj++) {
    if (picked.indexOf(valid[pj]) === -1) {
      picked.push(valid[pj]);
    }
  }
  return picked;
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

function deepestUnderPoint(e) {
  // Use composedPath() to pierce Shadow DOM (like DevTools)
  try {
    var path = e.composedPath && e.composedPath();
    if (path && path.length > 0) {
      for (var i = 0; i < path.length; i++) {
        var n = path[i];
        if (n && n.nodeType === 1 && n.tagName) return n;
      }
    }
  } catch (ex) {}
  try {
    var fp = document.elementFromPoint(e.clientX, e.clientY);
    if (fp) return fp;
  } catch (ex) {}
  return e.target;
}

function onHover(e) {
  if (!on) return;
  var el = deepestUnderPoint(e);
  if (!el || !el.tagName) return;
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

    var testBtn = document.createElement("button");
    testBtn.style.cssText =
      "cursor:pointer;padding:2px 8px;" +
      "font-size:10px;background:#1565c0;" +
      "color:#fff;border:none;border-radius:3px;" +
      "white-space:nowrap;";
    testBtn.textContent = "Test";
    testBtn.title =
      "Copies console command to verify and click";

    function makeCopier(text, elem, label) {
      return function (ev) {
        ev.stopPropagation();
        ev.preventDefault();
        if (navigator.clipboard)
          navigator.clipboard.writeText(text)
            .then(function () {
              var orig = elem.textContent;
              elem.style.color = "#4caf50";
              if (label) {
                elem.textContent = "\u2713";
                setTimeout(function () {
                  elem.textContent = orig;
                  elem.style.color = "";
                }, 800);
              } else {
                setTimeout(function () {
                  elem.style.color = "";
                }, 600);
              }
            });
      };
    }

    var testCmd =
      "$x(" + JSON.stringify(item.xp) + ")[0].click()";

    code.onclick = makeCopier(item.xp, code);
    cpBtn.onclick = makeCopier(item.xp, cpBtn, true);
    testBtn.onclick = makeCopier(testCmd, testBtn, true);

    row.appendChild(num);
    row.appendChild(code);
    row.appendChild(badge);
    row.appendChild(cpBtn);
    row.appendChild(testBtn);
    box.appendChild(row);
  });

  // ========== DROPDOWN TEMPLATES (with ## placeholder) ==========
  var ddRole = el.getAttribute && el.getAttribute("role");
  var isTrigger =
    (ddRole === "combobox") ||
    (el.closest && el.closest(
      "lightning-combobox,lightning-grouped-combobox," +
      "lightning-base-combobox,[role='combobox']"
    ));
  var isOption =
    (ddRole === "option") ||
    (el.closest && el.closest(
      "[role='option'],lightning-base-combobox-item," +
      "[role='listbox'] li"
    ));

  if (isTrigger || isOption) {
    var ddTitle = document.createElement("div");
    ddTitle.style.cssText =
      "margin-top:10px;padding-top:8px;" +
      "border-top:1px solid #444;" +
      "font-weight:bold;color:#ffb74d;";
    ddTitle.textContent = "Dropdown Templates (## placeholder)";
    box.appendChild(ddTitle);

    var templates = [];

    // COMBINED: single XPath with TWO ## placeholders
    // 1st ## = dropdown label, 2nd ## = option text
    templates.push({
      label: "ONE XPath (label + option, 2x ##)",
      xp: "//label[normalize-space()='##']/following::lightning-base-combobox-item[.//span[text()='##']][1]"
    });
    templates.push({
      label: "ONE XPath (data-label + option, 2x ##)",
      xp: "//*[@data-label='##']/following::*[@role='option'][normalize-space()='##'][1]"
    });
    templates.push({
      label: "ONE XPath (span label + option, 2x ##)",
      xp: "//span[text()='##']/ancestor::lightning-combobox[1]/following::lightning-base-combobox-item[.//span[text()='##']][1]"
    });

    if (isTrigger) {
      templates.push({
        label: "Open dropdown by label (single ##)",
        xp: "//*[@data-label='##']//button[contains(@class,'slds-combobox__input')]"
      });
      templates.push({
        label: "Open dropdown (label text, single ##)",
        xp: "//label[normalize-space()='##']/following::button[1]"
      });
    }
    if (isOption) {
      templates.push({
        label: "Pick option by text (single ##)",
        xp: "//lightning-base-combobox-item[.//span[text()='##']]"
      });
      templates.push({
        label: "Pick role=option by text (single ##)",
        xp: "//*[@role='option'][normalize-space()='##']"
      });
    }

    templates.forEach(function (tpl) {
      var trow = document.createElement("div");
      trow.style.cssText =
        "margin:6px 0;display:flex;flex-direction:column;gap:2px;";

      var lbl = document.createElement("span");
      lbl.style.cssText = "color:#aaa;font-size:10px;";
      lbl.textContent = tpl.label + ":";

      var row2 = document.createElement("div");
      row2.style.cssText =
        "display:flex;align-items:start;gap:6px;";

      var tcode = document.createElement("code");
      tcode.style.cssText =
        "flex:1;word-break:break-all;cursor:pointer;color:#ffd54f;";
      tcode.textContent = tpl.xp;

      var tcp = document.createElement("button");
      tcp.style.cssText =
        "cursor:pointer;padding:2px 8px;font-size:10px;" +
        "background:#ef6c00;color:#fff;border:none;" +
        "border-radius:3px;white-space:nowrap;";
      tcp.textContent = "Copy";

      var copyTpl = function (xp, btn) {
        return function (ev) {
          ev.stopPropagation();
          ev.preventDefault();
          if (navigator.clipboard)
            navigator.clipboard.writeText(xp)
              .then(function () {
                var orig = btn.textContent;
                btn.textContent = "\u2713";
                btn.style.background = "#2e7d32";
                setTimeout(function () {
                  btn.textContent = orig;
                  btn.style.background = "#ef6c00";
                }, 800);
              });
        };
      };

      tcode.onclick = copyTpl(tpl.xp, tcode);
      tcp.onclick = copyTpl(tpl.xp, tcp);

      trow.appendChild(lbl);
      row2.appendChild(tcode);
      row2.appendChild(tcp);
      trow.appendChild(row2);
      box.appendChild(trow);
    });

    var ddHint = document.createElement("div");
    ddHint.style.cssText =
      "margin-top:4px;font-size:10px;color:#aaa;";
    ddHint.textContent =
      "2x ## = 1st: dropdown label, 2nd: option text | " +
      "1x ## = just label or just option";
    box.appendChild(ddHint);
  }

  var hint = document.createElement("div");
  hint.style.cssText =
    "margin-top:8px;font-size:10px;color:#777;";
  hint.textContent =
    "Copy=copy xpath | Test=paste in console to verify | " +
    "Green=unique | Red=multiple";
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
    document.addEventListener("pointermove", onHover, true);
    // Block focus loss so dropdowns/popovers don't close
    document.addEventListener("focusout", focusBlocker, true);
    document.addEventListener("blur", focusBlocker, true);
    btn.textContent = "XPath: ON (\u2318\u21E7X or Ctrl+Shift+X)";
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
    document.removeEventListener("pointermove", onHover, true);
    document.removeEventListener("focusout", focusBlocker, true);
    document.removeEventListener("blur", focusBlocker, true);
    hide();
    clearHover();
    btn.textContent = "XPath: OFF (\u2318\u21E7X or Ctrl+Shift+X)";
    btn.style.background = "#f44336";
  }
}

// ========== INIT ==========

var btn = document.createElement("button");
btn.id = "__xf_toggle";
btn.textContent = "XPath: OFF (\u2318\u21E7X or Ctrl+Shift+X)";
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
  // Use e.code (layout-independent) - "KeyX" always
  // means the X key regardless of Mac Option special chars
  var isX = e.code === "KeyX";
  if (!isX) return;
  // Cmd+Shift+X (Mac) or Ctrl+Shift+X (Win/Linux)
  var hasMod = (e.metaKey || e.ctrlKey) && e.shiftKey;
  if (hasMod) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    toggle();
  }
}

// Attach in CAPTURE phase to both window and document
// so Salesforce can't swallow the event first
window.addEventListener("keydown", shortcutHandler, true);
document.addEventListener("keydown", shortcutHandler, true);
})();
