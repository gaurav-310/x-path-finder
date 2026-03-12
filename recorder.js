/**
 * Salesforce XPath Recorder v4 (Final)
 * XML: <screen> -> <object objectId=""> -> <objectProperty>xpath=...</objectProperty>
 * Gherkin: And I click "objectId" on "ScreenName" screen
 * Prefixes: btn_, lnk_, input_, rdo_, chk_, dd_, txt_
 */
(function(){
"use strict";
if(window.__xpathRecorderActive){console.warn("XPath Recorder already loaded.");return;}
var steps=[],isRecording=false,stepIndex=0,lastFocusedEl=null,lastFocusedValue="",screenName="RecordedScreen",usedObjIds={};
var PID="xr-panel",OID="xr-output",BID="xr-backdrop";
var STORE_KEY="__xr_steps",STORE_STATE="__xr_state";

function saveState(){
  try{sessionStorage.setItem(STORE_KEY,JSON.stringify(steps));
    sessionStorage.setItem(STORE_STATE,JSON.stringify({recording:isRecording,stepIndex:stepIndex,screenName:screenName,usedObjIds:usedObjIds}));
  }catch(e){}}

function loadState(){
  try{var s=sessionStorage.getItem(STORE_KEY),st=sessionStorage.getItem(STORE_STATE);
    if(s&&st){steps=JSON.parse(s);var state=JSON.parse(st);
      stepIndex=state.stepIndex||0;screenName=state.screenName||"RecordedScreen";
      usedObjIds=state.usedObjIds||{};return state.recording===true;}
  }catch(e){}return false;}

function clearState(){try{sessionStorage.removeItem(STORE_KEY);sessionStorage.removeItem(STORE_STATE);}catch(e){}}

function isUI(el){while(el){if(el.id===PID||el.id===OID||el.id===BID)return true;el=el.parentElement;}return false;}
function stag(el){return(el&&el.tagName)?el.tagName.toLowerCase():"";}

function wq(s){
  if(s==null)return"''";s=String(s);
  if(s.indexOf("'")===-1)return"'"+s+"'";
  if(s.indexOf('"')===-1)return'"'+s+'"';
  return"concat('"+s.replace(/'/g,"',\"'\",'")+"')";
}

function findClickParent(el){
  var t=stag(el);
  if(t==="span"||t==="div"||t==="svg"||t==="path"||t==="img"||t==="i"){
    var c=el.parentElement,d=0;
    while(c&&d<4){var p=stag(c);
      if(p==="button"||p==="a"||c.getAttribute("role")==="button"||c.getAttribute("role")==="menuitem")return c;
      c=c.parentElement;d++;}
  }return el;
}

function getSfXPath(el){
  if(!el||!el.ownerDocument)return"";
  var t=stag(el);
  if(t==="button"){
    var bs=el.querySelector(":scope > span, :scope > div > span");
    if(bs&&bs.textContent.trim())return"//span[text()="+wq(bs.textContent.trim())+"]/parent::button";
    if(el.getAttribute("title"))return"//button[@title="+wq(el.getAttribute("title"))+"]";
    var bt=(el.textContent||"").trim();
    if(bt&&bt.length<50)return"//button[normalize-space()="+wq(bt)+"]";
  }
  if(t==="a"){
    var at=(el.textContent||"").trim(),adl=el.getAttribute("data-label");
    if(at&&adl)return"//a[text()="+wq(at)+"][@data-label="+wq(adl)+"]";
    if(el.getAttribute("title"))return"//a[@title="+wq(el.getAttribute("title"))+"]";
    if(at&&at.length<50){var sa=el.querySelector("span");
      if(sa&&sa.textContent.trim()===at)return"//span[text()="+wq(at)+"]/parent::a";
      return"//a[text()="+wq(at)+"]";}
  }
  if(t==="span"){var st=(el.textContent||"").trim();
    if(st&&st.length<50){var sp=el.parentElement;if(sp){var pt=stag(sp);
      if(pt==="button")return"//span[text()="+wq(st)+"]/parent::button";
      if(pt==="a")return"//span[text()="+wq(st)+"]/parent::a";
      return"//span[text()="+wq(st)+"]";}}}
  if(t==="div"){var dt=(el.textContent||"").trim();
    if(dt&&dt.length<50&&el.children.length===0){var dp=el.parentElement;
      if(dp&&stag(dp)==="a")return"//div[text()="+wq(dt)+"]/parent::a";
      return"//div[text()="+wq(dt)+"]";}}
  if(t==="input"&&el.type==="radio"){var rl=findLabel(el);if(rl)return"//span[text()="+wq(rl)+"]/ancestor::label//input[@type='radio']";}
  if(t==="input"&&el.type==="checkbox"){var cl=findLabel(el);if(cl)return"//span[text()="+wq(cl)+"]/ancestor::label//input[@type='checkbox']";}
  if(t==="input"||t==="textarea"){
    var dw=el.closest("[data-label]");if(dw)return"//*[@data-label="+wq(dw.getAttribute("data-label"))+"]//" +t;
    var aw=el.closest("[aria-label]");if(aw&&aw!==el)return"//*[@aria-label="+wq(aw.getAttribute("aria-label"))+"]//" +t;
    if(el.getAttribute("placeholder"))return"//"+t+"[@placeholder="+wq(el.getAttribute("placeholder"))+"]";
    if(el.getAttribute("name"))return"//"+t+"[@name="+wq(el.getAttribute("name"))+"]";
    if(el.getAttribute("aria-label"))return"//"+t+"[@aria-label="+wq(el.getAttribute("aria-label"))+"]";
  }
  if(t==="select"){if(el.getAttribute("name"))return"//select[@name="+wq(el.getAttribute("name"))+"]";var sl=findLabel(el);if(sl)return"//select[@aria-label="+wq(sl)+"]";}
  if(el.getAttribute("data-id"))return"//*[@data-id="+wq(el.getAttribute("data-id"))+"]";
  if(el.getAttribute("data-name"))return"//*[@data-name="+wq(el.getAttribute("data-name"))+"]";
  if(el.getAttribute("aria-label"))return"//*[@aria-label="+wq(el.getAttribute("aria-label"))+"]";
  if(el.id&&/^[a-zA-Z][\w-]*$/.test(el.id))return"//*[@id='"+el.id+"']";
  if(el.getAttribute("title"))return"//*[@title="+wq(el.getAttribute("title"))+"]";
  return posXPath(el);
}

function posXPath(el){
  var parts=[],c=el;
  while(c&&c.nodeType===1){var t=stag(c);if(!t)break;
    if(c.id&&/^[a-zA-Z][\w-]*$/.test(c.id)){parts.unshift(t+"[@id='"+c.id+"']");break;}
    var s=c,cnt=0,pos=0;while(s){if(s.nodeType===1&&stag(s)===t){cnt++;if(s===c)pos=cnt;}s=s.previousElementSibling;}
    parts.unshift(cnt>1?t+"["+pos+"]":t);c=c.parentElement;}
  return parts.length?"//"+parts.join("/"):"//*";
}

function findLabel(el){
  if(el.id){try{var l=document.querySelector('label[for="'+CSS.escape(el.id)+'"]');
    if(l){var s=l.querySelector("span");return(s&&s.textContent.trim())||l.textContent.trim();}}catch(e){}}
  var w=el.closest("label,.slds-form-element,lightning-input,lightning-combobox,lightning-checkbox-group,lightning-radio-group,lightning-textarea,lightning-datepicker,lightning-input-field");
  if(w){var wl=w.querySelector("span.slds-form-element__label,label span,legend span,label");if(wl&&wl.textContent.trim())return wl.textContent.trim();}
  return el.getAttribute("aria-label")||el.getAttribute("data-label")||"";
}

function fieldLabel(el){return el.getAttribute("data-label")||el.getAttribute("aria-label")||el.getAttribute("placeholder")||el.getAttribute("title")||findLabel(el)||el.getAttribute("name")||stag(el);}

function clickDesc(el){
  var t=stag(el);
  if(t==="button"){var s=el.querySelector("span");if(s&&s.textContent.trim())return s.textContent.trim();return el.getAttribute("title")||(el.textContent||"").trim()||"button";}
  if(t==="a")return el.getAttribute("title")||(el.textContent||"").trim()||"link";
  if(t==="span"||t==="div"){var x=(el.textContent||"").trim();if(x&&x.length<50)return x;}
  return el.getAttribute("aria-label")||el.getAttribute("title")||(el.textContent||"").trim().substring(0,40)||t;
}

function makeObjId(action,el,desc){
  var t=stag(el),pfx="el_";
  if(action==="click"||action==="hover_click"){pfx=t==="a"?"lnk_":"btn_";}
  else if(action==="submit")pfx="btn_";
  else if(action==="fill")pfx=(t==="textarea")?"txt_":"input_";
  else if(action==="select")pfx="dd_";
  else if(action==="check")pfx=(t==="input"&&el.type==="radio")?"rdo_":"chk_";
  var base=(desc||"Element").replace(/[^a-zA-Z0-9]/g,"").substring(0,30);
  if(!base)base="Element";
  var id=pfx+base,xp=getSfXPath(el);
  if(usedObjIds[id]&&usedObjIds[id]!==xp){var i=2;while(usedObjIds[id+i])i++;id=id+i;}
  usedObjIds[id]=xp;return id;
}

function inputType(el){var t=stag(el);if(!t)return"other";if(t==="select")return"select";if(t==="textarea")return"textarea";
  if(t==="input"){var tp=(el.getAttribute("type")||"text").toLowerCase();if(tp==="checkbox")return"checkbox";if(tp==="radio")return"radio";if(tp==="date"||tp==="datetime-local")return"date";return"text";}
  if(el.getAttribute("contenteditable")==="true")return"textarea";return"other";}

function addStep(action,rawEl,value){
  if(!rawEl)return;
  var el=(action==="click"||action==="submit"||action==="hover_click")?findClickParent(rawEl):rawEl;
  stepIndex++;
  var xp=getSfXPath(el),isClk=action==="click"||action==="submit"||action==="hover_click"||action==="key";
  var desc=isClk?clickDesc(el):fieldLabel(el);
  var oid=makeObjId(action,el,desc);
  steps.push({n:stepIndex,action:action,desc:desc,objectId:oid,xpath:xp,tag:stag(el),inputType:inputType(el),value:value||""});
  console.log("[Rec] "+stepIndex+": "+action+(value?' ="'+value+'"':"")+"|"+oid+"|"+xp);
  updateCount();flash(el);saveState();
}

function flash(el){try{var o=el.style.outline,b=el.style.backgroundColor;el.style.outline="3px solid #f44336";el.style.backgroundColor="rgba(244,67,54,0.15)";setTimeout(function(){el.style.outline=o;el.style.backgroundColor=b;},400);}catch(e){}}
function updateCount(){var c=document.getElementById("xr-cnt");if(c)c.textContent="Steps: "+steps.length;}
function flushInput(){if(!lastFocusedEl)return;var v=lastFocusedEl.value||"";if(v!==lastFocusedValue&&v!==""){var t=inputType(lastFocusedEl);if(t!=="checkbox"&&t!=="radio")addStep("fill",lastFocusedEl,v);}lastFocusedEl=null;lastFocusedValue="";}
function undoStep(){if(steps.length>0){var r=steps.pop();stepIndex--;console.log("[Rec] Undo: "+r.objectId);updateCount();}}

function inModal(el){return!!(el.closest(".slds-modal,[role='dialog'],[role='alertdialog'],.uiModal,.forceModalContainer"));}
function isSubmit(el){var t=stag(el);if(t==="input"&&el.type==="submit")return true;if(t==="button"&&el.type==="submit")return true;
  var txt=(el.textContent||"").trim().toLowerCase();return/^(submit|save|ok|confirm|yes|apply|done)$/.test(txt)&&inModal(el);}
function needsHover(el){return!!(el.closest("[role='menu'],[role='menubar'],[role='listbox'],.slds-dropdown,.slds-popover"));}
function detectAction(el){if(isSubmit(el))return"submit";if(needsHover(el))return"hover_click";return"click";}

function onClick(e){if(!isRecording||isUI(e.target))return;
  var el=e.target,t=stag(el);
  if(t==="input"&&(el.type==="checkbox"||el.type==="radio")){e.preventDefault();addStep("check",el,(!el.checked)?"true":"false");return;}
  flushInput();
  if(t==="option"){var s=el.closest("select");if(s){addStep("select",s,el.textContent.trim());return;}}
  addStep(detectAction(el),el);
  saveState();
  var linkEl=el.closest("a");
  if(linkEl&&linkEl.getAttribute("target")==="_blank"){e.preventDefault();linkEl.removeAttribute("target");linkEl.click();}
}

function onKey(e){if(!isRecording||isUI(e.target))return;var k=e.key;
  if(k==="Enter"||k==="Tab"||k==="Escape"){if(k!=="Tab")flushInput();addStep("key",e.target,k.toUpperCase());}}

function onFocus(e){if(!isRecording||isUI(e.target))return;var el=e.target,t=stag(el);
  if(t==="input"||t==="textarea"||t==="select"||el.getAttribute("contenteditable")==="true"){flushInput();lastFocusedEl=el;lastFocusedValue=el.value||"";}}

function onChange(e){if(!isRecording||isUI(e.target))return;var el=e.target,t=stag(el);
  if(t==="select"){var o=el.options[el.selectedIndex];addStep("select",el,o?o.textContent.trim():el.value);lastFocusedEl=null;return;}
  if(t==="input"&&(el.type==="checkbox"||el.type==="radio")){addStep("check",el,el.checked?"true":"false");return;}
  if((t==="input"||t==="textarea")&&el.value&&el.value!==lastFocusedValue){addStep("fill",el,el.value);lastFocusedEl=null;lastFocusedValue="";}}

function onBlur(e){if(!isRecording||isUI(e.target))return;flushInput();}

function escXml(s){return(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;");}

function dedup(){var m={},o=[];steps.forEach(function(s){if(!m[s.xpath]){m[s.xpath]=s.objectId;o.push(s.xpath);}});return{m:m,o:o};}

function genXML(){var d=dedup(),L=['<?xml version="1.0" encoding="UTF-8"?>',"<class>",'    <screen screenID="'+escXml(screenName)+'">'];
  d.o.forEach(function(xp){L.push('        <object objectId="'+escXml(d.m[xp])+'">');L.push("            <objectProperty>xpath="+xp+"</objectProperty>");L.push("        </object>");L.push("");});
  L.push("    </screen>","</class>");return L.join("\n");}

function genGherkin(){var d=dedup(),sn=screenName,L=["Feature: Recorded Salesforce flow","","  @Recorded_Flow","  Scenario: Recorded steps on "+sn,"","    Given I have launched App"];
  steps.forEach(function(s){var id=d.m[s.xpath];
    switch(s.action){
      case"click":L.push('    And I click "'+id+'" on "'+sn+'" screen','    And I wait for ".1" mins');break;
      case"submit":L.push('    And I submit "'+id+'" on "'+sn+'" screen','    And I wait for ".2" mins');break;
      case"hover_click":L.push('    Then I mouse hover and click on "'+id+'" on "'+sn+'" screen','    And I wait for ".2" mins');break;
      case"fill":L.push('    And I enter "'+s.value+'" details in "'+id+'" on "'+sn+'" screen','    And I wait for ".1" mins');break;
      case"select":L.push('    And I select "'+s.value+'" from "'+id+'" dropdown using "visibleText" selection type on "'+sn+'" screen','    And I wait for ".1" mins');break;
      case"check":L.push('    And I click "'+id+'" on "'+sn+'" screen','    And I wait for ".1" mins');break;
      case"key":L.push('    And I hit "'+s.value+'" key on "'+sn+'" screen','    And I wait for ".1" mins');break;
    }});L.push("");return L.join("\n");}

function genStepDefs(){var u={};steps.forEach(function(s){u[s.action]=true;});
  var D={click:['@Then("^I click \\"(.*?)\\" on \\"(.*?)\\" screen$")','public void i_click_on_screen(String field, String screenName) {','    stepDefinitionHelperWebClassInstance.clickOnElementOnScreen(field, screenName);','}'],
    submit:['@Then("^I submit \\"(.*?)\\" on \\"(.*?)\\" screen$")','public void i_submit_on_screen(String field, String screenName) {','    stepDefinitionHelperWebClassInstance.submitOnScreen(field, screenName);','}'],
    hover_click:['@Then("^I mouse hover and click on \\"(.*?)\\" on \\"(.*?)\\" screen$")','public void i_mouse_hover_and_click_on_screen(String field, String screenName) {','    stepDefinitionHelperWebClassInstance.mouseHoverAndClickOnScreen(field, screenName);','}'],
    fill:['@Then("^I enter \\"(.*?)\\" details in \\"(.*?)\\" on \\"(.*?)\\" screen$")','public void i_enter_details_in_on_screen(String value, String field, String screenName) {','    stepDefinitionHelperWebClassInstance.enterDetailsOnScreen(value, field, screenName);','}'],
    select:['@Then("^I select \\"(.*?)\\" from \\"(.*?)\\" dropdown using \\"(.*?)\\" selection type on \\"(.*?)\\" screen$")','public void i_select_from_dropdown_using_selection_type_on_screen(String strOptionToSelect, String strDDName, String strSelectionType, String strScreenName) {','    stepDefinitionHelperWebClassInstance.selectFromDropdownUsingSelectionTypeOnScreen(strOptionToSelect, strDDName, strSelectionType, strScreenName);','}'],
    key:['@Then("^I hit \\"(.*?)\\" key on \\"(.*?)\\" screen$")','public void i_hit_key_on_screen(String keyName, String screenName) {','    stepDefinitionHelperWebClassInstance.hitKeyOnScreen(keyName, screenName);','}']};
  var L=["// @Then Step Definitions (StepDefinition.java)","// Add any missing ones to your class",""];
  Object.keys(D).forEach(function(k){if(u[k]||(k==="click"&&u.check)){L.push("");D[k].forEach(function(x){L.push(x);});}});
  L.push("",'@Then("^I wait for \\"(.*?)\\" mins$")','public void i_wait_for_mins(String mins) {','    stepDefinitionHelperWebClassInstance.waitForMins(mins);','}');
  return L.join("\n");}

function genHelpers(){var u={};steps.forEach(function(s){u[s.action]=true;});
  var L=["// Helper Methods (StepDefinitionHelperWeb.java)","// Add any missing ones to your helper class",""];
  if(u.click||u.check){L.push("public void clickOnElementOnScreen(String field, String screenName) {","    String[] objectPropertyArray = this.genGetLocator(field, screenName);","    String locatorValue = objectPropertyArray[1];","    WebElement element = DriverManagerThreadSafe.getDriver().findElement(By.xpath(locatorValue));","    element.click();","    Thread.sleep(1000);","}","");}
  if(u.submit){L.push("public void submitOnScreen(String field, String screenName) {","    String[] objectPropertyArray = this.genGetLocator(field, screenName);","    String locatorValue = objectPropertyArray[1];","    WebElement element = DriverManagerThreadSafe.getDriver().findElement(By.xpath(locatorValue));","    element.click();","    Thread.sleep(2000);","}","");}
  if(u.hover_click){L.push("public void mouseHoverAndClickOnScreen(String field, String screenName) {","    String[] objectPropertyArray = this.genGetLocator(field, screenName);","    String locatorValue = objectPropertyArray[1];","    Actions act = new Actions(DriverManagerThreadSafe.getDriver());","    WebElement element = DriverManagerThreadSafe.getDriver().findElement(By.xpath(locatorValue));","    act.moveToElement(element).click().build().perform();","    Thread.sleep(2000);","}","");}
  if(u.fill){L.push("public void enterDetailsOnScreen(String value, String field, String screenName) {","    String[] objectPropertyArray = this.genGetLocator(field, screenName);","    String locatorValue = objectPropertyArray[1];","    String data = this.getglobalOrDatajsonData(value);","    Actions act = new Actions(DriverManagerThreadSafe.getDriver());","    WebElement element = DriverManagerThreadSafe.getDriver().findElement(By.xpath(locatorValue));","    act.doubleClick(element).doubleClick(element).sendKeys(data).sendKeys(Keys.ENTER).build().perform();","    Thread.sleep(1000);","}","");}
  if(u.select){L.push("public void selectFromDropdownUsingSelectionTypeOnScreen(String strOptionToSelect, String strDDName, String strSelectionType, String strScreenName) {","    String[] objectPropertyArray = this.genGetLocator(strDDName, strScreenName);","    String locatorValue = objectPropertyArray[1];","    WebElement element = DriverManagerThreadSafe.getDriver().findElement(By.xpath(locatorValue));","    new Select(element).selectByVisibleText(strOptionToSelect);","    Thread.sleep(1000);","}","");}
  if(u.key){L.push("public void hitKeyOnScreen(String keyName, String screenName) {","    WebElement activeEl = DriverManagerThreadSafe.getDriver().switchTo().activeElement();","    if (keyName.equalsIgnoreCase(\"ENTER\")) activeEl.sendKeys(Keys.ENTER);","    else if (keyName.equalsIgnoreCase(\"TAB\")) activeEl.sendKeys(Keys.TAB);","    else if (keyName.equalsIgnoreCase(\"ESCAPE\")) activeEl.sendKeys(Keys.ESCAPE);","    Thread.sleep(1000);","}","");}
  return L.join("\n");}

function escH(s){var d=document.createElement("div");d.textContent=s;return d.innerHTML;}
function cpTxt(t){if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(t).then(function(){alert("Copied!");});}else{var a=document.createElement("textarea");a.value=t;document.body.appendChild(a);a.select();document.execCommand("copy");document.body.removeChild(a);alert("Copied!");}}

function showOut(){
  var xml=genXML(),ghk=genGherkin(),sd=genStepDefs(),hm=genHelpers();
  var ps="background:#2d2d2d;padding:10px;overflow:auto;white-space:pre-wrap;max-height:200px;border-radius:4px;",
      bs="cursor:pointer;padding:3px 10px;font-size:11px;background:#455a64;color:#fff;border:none;border-radius:3px;margin-left:8px;";
  var h='<div id="'+OID+'" style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#1e1e1e;color:#d4d4d4;padding:20px;border-radius:8px;width:88%;max-width:950px;max-height:92%;overflow:auto;z-index:999999;font-family:monospace;font-size:12px;box-shadow:0 4px 20px rgba(0,0,0,0.5);">';
  h+='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;"><strong style="font-size:14px;">'+steps.length+" steps | "+screenName+'</strong><button id="xr-close" style="cursor:pointer;padding:4px 12px;">Close</button></div>';
  h+='<p><b>1. XML (BBCRM.xml)</b><button class="xr-cp" data-t="xml" style="'+bs+'">Copy</button></p><pre style="'+ps+'">'+escH(xml)+"</pre>";
  h+='<p><b>2. Gherkin (.feature)</b><button class="xr-cp" data-t="ghk" style="'+bs+'">Copy</button></p><pre style="'+ps+'">'+escH(ghk)+"</pre>";
  h+='<p><b>3. @Then (StepDefinition.java)</b><button class="xr-cp" data-t="sd" style="'+bs+'">Copy</button></p><pre style="'+ps+'">'+escH(sd)+"</pre>";
  h+='<p><b>4. Helpers (StepDefinitionHelperWeb.java)</b><button class="xr-cp" data-t="hm" style="'+bs+'">Copy</button></p><pre style="'+ps+'">'+escH(hm)+"</pre>";
  h+='</div><div id="'+BID+'" style="position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:999998;"></div>';
  document.body.insertAdjacentHTML("beforeend",h);
  var cm={xml:xml,ghk:ghk,sd:sd,hm:hm};
  document.querySelectorAll(".xr-cp").forEach(function(b){b.onclick=function(e){e.stopPropagation();cpTxt(cm[b.getAttribute("data-t")]);};});
  document.getElementById("xr-close").onclick=closeOut;document.getElementById(BID).onclick=closeOut;}

function closeOut(){var o=document.getElementById(OID),b=document.getElementById(BID);if(o)o.remove();if(b)b.remove();}

function attachListeners(){
  document.addEventListener("click",onClick,true);document.addEventListener("keydown",onKey,true);
  document.addEventListener("focusin",onFocus,true);document.addEventListener("change",onChange,true);
  document.addEventListener("blur",onBlur,true);}

function setRecUI(){
  document.getElementById("xr-st").textContent="REC";document.getElementById("xr-st").style.background="#d32f2f";
  document.getElementById("xr-go").disabled=true;document.getElementById("xr-sp").disabled=false;document.getElementById("xr-un").disabled=false;
  var ni=document.getElementById("xr-scr");if(ni)ni.value=screenName;
  updateCount();}

function startRec(){
  if(isRecording)return;var ni=document.getElementById("xr-scr");
  if(ni&&ni.value.trim())screenName=ni.value.trim();
  steps=[];stepIndex=0;usedObjIds={};lastFocusedEl=null;lastFocusedValue="";isRecording=true;
  attachListeners();setRecUI();saveState();}

function detachListeners(){
  document.removeEventListener("click",onClick,true);document.removeEventListener("keydown",onKey,true);
  document.removeEventListener("focusin",onFocus,true);document.removeEventListener("change",onChange,true);
  document.removeEventListener("blur",onBlur,true);}

function stopRec(){
  if(!isRecording)return;flushInput();isRecording=false;
  detachListeners();clearState();
  document.getElementById("xr-st").textContent="Stopped";document.getElementById("xr-st").style.background="#388e3c";
  document.getElementById("xr-go").disabled=false;document.getElementById("xr-sp").disabled=true;document.getElementById("xr-un").disabled=true;
  if(steps.length>0)showOut();else alert("No steps recorded.");}

var bS="cursor:pointer;padding:6px 14px;color:#fff;border:none;border-radius:4px;font-size:12px;font-weight:600;";
var ph='<div id="'+PID+'" style="position:fixed;top:12px;right:12px;background:#263238;color:#eceff1;padding:14px 16px;border-radius:10px;font-family:sans-serif;font-size:13px;z-index:999997;box-shadow:0 2px 12px rgba(0,0,0,0.4);cursor:move;min-width:175px;">'+
  '<div style="font-weight:bold;margin-bottom:6px;font-size:14px;">XPath Recorder v4</div>'+
  '<span id="xr-st" style="display:inline-block;padding:2px 10px;border-radius:4px;background:#555;font-size:11px;letter-spacing:1px;">Stopped</span>'+
  '<div id="xr-cnt" style="margin:6px 0;font-size:12px;">Steps: 0</div>'+
  '<div style="margin-bottom:10px;"><label style="font-size:11px;opacity:0.7;">Screen ID</label><br>'+
  '<input id="xr-scr" type="text" value="RecordedScreen" style="width:150px;padding:4px 8px;font-size:12px;border-radius:4px;border:1px solid #546e7a;background:#37474f;color:#eceff1;margin-top:2px;"></div>'+
  '<button id="xr-go" style="'+bS+'background:#4caf50;margin-right:4px;">Start</button>'+
  '<button id="xr-sp" style="'+bS+'background:#f44336;margin-right:4px;" disabled>Stop</button>'+
  '<button id="xr-un" style="'+bS+'background:#ff9800;font-size:11px;padding:6px 8px;" disabled title="Undo last step">Undo</button>'+
  "</div>";
document.body.insertAdjacentHTML("beforeend",ph);
document.getElementById("xr-go").onclick=startRec;
document.getElementById("xr-sp").onclick=stopRec;
document.getElementById("xr-un").onclick=function(e){e.stopPropagation();undoStep();};

var panel=document.getElementById(PID),drag=false,dx=0,dy=0;
panel.addEventListener("mousedown",function(e){if(e.target.tagName==="BUTTON"||e.target.tagName==="INPUT")return;drag=true;dx=e.clientX-panel.getBoundingClientRect().left;dy=e.clientY-panel.getBoundingClientRect().top;});
document.addEventListener("mousemove",function(e){if(!drag)return;panel.style.left=(e.clientX-dx)+"px";panel.style.top=(e.clientY-dy)+"px";panel.style.right="auto";});
document.addEventListener("mouseup",function(){drag=false;});

window.__xpathRecorderActive=true;

var wasRecording=loadState();
if(wasRecording){
  isRecording=true;attachListeners();setRecUI();
  console.log("[Rec] Resumed recording after navigation. "+steps.length+" steps so far. Screen: "+screenName);
}else{
  console.log("XPath Recorder v4 loaded. Set Screen ID -> Start -> interact -> Stop.");
}
})();
