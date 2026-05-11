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

        if (s.indexOf("'") === -1)
            return "'" + s + "'";

        if (s.indexOf('"') === -1)
            return '"' + s + '"';

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
            var t = cur.tagName
                ? cur.tagName.toLowerCase()
                : "";

            if (
                t === "button" ||
                t === "a" ||
                cur.getAttribute("role") === "button" ||
                cur.getAttribute("role") === "menuitem" ||
                cur.getAttribute("role") === "tab"
            ) {
                return cur;
            }

            if (
                t === "div" &&
                cur.getAttribute("onclick")
            ) {
                return cur;
            }

            cur = cur.parentElement;
            depth++;
        }

        return el;
    }

    function gen(rawEl) {
        var el = rawEl;

        if (!el || !el.tagName)
            return [];

        var t = el.tagName.toLowerCase();

        // SVG/icon/path/img → clickable parent
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
            t = el.tagName
                ? el.tagName.toLowerCase()
                : "";
        }

        var r = [];

        var fullTxt = "";

        try {
            fullTxt = (el.textContent || "").trim();
        } catch (e) {}

        var txt =
            fullTxt.length <= 50
                ? fullTxt
                : "";

        var ownTxt = getOwnText(el);

        // --- Lightning custom elements ---
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

                if (v && v.length < 80) {
                    r.push(
                        "//" +
                            t +
                            "[@" +
                            a +
                            "=" +
                            wq(v) +
                            "]"
                    );
                }
            });

            if (
                el.className &&
                typeof el.className === "string"
            ) {
                var cls = el.className
                    .trim()
                    .split(/\s+/);

                for (
                    var ci = 0;
                    ci < cls.length;
                    ci++
                ) {
                    if (
                        cls[ci].length > 3 &&
                        !/^ng-|^is-|^has-/.test(
                            cls[ci]
                        )
                    ) {
                        try {
                            if (
                                document.querySelectorAll(
                                    t +
                                        "." +
                                        CSS.escape(
                                            cls[ci]
                                        )
                                ).length === 1
                            ) {
                                r.push(
                                    "//" +
                                        t +
                                        "[contains(@class," +
                                        wq(
                                            cls[ci]
                                        ) +
                                        ")]"
                                );

                                break;
                            }
                        } catch (ex) {}
                    }
                }
            }

            if (
                el.id &&
                !/\d{4,}/.test(el.id)
            ) {
                r.push(
                    "//" +
                        t +
                        "[@id='" +
                        el.id +
                        "']"
                );
            }

            try {
                if (
                    document.querySelectorAll(t)
                        .length === 1
                ) {
                    r.push("//" + t);
                }
            } catch (ex) {}
        }

        // --- Shadow DOM host attrs ---
        try {
            var root =
                el.getRootNode &&
                el.getRootNode();

            if (
                root &&
                root !== document &&
                root.host
            ) {
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

                    if (hv) {
                        r.push(
                            "//" +
                                ht +
                                "[@" +
                                a +
                                "=" +
                                wq(hv) +
                                "]"
                        );
                    }
                });

                if (
                    h.id &&
                    !/\d{4,}/.test(h.id)
                ) {
                    r.push(
                        "//" +
                            ht +
                            "[@id='" +
                            h.id +
                            "']"
                    );
                }
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

                if (sv) {
                    r.push(
                        "//" +
                            t +
                            "[@" +
                            a +
                            "=" +
                            wq(sv) +
                            "]"
                    );
                }
            });
        }

        // --- Button ---
        if (t === "button") {
            var bsTxt =
                getDirectSpanText(el);

            if (bsTxt) {
                r.push(
                    "//span[text()=" +
                        wq(bsTxt) +
                        "]/parent::button"
                );

                r.push(
                    "//button[.//span[contains(text()," +
                        wq(bsTxt) +
                        ")]]"
                );
            }

            if (el.getAttribute("title")) {
                r.push(
                    "//button[@title=" +
                        wq(
                            el.getAttribute(
                                "title"
                            )
                        ) +
                        "]"
                );
            }

            if (txt) {
                r.push(
                    "//button[contains(., " +
                        wq(txt) +
                        ")]"
                );

                if (!bsTxt) {
                    r.push(
                        "//button[normalize-space()=" +
                            wq(txt) +
                            "]"
                    );
                }
            }

            if (
                bsTxt &&
                el.getAttribute("title")
            ) {
                r.push(
                    "//button[@title=" +
                        wq(
                            el.getAttribute(
                                "title"
                            )
                        ) +
                        " and .//span[text()=" +
                        wq(bsTxt) +
                        "]]"
                );
            }
        }

        // --- Link (improved) ---
        if (t === "a") {
            var adl =
                el.getAttribute(
                    "data-label"
                );

            if (txt && adl) {
                r.push(
                    "//a[text()=" +
                        wq(txt) +
                        "][@data-label=" +
                        wq(adl) +
                        "]"
                );
            }

            if (txt) {
                r.push(
                    "//a[text()=" +
                        wq(txt) +
                        "]"
                );

                r.push(
                    "//a[contains(text()," +
                        wq(txt) +
                        ")]"
                );

                r.push(
                    "//a[normalize-space()=" +
                        wq(txt) +
                        "]"
                );
            }

            if (el.getAttribute("title")) {
                r.push(
                    "//a[@title=" +
                        wq(
                            el.getAttribute(
                                "title"
                            )
                        ) +
                        "]"
                );
            }

            if (el.getAttribute("href")) {
                var href =
                    el.getAttribute("href");

                if (
                    href !== "#" &&
                    href !==
                        "javascript:void(0)"
                ) {
                    if (href.length < 60) {
                        r.push(
                            "//a[@href=" +
                                wq(href) +
                                "]"
                        );
                    }

                    var hrefParts =
                        href
                            .split("/")
                            .filter(function (
                                p
                            ) {
                                return (
                                    p &&
                                    p.length >
                                        2
                                );
                            });

                    if (
                        hrefParts.length > 0
                    ) {
                        r.push(
                            "//a[contains(@href," +
                                wq(
                                    hrefParts[
                                        hrefParts.length -
                                            1
                                    ]
                                ) +
                                ")]"
                        );
                    }
                }
            }

            var aSpan =
                getDirectSpanText(el);

            if (aSpan) {
                r.push(
                    "//span[text()=" +
                        wq(aSpan) +
                        "]/parent::a"
                );
            }

            var navParent =
                el.closest(
                    "nav, ul, [role='navigation'], [role='menubar'], [role='tablist']"
                );

            if (navParent) {
                var navAttr =
                    navParent.getAttribute(
                        "aria-label"
                    ) ||
                    navParent.getAttribute(
                        "data-label"
                    ) ||
                    navParent.getAttribute(
                        "role"
                    );

                if (navAttr && txt) {
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
        }

        // --- Span → parent ---
        if (t === "span") {
            var sTxt =
                ownTxt || txt;

            if (
                sTxt &&
                sTxt.length <= 50
            ) {
                var par =
                        el.parentElement,
                    pt = par
                        ? par.tagName.toLowerCase()
                        : "";

                if (pt === "button") {
                    r.push(
                        "//span[text()=" +
                            wq(sTxt) +
                            "]/parent::button"
                    );

                    r.push(
                        "//span[contains(text()," +
                            wq(sTxt) +
                            ")]/parent::button"
                    );
                } else if (
                    pt === "a"
                ) {
                    r.push(
                        "//span[text()=" +
                            wq(sTxt) +
                            "]/parent::a"
                    );

                    r.push(
                        "//span[contains(text()," +
                            wq(sTxt) +
                            ")]/parent::a"
                    );
                } else {
                    r.push(
                        "//span[text()=" +
                            wq(sTxt) +
                            "]"
                    );

                    r.push(
                        "//span[contains(text()," +
                            wq(sTxt) +
                            ")]"
                    );
                }
            }
        }

        return r.filter(function (
            v,
            i,
            a
        ) {
            return (
                v &&
                a.indexOf(v) === i
            );
        });
    }

    function onHover(e) {
        if (!on) return;

        if (
            hoverEl &&
            hoverEl !== e.target
        ) {
            hoverEl.style.outline =
                hoverOutline;
        }

        hoverEl = e.target;
        hoverOutline =
            hoverEl.style.outline;

        hoverEl.style.outline =
            "2px solid #4fc3f7";
    }

    function onHoverOut() {
        if (
            hoverEl
        ) {
            hoverEl.style.outline =
                hoverOutline;

            hoverEl = null;
        }
    }

    function show(el, ev) {
        hide();

        var results = gen(el);

        box =
            document.createElement("div");

        box.id = "__xf_box";

        box.style.cssText =
            "position:fixed;top:" +
            (ev.clientY + 12) +
            "px;left:" +
            (ev.clientX + 12) +
            "px;z-index:999999;background:#111;color:#fff;padding:10px;max-width:700px;max-height:420px;overflow:auto;font:12px monospace;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,0.5);";

        results.forEach(function (
            item,
            i
        ) {
            var row =
                document.createElement(
                    "div"
                );

            row.style.cssText =
                "display:flex;gap:6px;align-items:center;margin-bottom:6px;";

            var num =
                document.createElement(
                    "span"
                );

            num.textContent =
                i + 1 + ".";

            num.style.cssText =
                "color:#aaa;min-width:20px;";

            var code =
                document.createElement(
                    "code"
                );

            code.textContent = item;

            var c =
                countMatches(item);

            code.style.cssText =
                "flex:1;cursor:pointer;word-break:break-all;padding:2px 4px;border-radius:3px;" +
                (c === 1
                    ? "background:#2e7d32;color:#fff;"
                    : "background:#c62828;color:#fff;");

            var badge =
                document.createElement(
                    "span"
                );

            badge.textContent =
                c === 1
                    ? "unique"
                    : c + " matches";

            badge.style.cssText =
                "font-size:10px;padding:2px 6px;border-radius:10px;background:#333;color:#fff;white-space:nowrap;";

            var cpBtn =
                document.createElement(
                    "button"
                );

            cpBtn.style.cssText =
                "cursor:pointer;padding:2px 8px;font-size:10px;background:#455a64;color:#fff;border:none;border-radius:3px;white-space:nowrap;";

            cpBtn.textContent =
                "Copy";

            function makeCopier(
                xpath,
                elem
            ) {
                return function (ev) {
                    ev.stopPropagation();
                    ev.preventDefault();

                    if (
                        navigator.clipboard
                    ) {
                        navigator.clipboard
                            .writeText(
                                xpath
                            )
                            .then(function () {
                                elem.style.color =
                                    "#4caf50";

                                setTimeout(
                                    function () {
                                        elem.style.color =
                                            "";
                                    },
                                    600
                                );
                            });
                    }
                };
            }

            code.onclick =
                makeCopier(
                    item,
                    code
                );

            cpBtn.onclick =
                makeCopier(
                    item,
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
            ) {
                isShadow = true;
            }
        } catch (ex) {}

        if (isShadow) {
            var warn =
                document.createElement(
                    "div"
                );

            warn.style.cssText =
                "margin-top:6px;padding:6px 8px;background:#4a2800;border-radius:4px;color:#ffb74d;font-size:11px;";

            warn.textContent =
                "Shadow DOM detected. XPaths target the host element.";

            box.appendChild(warn);
        }

        var hint =
            document.createElement(
                "div"
            );

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
        if (
            box &&
            box.parentNode
        ) {
            box.parentNode.removeChild(
                box
            );
        }

        box = null;
    }

    function handler(e) {
        if (
            e.target.closest &&
            e.target.closest(
                "#__xf_box"
            )
        )
            return;

        if (
            e.target.id ===
            "__xf_toggle"
        )
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

    var btn =
        document.createElement(
            "button"
        );

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
                (e.ctrlKey ||
                    e.metaKey) &&
                e.shiftKey &&
                (e.key === "X" ||
                    e.key === "x")
            ) {
                e.preventDefault();
                toggle();
            }
        }
    );
})();