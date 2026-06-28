var label = "Opportunity Record Type";
var item = [...document.querySelectorAll("records-record-layout-item, .slds-form-element")]
  .find(function(it){ return it.textContent.replace(/\s+/g,' ').includes(label); });
console.log(item ? item.outerHTML.replace(/\s+/g,' ').substring(0,700) : "not found");
