/**
 * Salesforce XPath Finder v4
 * - Sibling, neighbor, descendant, ancestor XPath strategies
 * - SVG/icon click handling (walks up to clickable parent)
 * - Better link handling (href, text, nav context)
 * - Live hover highlight (like DevTools inspect)
 * - Toggle: Ctrl+Shift+X (Cmd+Shift+X on Mac)
 */

(function () {
    if (window.__xf) return;
    window.__xf = true;

    var on = false,
        box = null,
        hoverEl = null,
        hoverOutline = "";

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
                document,
                null,
                XPathResult.NUMBER_TYPE,
                null
            ).numberValue;
        } catch (e) {
            return 999;
        }
    }

    function getOwnText(el) {
        var txt = "";
        for (var i = 0; i < el.childNodes.length; i++) {
            if (el.childNodes[i].nodeType === 3) {
                txt += el.childNodes[i].textContent;
            }
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
        var cur = el,
            depth = 0;

        while (cur && depth < 6) {
            var t = cur.tagName ? cur.tagName.toLowerCase() : "";

            if (
                t === "button" ||
                t === "a" ||
                cur.getAttribute("role") === "button" ||
                cur.getAttribute("role") === "menuitem" ||
                cur.getAttribute("role") === "tab"
            )
                return cur;

            if (t === "div" && cur.getAttribute("onclick")) return cur;

            cur = cur.parentElement;
            depth++;
        }

        return el;
    }

    // ---- Main XPath generator ----

    function gen(rawEl) {
        var el = rawEl;

        if (!el || !el.tagName) return [];

        var t = el.tagName.toLowerCase();

        // SVG/icon/path/img -> walk up to clickable parent
        if (
            t === "svg" ||
            t === "path" ||
            t === "use" ||
            t === "circle" ||
            t === "line" ||
            t === "rect" ||
            t === "polygon" ||
            t === "g" ||
            t === "img" ||
            t === "i"
        ) {
            el = walkUpToClickable(rawEl);
            t = el.tagName ? el.tagName.toLowerCase() : "";
        }

        var r = [];

        var fullTxt = "";
        try {
            fullTxt = (el.textContent || "").trim();
        } catch (e) {}

        var txt = fullTxt.length <= 50 ? fullTxt : "";
        var ownTxt = getOwnText(el);

        // --- Lightning custom element (tag with dash) ---
        if (t.indexOf("-") > 0) {
            [
                "data-id",
                "data-name",
                "data-label",
                "data-tracking-type",
                "data-aura-class",
                "aria-label",
                "title",
                "name"
            ].forEach(function (a) {
                var v = el.getAttribute(a);
                if (v && v.length < 80)
                    r.push("//" + t + "[@" + a + "=" + wq(v) + "]");
            });

            if (el.className && typeof el.className === "string") {
                var cls = el.className.trim().split(/\s+/);

                for (var ci = 0; ci < cls.length; ci++) {
                    if (
                        cls[ci].length > 3 &&
                        !/^ng-|^is-|^has-/.test(cls[ci])
                    ) {
                        try {
                            if (
                                document.querySelectorAll(
                                    t + "." + CSS.escape(cls[ci])
                                ).length === 1
                            ) {
                                r.push(
                                    "//" +
                                        t +
                                        "[contains(@class," +
                                        wq(cls[ci]) +
                                        ")]"
                                );
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

        // --- Shadow DOM host attributes ---
        try {
            var root = el.getRootNode && el.getRootNode();

            if (root && root !== document && root.host) {
                var h = root.host,
                    ht = h.tagName.toLowerCase();

                [
                    "data-id",
                    "data-name",
                    "data-label",
                    "data-tracking-type",
                    "data-aura-class",
                    "aria-label",
                    "title"
                ].forEach(function (a) {
                    var hv = h.getAttribute(a);

                    if (hv)
                        r.push("//" + ht + "[@" + a + "=" + wq(hv) + "]");
                });

                if (h.id && !/\d{4,}/.test(h.id))
                    r.push("//" + ht + "[@id='" + h.id + "']");
            }
        } catch (e) {}

        if (el.shadowRoot) {
            [
                "data-id",
                "data-name",
                "data-label",
                "data-tracking-type",
                "aria-label"
            ].forEach(function (a) {
                var sv = el.getAttribute(a);

                if (sv)
                    r.push("//" + t + "[@" + a + "=" + wq(sv) + "]");
            });
        }

        // --- Button ---
        if (t === "button") {
            var bsTxt = getDirectSpanText(el);

            if (bsTxt)
                r.push(
                    "//span[text()=" +
                        wq(bsTxt) +
                        "]/parent::button"
                );

            if (el.getAttribute("title"))
                r.push(
                    "//button[@title=" +
                        wq(el.getAttribute("title")) +
                        "]"
                );

            if (txt && !bsTxt)
                r.push("//button[normalize-space()=" + wq(txt) + "]");

            if (bsTxt && el.getAttribute("title"))
                r.push(
                    "//button[@title=" +
                        wq(el.getAttribute("title")) +
                        " and .//span[text()=" +
                        wq(bsTxt) +
                        "]]"
                );
        }

        // --- Link (improved) ---
        if (t === "a") {
            var adl = el.getAttribute("data-label");

            if (txt && adl)
                r.push(
                    "//a[text()=" +
                        wq(txt) +
                        "][@data-label=" +
                        wq(adl) +
                        "]"
                );

            if (txt) {
                r.push("//a[text()=" + wq(txt) + "]");
                r.push("//a[normalize-space()=" + wq(txt) + "]");
            }

            if (el.getAttribute("title"))
                r.push(
                    "//a[@title=" +
                        wq(el.getAttribute("title")) +
                        "]"
                );

            if (el.getAttribute("href")) {
                var href = el.getAttribute("href");

                if (href !== "#" && href !== "javascript:void(0)") {
                    if (href.length < 60)
                        r.push("//a[@href=" + wq(href) + "]");

                    var hrefParts = href
                        .split("/")
                        .filter(function (p) {
                            return p && p.length > 2;
                        });

                    if (hrefParts.length > 0)
                        r.push(
                            "//a[contains(@href," +
                                wq(
                                    hrefParts[hrefParts.length - 1]
                                ) +
                                ")]"
                        );
                }
            }

            var aSpan = getDirectSpanText(el);

            if (aSpan)
                r.push(
                    "//span[text()=" +
                        wq(aSpan) +
                        "]/parent::a"
                );

            // Link inside a nav/list -> use context
            var navParent = el.closest(
                "nav, ul, [role='navigation'], [role='menubar'], [role='tablist']"
            );

            if (navParent) {
                var navAttr =
                    navParent.getAttribute("aria-label") ||
                    navParent.getAttribute("data-label") ||
                    navParent.getAttribute("role");

                if (navAttr && txt)
                    r.push(
                        "//*[@" +
                            "aria-label=" +
                            wq(navAttr) +
                            "]//a[text()=" +
                            wq(txt) +
                            "]"
                    );
            }
        }

        // --- Span -> parent ---
        if (t === "span") {
            var sTxt = ownTxt || txt;

            if (sTxt && sTxt.length <= 50) {
                var par = el.parentElement,
                    pt = par ? par.tagName.toLowerCase() : "";

                if (pt === "button")
                    r.push(
                        "//span[text()=" +
                            wq(sTxt) +
                            "]/parent::button"
                    );
                else if (pt === "a")
                    r.push(
                        "//span[text()=" +
                            wq(sTxt) +
                            "]/parent::a"
                    );
                else {
                    r.push("//span[text()=" + wq(sTxt) + "]");
                    r.push(
                        "//span[normalize-space()=" +
                            wq(sTxt) +
                            "]"
                    );
                }
            }
        }

        // --- Div leaf text ---
        if (
            t === "div" &&
            (ownTxt || txt) &&
            el.children.length === 0
        ) {
            var dTxt = ownTxt || txt;

            if (dTxt.length <= 50) {
                var dp = el.parentElement;

                if (
                    dp &&
                    dp.tagName.toLowerCase() === "a"
                )
                    r.push(
                        "//div[text()=" +
                            wq(dTxt) +
                            "]/parent::a"
                    );
                else
                    r.push("//div[text()=" + wq(dTxt) + "]");
            }
        }

        // --- Other leaf text ---
        if (
            (ownTxt || txt) &&
            el.children.length === 0 &&
            !/^(button|a|span|div)$/.test(t)
        ) {
            var lTxt = ownTxt || txt;

            if (lTxt.length <= 50)
                r.push("//" + t + "[text()=" + wq(lTxt) + "]");
        }

        // --- Radio / Checkbox ---
        if (t === "input" && el.type === "radio") {
            var rl = findLabel(el);

            if (rl)
                r.push(
                    "//span[text()=" +
                        wq(rl) +
                        "]/ancestor::label//input[@type='radio']"
                );
        }

        if (t === "input" && el.type === "checkbox") {
            var cl = findLabel(el);

            if (cl)
                r.push(
                    "//span[text()=" +
                        wq(cl) +
                        "]/ancestor::label//input[@type='checkbox']"
                );
        }

        // --- Input/textarea via wrappers ---
        if (t === "input" || t === "textarea") {
            var dlw = el.closest("[data-label]");

            if (dlw)
                r.push(
                    "//*[@" +
                        "data-label=" +
                        wq(dlw.getAttribute("data-label")) +
                        "]//" +
                        t
                );

            var alw = el.closest("[aria-label]");

            if (alw && alw !== el)
                r.push(
                    "//*[@" +
                        "aria-label=" +
                        wq(alw.getAttribute("aria-label")) +
                        "]//" +
                        t
                );
        }

        // --- Common attributes ---
        [
            "data-label",
            "data-id",
            "data-name",
            "data-aura-class",
            "aria-label",
            "title",
            "name",
            "placeholder",
            "role",
            "type"
        ].forEach(function (a) {
            var v = el.getAttribute(a);

            if (!v || v.length > 80) return;

            if (
                a === "type" &&
                /^(text|hidden)$/.test(v)
            )
                return;

            if (
                a === "role" &&
                /^(presentation|none|group)$/.test(v)
            )
                return;

            r.push("//" + t + "[@" + a + "=" + wq(v) + "]");
        });

        // --- Stable ID ---
        if (
            el.id &&
            /^[a-zA-Z][\w-]*$/.test(el.id) &&
            !/\d{4,}/.test(el.id)
        )
            r.push("//*[@id='" + el.id + "']");

        // --- Select ---
        if (t === "select" && el.getAttribute("name"))
            r.push(
                "//select[@name=" +
                    wq(el.getAttribute("name")) +
                    "]"
            );

        // --- SIBLING / NEIGHBOR strategies ---
        var prevSib = el.previousElementSibling;
        var nextSib = el.nextElementSibling;

        // preceding-sibling with label text -> following-sibling::input
        if (
            (t === "input" ||
                t === "textarea" ||
                t === "select") &&
            prevSib
        ) {
            var prevTxt = prevSib.textContent
                ? prevSib.textContent.trim()
                : "";

            var prevTag =
                prevSib.tagName.toLowerCase();

            if (prevTxt && prevTxt.length < 40) {
                r.push(
                    "//" +
                        prevTag +
                        "[text()=" +
                        wq(prevTxt) +
                        "]/following-sibling::" +
                        t
                );

                r.push(
                    "//" +
                        prevTag +
                        "[normalize-space()=" +
                        wq(prevTxt) +
                        "]/following-sibling::" +
                        t
                );
            }
        }

        // following-sibling: element before a known sibling
        if (nextSib && txt) {
            var nextTxt = nextSib.textContent
                ? nextSib.textContent.trim()
                : "";

            var nextTag =
                nextSib.tagName.toLowerCase();

            if (
                nextTxt &&
                nextTxt.length < 40 &&
                nextTxt !== txt
            ) {
                r.push(
                    "//" +
                        nextTag +
                        "[text()=" +
                        wq(nextTxt) +
                        "]/preceding-sibling::" +
                        t
                );
            }
        }

        // --- ANCESTOR + DESCENDANT strategies ---
        var anc = el.parentElement,
            depth = 0;

        while (anc && depth < 8) {
            var aId = anc.id;

            var ancAttrs = [
                "data-label",
                "aria-label",
                "data-id",
                "data-name",
                "data-aura-class"
            ];

            if (
                aId &&
                /^[a-zA-Z][\w-]*$/.test(aId) &&
                !/\d{4,}/.test(aId)
            ) {
                r.push("//*[@id='" + aId + "']//" + t);
                r.push(
                    "//*[@id='" +
                        aId +
                        "']//descendant::" +
                        t
                );
                break;
            }

            var found = false;

            for (
                var ai = 0;
                ai < ancAttrs.length;
                ai++
            ) {
                var av =
                    anc.getAttribute &&
                    anc.getAttribute(ancAttrs[ai]);

                if (av) {
                    r.push(
                        "//*[@" +
                            ancAttrs[ai] +
                            "=" +
                            wq(av) +
                            "]//" +
                            t
                    );

                    r.push(
                        "//*[@" +
                            ancAttrs[ai] +
                            "=" +
                            wq(av) +
                            "]//descendant::" +
                            t
                    );

                    found = true;
                    break;
                }
            }

            if (found) break;

            anc = anc.parentElement;
            depth++;
        }

        // --- Partial text match ---
        if (
            fullTxt.length > 15 &&
            fullTxt.length <= 80 &&
            el.children.length === 0
        ) {
            r.push(
                "//" +
                    t +
                    "[contains(text()," +
                    wq(fullTxt.substring(0, 20)) +
                    ")]"
            );
        }

        // --- Children drill-down ---
        if (r.length < 2) {
            var inner = el.querySelector(
                "a,button,input,select,textarea,span[onclick],div[role='button']"
            );

            if (inner)
                gen(inner).forEach(function (item) {
                    if (item.xp) r.push(item.xp);
                });
        }

        // --- Positional fallback (short, stops early) ---
        var parts = [],
            c = el,
            maxP = 6;

        while (
            c &&
            c.nodeType === 1 &&
            maxP > 0
        ) {
            var tg = c.tagName.toLowerCase();

            if (tg === "body" || tg === "html")
                break;

            if (
                c.id &&
                /^[a-zA-Z][\w-]*$/.test(c.id) &&
                !/\d{4,}/.test(c.id)
            ) {
                parts.unshift(
                    tg + "[@id='" + c.id + "']"
                );
                break;
            }

            var sib = c,
                cnt = 0,
                pos = 0;

            while (sib) {
                if (
                    sib.nodeType === 1 &&
                    sib.tagName.toLowerCase() === tg
                ) {
                    cnt++;

                    if (sib === c) pos = cnt;
                }

                sib = sib.previousElementSibling;
            }

            parts.unshift(
                cnt > 1 ? tg + "[" + pos + "]" : tg
            );

            c = c.parentElement;
            maxP--;
        }

        if (parts.length)
            r.push("//" + parts.join("/"));

        // --- Dedupe, validate, rank ---
        var seen = {},
            valid = [];

        r.forEach(function (xp) {
            if (seen[xp]) return;

            seen[xp] = 1;

            valid.push({
                xp: xp,
                count: countMatches(xp)
            });
        });

        valid.sort(function (a, b) {
            if (a.count === 1 && b.count !== 1)
                return -1;

            if (b.count === 1 && a.count !== 1)
                return 1;

            if (a.count !== b.count)
                return a.count - b.count;

            return a.xp.length - b.xp.length;
        });

        return valid.slice(0, 5);
    }

    function findLabel(el) {
        if (el.id) {
            try {
                var lbl = document.querySelector(
                    'label[for="' +
                        CSS.escape(el.id) +
                        '"]'
                );

                if (lbl) {
                    var s = lbl.querySelector("span");

                    return (
                        (s && s.textContent.trim()) ||
                        lbl.textContent.trim()
                    );
                }
            } catch (e) {}
        }

        var w = el.closest(
            "label,.slds-form-element,lightning-input,lightning-combobox,lightning-checkbox-group,lightning-radio-group,lightning-textarea,lightning-datepicker,lightning-input-field,lightning-select"
        );

        if (w) {
            var wl = w.querySelector(
                "span.slds-form-element__label,label span,legend span,label,.slds-form-element__legend"
            );

            if (wl && wl.textContent.trim())
                return wl.textContent.trim();
        }

        return (
            el.getAttribute("aria-label") ||
            el.getAttribute("data-label") ||
            ""
        );
    }

    // ---- Target resolution ----

    function findBestTarget(el, e) {
        var deep = el;

        try {
            var path =
                e.composedPath && e.composedPath();

            if (path && path.length > 0) {
                for (
                    var pi = 0;
                    pi < path.length;
                    pi++
                ) {
                    if (
                        path[pi].nodeType === 1 &&
                        path[pi].tagName
                    ) {
                        deep = path[pi];
                        break;
                    }
                }
            }
        } catch (ex) {}

        if (deep === el) {
            try {
                var fp = document.elementFromPoint(
                    e.clientX,
                    e.clientY
                );

                if (fp && fp !== el) deep = fp;
            } catch (ex) {}
        }

        var t = deep.tagName
            ? deep.tagName.toLowerCase()
            : "";

        // SVG/icon -> walk up
        if (
            t === "svg" ||
            t === "path" ||
            t === "use" ||
            t === "circle" ||
            t === "line" ||
            t === "g" ||
            t === "img" ||
            t === "i"
        ) {
            deep = walkUpToClickable(deep);

            t = deep.tagName
                ? deep.tagName.toLowerCase()
                : "";
        }

        var isKnown =
            /^(a|button|input|select|textarea|span|div|li|td|th|label|p|h[1-6]|em|strong|b)$/.test(
                t
            );

        if (!isKnown) {
            var inner = deep.querySelector(
                "a,button,span,input"
            );

            if (inner) return inner;

            if (deep.shadowRoot) {
                var si =
                    deep.shadowRoot.querySelector(
                        "a,button,span,input"
                    );

                if (si) return si;
            }
        }

        if (
            (t === "div" ||
                t === "nav" ||
                t === "li" ||
                t === "ul" ||
                t === "section" ||
                t === "header") &&
            deep.children.length > 0
        ) {
            var links = deep.querySelectorAll(
                "a,button,[role='button'],[role='menuitem'],[role='tab']"
            );

            if (links.length === 1)
                return links[0];

            if (links.length > 1) {
                var best = null,
                    bd = Infinity;

                links.forEach(function (lnk) {
                    var rect =
                        lnk.getBoundingClientRect();

                    var d = Math.sqrt(
                        Math.pow(
                            e.clientX -
                                (rect.left +
                                    rect.width / 2),
                            2
                        ) +
                            Math.pow(
                                e.clientY -
                                    (rect.top +
                                        rect.height / 2),
                                2
                            )
                    );

                    if (d < bd) {
                        bd = d;
                        best = lnk;
                    }
                });

                if (best) return best;
            }
        }

        if (!isKnown && t.indexOf("-") > 0)
            return deep;

        return deep;
    }

    // ---- Live hover highlight ----

    function onHover(e) {
        if (!on) return;

        var el = e.target;

        if (
            el.closest &&
            el.closest("#__xf_box,#__xf_toggle")
        )
            return;

        if (hoverEl && hoverEl !== el) {
            hoverEl.style.outline = hoverOutline;
        }

        hoverEl = el;
        hoverOutline = el.style.outline;

        el.style.outline = "2px dashed #4fc3f7";
    }

    function onHoverOut(e) {
        if (hoverEl) {
            hoverEl.style.outline = hoverOutline;
            hoverEl = null;
            hoverOutline = "";
        }
    }

    // ---- Popup ----

    function show(el, e) {
        hide();

        el = findBestTarget(el, e);

        var results = gen(el);

        if (!results.length) return;

        var elTag = el.tagName.toLowerCase();

        var elTxt = (el.textContent || "")
            .trim()
            .substring(0, 30);

        var elAttrs = "";

        [
            "id",
            "data-label",
            "aria-label",
            "title",
            "name",
            "class",
            "href"
        ].forEach(function (a) {
            var v = el.getAttribute(a);

            if (v && !elAttrs)
                elAttrs =
                    a +
                    "=" +
                    v.substring(0, 30);
        });

        box = document.createElement("div");

        box.id = "__xf_box";

        box.style.cssText =
            "position:fixed;z-index:999999;background:#1e1e1e;color:#d4d4d4;padding:12px 14px;border-radius:8px;font:12px monospace;max-width:680px;box-shadow:0 4px 16px rgba(0,0,0,0.5);";

        var top = e.clientY + 15,
            left = e.clientX + 10;

        if (top + 300 > window.innerHeight)
            top = e.clientY - 300;

        if (left + 500 > window.innerWidth)
            left = e.clientX - 500;

        box.style.top =
            Math.max(0, top) + "px";

        box.style.left =
            Math.max(0, left) + "px";

        var title =
            document.createElement("div");

        title.style.cssText =
            "font-weight:bold;margin-bottom:4px;color:#4fc3f7;";

        title.textContent =
            "XPath (" +
            results.length +
            ") <" +
            elTag +
            ">";

        box.appendChild(title);

        var info =
            document.createElement("div");

        info.style.cssText =
            "margin-bottom:8px;font-size:11px;color:#90a4ae;";

        info.textContent =
            (elTxt
                ? '"' + elTxt + '"'
                : "(no text)") +
            (elAttrs ? " | " + elAttrs : "");

        box.appendChild(info);

        results.forEach(function (item, i) {
            var row =
                document.createElement("div");

            row.style.cssText =
                "margin-bottom:6px;display:flex;align-items:start;gap:6px;";

            var num =
                document.createElement("span");

            num.style.cssText =
                "color:#aaa;min-width:14px;";

            num.textContent = i + 1 + ".";

            var code =
                document.createElement("code");

            code.style.cssText =
                "flex:1;word-break:break-all;cursor:pointer;" +
                (item.count === 1
                    ? "color:#a5d6a7;"
                    : "color:#ef9a9a;");

            code.textContent = item.xp;

            var badge =
                document.createElement("span");

            badge.style.cssText =
                "font-size:10px;padding:1px 5px;border-radius:3px;white-space:nowrap;" +
                (item.count === 1
                    ? "background:#2e7d32;color:#fff;"
                    : "background:#c62828;color:#fff;");

            badge.textContent =
                item.count === 1
                    ? "unique"
                    : item.count === 0
                    ? "0 hits"
                    : item.count + " hits";

            var cpBtn =
                document.createElement("button");

            cpBtn.style.cssText =
                "cursor:pointer;padding:2px 8px;font-size:10px;background:#455a64;color:#fff;border:none;border-radius:3px;white-space:nowrap;";

            cpBtn.textContent = "Copy";

            function makeCopier(xpath, elem) {
                return function (ev) {
                    ev.stopPropagation();
                    ev.preventDefault();

                    if (navigator.clipboard)
                        navigator.clipboard
                            .writeText(xpath)
                            .then(function () {
                                elem.style.color =
                                    "#4caf50";

                                setTimeout(function () {
                                    elem.style.color =
                                        "";
                                }, 600);
                            });
                };
            }

            code.onclick = makeCopier(
                item.xp,
                code
            );

            cpBtn.onclick = makeCopier(
                item.xp,
                cpBtn
            );

            row.appendChild(num);
            row.appendChild(code);
            row.appendChild(badge);
            row.appendChild(cpBtn);

            box.appendChild(row);
        });

        var isShadow = false;

        try {
            var rt =
                el.getRootNode &&
                el.getRootNode();

            if (
                (rt &&
                    rt !== document &&
                    rt.host) ||
                el.shadowRoot
            )
                isShadow = true;
        } catch (ex) {}

        if (isShadow) {
            var warn =
                document.createElement("div");

            warn.style.cssText =
                "margin-top:6px;padding:6px 8px;background:#4a2800;border-radius:4px;color:#ffb74d;font-size:11px;";

            warn.textContent =
                "Shadow DOM detected. XPaths target the host element.";

            box.appendChild(warn);
        }

        var hint =
            document.createElement("div");

        hint.style.cssText =
            "margin-top:6px;font-size:10px;color:#777;";

        hint.textContent =
            "Click XPath to copy | Green=unique | Red=multiple | Ctrl+Shift+X to toggle";

        box.appendChild(hint);

        document.body.appendChild(box);

        el.style.outline =
            "3px solid #4fc3f7";

        setTimeout(function () {
            el.style.outline = "";
        }, 2000);
    }

    function hide() {
        if (box && box.parentNode)
            box.parentNode.removeChild(box);

        box = null;
    }

    function handler(e) {
        if (
            e.target.closest &&
            e.target.closest("#__xf_box")
        )
            return;

        if (e.target.id === "__xf_toggle")
            return;

        e.preventDefault();
        e.stopPropagation();

        show(e.target, e);
    }

    function toggle() {
        on = !on;

        var btn =
            document.getElementById(
                "__xf_toggle"
            );

        if (on) {
            document.addEventListener(
                "click",
                handler,
                true
            );

            document.addEventListener(
                "mouseover",
                onHover,
                true
            );

            document.addEventListener(
                "mouseout",
                onHoverOut,
                true
            );

            btn.textContent =
                "XPath: ON (Ctrl+Shift+X)";

            btn.style.background =
                "#4caf50";
        } else {
            document.removeEventListener(
                "click",
                handler,
                true
            );

            document.removeEventListener(
                "mouseover",
                onHover,
                true
            );

            document.removeEventListener(
                "mouseout",
                onHoverOut,
                true
            );

            hide();

            if (hoverEl) {
                hoverEl.style.outline =
                    hoverOutline;

                hoverEl = null;
            }

            btn.textContent =
                "XPath: OFF (Ctrl+Shift+X)";

            btn.style.background =
                "#f44336";
        }
    }

    var btn = document.createElement("button");

    btn.id = "__xf_toggle";

    btn.textContent =
        "XPath: OFF (Ctrl+Shift+X)";

    btn.style.cssText =
        "position:fixed;bottom:12px;right:12px;z-index:999998;padding:8px 16px;font:13px sans-serif;font-weight:bold;color:#fff;background:#f44336;border:none;border-radius:8px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,0.3);";

    btn.onclick = toggle;

    document.body.appendChild(btn);

    document.addEventListener(
        "keydown",
        function (e) {
            if (
                (e.ctrlKey || e.metaKey) &&
                e.shiftKey &&
                (e.key === "X" || e.key === "x")
            ) {
                e.preventDefault();
                toggle();
            }
        }
    );
})();