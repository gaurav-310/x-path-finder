(function () {
  var label = "Opportunity Record Type";

  function deepAll(root, out) {
    out = out || [];
    var kids = root.querySelectorAll ? root.querySelectorAll("*") : [];
    for (var i = 0; i < kids.length; i++) {
      var k = kids[i];
      out.push(k);
      if (k.shadowRoot) deepAll(k.shadowRoot, out);
    }
    return out;
  }
  function cls(e){ return (e.getAttribute && e.getAttribute("class")) || ""; }

  var all = deepAll(document);
  console.log("deep nodes scanned:", all.length);

  // node whose trimmed text is exactly the label
  var lbl = all.find(function (e) { return (e.textContent || "").replace(/\s+/g," ").trim() === label; });
  if (!lbl) {
    var loose = all.filter(function (e) { return (e.textContent || "").includes(label) && e.children.length <= 2; });
    lbl = loose[0];
  }
  if (!lbl) { console.log("Label NOT found even across shadow — could be an iframe."); return; }
  console.log("label node:", lbl.tagName.toLowerCase());

  // walk up (across shadow) to the field container
  function up(el){ return el.parentElement || (el.getRootNode && el.getRootNode().host) || null; }
  var item = lbl, d = 0;
  while (item && d < 8) {
    var t = item.tagName.toLowerCase();
    if (t === "records-record-layout-item" || /slds-form-element/.test(cls(item))) break;
    item = up(item); d++;
  }
  console.log("field container:", item ? item.tagName.toLowerCase() : "none");

  if (item) {
    var val = deepAll(item).find(function (e) {
      var t = e.tagName.toLowerCase();
      return /^lightning-formatted-/.test(t) || /slds-form-element__static/.test(cls(e)) || t === "records-record-type";
    });
    console.log("VALUE element:", val ? val.tagName.toLowerCase() : "?",
                "| VALUE TEXT:", val ? val.textContent.trim() : "(item text minus label)");
    console.log("ITEM HTML:", item.outerHTML.replace(/\s+/g," ").substring(0,500));
  }
})();
