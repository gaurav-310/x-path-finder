(function () {
  var el = $x("(//th[@data-label='Contact Name']//records-hoverable-link)[1]")[0];
  if (!el) { console.error("link element not found"); return; }

  // deep search for the inner <a>, crossing shadow roots
  function deepFindA(node) {
    if (node.tagName && node.tagName.toLowerCase() === "a") return node;
    if (node.shadowRoot) { var s = deepFindA(node.shadowRoot); if (s) return s; }
    var kids = node.children ? Array.prototype.slice.call(node.children) : [];
    for (var i = 0; i < kids.length; i++) { var r = deepFindA(kids[i]); if (r) return r; }
    return null;
  }

  el.scrollIntoView({ block: "center" });
  el.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));  // hoverable links render on hover

  setTimeout(function () {
    var a = deepFindA(el);
    console.log("anchor found:", !!a, "| href:", a && a.href);
    if (a) {
      ["pointerover","mouseover","pointerdown","mousedown","mouseup","click"].forEach(function (t) {
        a.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: window }));
      });
      console.log("Clicked the anchor. If it still didn't navigate, run:  window.location.href = " + JSON.stringify(a.href));
    } else {
      console.warn("No <a> inside. The element text is:", el.textContent.trim());
    }
  }, 300);
})();
