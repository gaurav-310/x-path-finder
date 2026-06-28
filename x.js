(function () {
  var colName = "Opportunity Name";

  function txt(e){ return (e.textContent||"").replace(/\s+/g,' ').trim(); }
  function attrDump(e){ var o={}; if(e&&e.attributes) for(var i=0;i<e.attributes.length;i++){var a=e.attributes[i]; if(/^(class|role|scope|data-|aria-label|aria-colindex)/.test(a.name)) o[a.name]=(a.value||'').substring(0,50);} return o; }

  var table = document.querySelector("table[role='grid'],[role='treegrid'],table.slds-table,[role='grid'],table");
  console.log("TABLE:", table?table.tagName.toLowerCase():"NONE", table?("| class="+(table.className||'').substring(0,70)):"");
  if(!table){ console.warn("No table/grid found"); return; }

  // headers
  var heads = table.querySelectorAll("thead th, tr:first-child th, [role='columnheader']");
  console.log("HEADERS:", [...heads].map(function(h,i){return i+":'"+txt(h).replace(/^Sort by:?/i,'').substring(0,30)+"'";}));

  // column index for our column
  var idx = -1;
  [...heads].forEach(function(h,i){ if(txt(h).replace(/^Sort by:?/i,'').trim().toLowerCase()===colName.toLowerCase()) idx=i; });
  console.log("COLUMN INDEX (0-based):", idx);
  if(idx<0){ console.warn("Not found — copy exact text from HEADERS."); return; }

  console.log("HEADER["+idx+"] attrs:", attrDump(heads[idx]));

  // first data row + the cell at that index
  var rows = table.querySelectorAll("tbody tr, [role='row']");
  var dataRow=null;
  for(var i=0;i<rows.length;i++){ if(rows[i].querySelector("td,[role='gridcell']")){ dataRow=rows[i]; break; } }
  if(dataRow){
    var cells = dataRow.querySelectorAll("th,td,[role='gridcell'],[role='rowheader']");
    var cell = cells[idx];
    console.log("CELL["+idx+"] tag:", cell?cell.tagName.toLowerCase():"NONE", "| attrs:", cell?attrDump(cell):"");
    if(cell){
      var link = cell.querySelector("a, records-hoverable-link, lightning-formatted-url, button, [role='button']");
      console.log("LINK tag:", link?link.tagName.toLowerCase():"NONE", "| LINK attrs:", link?attrDump(link):"");
      console.log("CELL HTML:", cell.outerHTML.replace(/\s+/g,' ').substring(0,350));
    }
  }
})();
