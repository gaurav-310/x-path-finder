(function () {
  var col = "Opportunity Name";   // <-- EDIT: the column header text
  var row = 1;

  function xp1(p){return document.evaluate(p,document,null,XPathResult.FIRST_ORDERED_NODE_TYPE,null).singleNodeValue;}
  function xpN(p){var s=document.evaluate(p,document,null,XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,null);var a=[];for(var i=0;i<s.snapshotLength;i++)a.push(s.snapshotItem(i));return a;}

  // 1. all distinct data-labels on the page
  var labels=[...new Set([...document.querySelectorAll('[data-label]')].map(function(e){return e.getAttribute('data-label');}))];
  console.log("ALL data-labels:", labels);

  // 2. match exactly, else case/space-insensitive
  var use = labels.find(function(l){return l===col;}) ||
            labels.find(function(l){return l && l.trim().toLowerCase()===col.trim().toLowerCase();});
  console.log("USING data-label:", JSON.stringify(use));
  if(!use){ console.warn("No matching column — copy the exact one from ALL data-labels above into col."); return; }

  // 3. inspect the first cell of that column
  var cell = xpN("//*[@data-label='"+use+"']")[0];
  if(cell){
    var link = cell.querySelector("a, records-hoverable-link, lightning-formatted-url, button, [role='button']");
    console.log("LINK element inside cell:", link?link.tagName.toLowerCase():"NONE FOUND");
    console.log("CELL HTML:", cell.outerHTML.replace(/\s+/g,' ').substring(0,300));
  } else { console.log("No cell matched that data-label."); }

  // 4. build + test the row XPath
  var xpath = "(//*[(self::td or self::th) and @data-label='"+use+"']//*[self::a or self::records-hoverable-link or self::lightning-formatted-url])["+row+"]";
  var el = xp1(xpath);
  console.log("XPATH:", xpath);
  console.log("ROW "+row+" found:", !!el, el?("-> "+el.textContent.trim()):"");
})();













(function () {
  var labels=[...new Set([...document.querySelectorAll('[data-label]')].map(e=>e.getAttribute('data-label')))];
  console.log("ALL data-labels:", labels);
  var cell = document.evaluate("//*[@data-label='Opportunity Name']", document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
  if (cell) {
    var link = cell.querySelector("a, records-hoverable-link, lightning-formatted-url, button, [role='button']");
    console.log("LINK tag:", link ? link.tagName.toLowerCase() : "NONE");
    console.log("CELL HTML:", cell.outerHTML.replace(/\s+/g,' ').substring(0,300));
  } else {
    console.log("No cell with data-label='Opportunity Name' — pick the exact one from ALL data-labels above.");
  }
})();
