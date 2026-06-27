(function () {
  var el = $x("(//th[@data-label='Contact Name']//records-hoverable-link)[1]")[0];
  if (!el) { console.error("not found"); return; }
  el.scrollIntoView({ block: "center" });
  var a = el.querySelector("a") || el;   // inner anchor if present
  ["pointerover","mouseover","pointerdown","mousedown","focus","pointerup","mouseup","click"]
    .forEach(function (t) {
      a.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: window }));
    });
  console.log("Fired full click sequence on:", a.tagName);
})();
