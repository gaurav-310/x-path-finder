(function () {
  var label = "Opportunity Record Type";

  function deepAll(root, out){ out=out||[]; var k=root.querySelectorAll?root.querySelectorAll("*"):[];
    for(var i=0;i<k.length;i++){ out.push(k[i]); if(k[i].shadowRoot) deepAll(k[i].shadowRoot,out);} return out; }
  function deepText(node){ var t=""; (function w(n){ if(n.nodeType===3){ t+=n.textContent; return; }
    if(n.shadowRoot) w(n.shadowRoot); var c=n.childNodes||[]; for(var i=0;i<c.length;i++) w(c[i]); })(node);
    return t.replace(/\s+/g," ").trim(); }

  var item = deepAll(document).find(function(e){
    return e.tagName && e.tagName.toLowerCase()==="records-record-layout-item" && e.getAttribute("field-label")===label; });
  if(!item){ console.log("item NOT found by field-label"); return; }

  var val = deepAll(item).find(function(e){ var t=e.tagName.toLowerCase();
    var c=(e.getAttribute&&e.getAttribute("class"))||""; return /slds-form-element__static/.test(c)||/^lightning-formatted-/.test(t); });

  console.log("VALUE (targeted):", val ? deepText(val) : "(none)");
  console.log("VALUE (whole item deepText):", deepText(item));
})();
