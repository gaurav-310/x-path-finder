# Dropdown → Select Option by Position

Open a dropdown and pick an option **by its number** (1‑based), passing only **two values**:

| Input | Meaning | Example |
|-------|---------|---------|
| `dropdownXpath` | XPath of the dropdown trigger | `//button[@aria-label='Select Address' and @role='combobox']` |
| `optionNo`      | Which option to pick (1‑based) | `2` |

---

## Two ways to do it

| Method | How it works | Reliability on Salesforce |
|--------|--------------|---------------------------|
| **A. Keyboard (recommended)** | Open dropdown → press **Arrow Down × N** → **Enter** | **Best.** No DOM searching, so shadow DOM doesn't matter. |
| **B. Click the option** | Open dropdown → find the Nth `role="option"` → click it | Works, but options live in shadow DOM and can be hard to find. |

> **Why keyboard is better:** Salesforce renders dropdown options inside (synthetic/native)
> shadow DOM. Searching for them with `querySelector` fails, and even XPath can miss
> native shadow. Keyboard navigation sidesteps all of that — you just move the highlight
> and press Enter.

---

# Method A — Keyboard (recommended)

**Idea:** open → `ArrowDown` N times (each press moves the highlight down one) → `Enter`.

## A1. Step Definition (Cucumber + Selenium)

### Feature file

```gherkin
And I open dropdown "//button[@aria-label='Select Address' and @role='combobox']" and select option number "2"
```

### `StepDefinition.java`

```java
@Then("^I open dropdown \"(.*?)\" and select option number \"(.*?)\"$")
public void i_open_dropdown_and_select_option_number(String dropdownXpath, String optionNo) throws Exception {
    stepDefinitionHelperWebClassInstance.selectDropdownOptionByPosition(dropdownXpath, optionNo);
}
```

### `StepDefinitionHelperWeb.java`

```java
public void selectDropdownOptionByPosition(String dropdownXpath, String optionNo) throws Exception {
    WebDriver driver = DriverManagerThreadSafe.getDriver();
    WebDriverWait wait = new WebDriverWait(driver, Duration.ofSeconds(20));

    // 1. Open the dropdown
    WebElement dropdown = wait.until(ExpectedConditions.elementToBeClickable(By.xpath(dropdownXpath)));
    dropdown.click();
    Thread.sleep(800);

    // 2. Move the highlight down N times, then select with Enter
    int pos = Integer.parseInt(optionNo.trim());
    Actions actions = new Actions(driver);
    for (int i = 0; i < pos; i++) {
        actions.sendKeys(Keys.ARROW_DOWN);
    }
    actions.sendKeys(Keys.ENTER);
    actions.build().perform();
    Thread.sleep(800);
}
```

> **Off by one?** If it lands one above/below the option you wanted, change the loop to
> `i <= pos` or `i < pos - 1`. Some comboboxes pre‑highlight the first option on open.

### Imports

```java
import java.time.Duration;
import org.openqa.selenium.By;
import org.openqa.selenium.Keys;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.interactions.Actions;
import org.openqa.selenium.support.ui.WebDriverWait;
import org.openqa.selenium.support.ui.ExpectedConditions;
```

## A2. Console Test Script (keyboard)

> Note: the browser console fires **synthetic** key events (`isTrusted=false`), which
> Lightning sometimes ignores. So this console preview may not always drive the keyboard
> navigation — but the **Selenium step above sends real keys and works**. Use the console
> script mainly to confirm the dropdown opens.

```javascript
(function () {
  // ===== EDIT THESE TWO =====
  var dropdownXpath = "//button[@aria-label='Select Address' and @role='combobox']";
  var optionNo = 2;   // 1-based
  // ==========================

  function xpOne(p){return document.evaluate(p,document,null,XPathResult.FIRST_ORDERED_NODE_TYPE,null).singleNodeValue;}
  function key(el, k, code, kc){
    ["keydown","keypress","keyup"].forEach(function(t){
      el.dispatchEvent(new KeyboardEvent(t,{key:k,code:code,keyCode:kc,which:kc,bubbles:true,cancelable:true}));
    });
  }

  var dd = xpOne(dropdownXpath);
  if(!dd){ console.error("Dropdown NOT found:", dropdownXpath); return; }
  dd.scrollIntoView({block:"center"});
  dd.focus();
  dd.click();                         // open
  console.log("Opened. Sending ArrowDown x" + optionNo + " then Enter...");

  setTimeout(function(){
    var target = document.activeElement || dd;
    for (var i = 0; i < optionNo; i++) key(target, "ArrowDown", "ArrowDown", 40);
    setTimeout(function(){
      key(target, "Enter", "Enter", 13);
      console.log("Done (if nothing changed, the console's synthetic keys were ignored — the Selenium step will still work).");
    }, 250);
  }, 600);
})();
```

---

# Method B — Click the option (fallback)

Use this only if keyboard navigation isn't an option. It opens the dropdown, scopes to
*that* dropdown's own listbox (via `aria-controls`), and clicks the Nth option.

## B1. `StepDefinitionHelperWeb.java`

```java
public void selectDropdownOptionByPositionClick(String dropdownXpath, String optionNo) throws Exception {
    WebDriver driver = DriverManagerThreadSafe.getDriver();
    WebDriverWait wait = new WebDriverWait(driver, Duration.ofSeconds(20));

    WebElement dropdown = wait.until(ExpectedConditions.elementToBeClickable(By.xpath(dropdownXpath)));
    dropdown.click();
    Thread.sleep(1000);

    // scope to THIS dropdown's listbox
    String listboxId = dropdown.getAttribute("aria-controls");
    if (listboxId == null || listboxId.isEmpty()) {
        try {
            listboxId = dropdown.findElement(By.xpath(".//*[@aria-controls]")).getAttribute("aria-controls");
        } catch (Exception ignore) {}
    }
    String optionXpath = (listboxId != null && !listboxId.isEmpty())
        ? "(//*[@id='" + listboxId + "']//*[@role='option'])[" + optionNo + "]"
        : "(" + dropdownXpath + "/ancestor-or-self::*[contains(@class,'slds-combobox') or @role='combobox'][1]//*[@role='option'])[" + optionNo + "]";

    WebElement option = wait.until(ExpectedConditions.elementToBeClickable(By.xpath(optionXpath)));
    option.click();
    Thread.sleep(1000);
}
```

## B2. Console Test Script (click)

```javascript
(function () {
  var dropdownXpath = "//button[@aria-label='Select Address' and @role='combobox']";
  var optionNo = 2;
  var MAX_WAIT_MS = 4000, STEP = 200;

  function xpOne(p){return document.evaluate(p,document,null,XPathResult.FIRST_ORDERED_NODE_TYPE,null).singleNodeValue;}
  function visible(el){var r=el.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(el).visibility!=="hidden";}
  function clickEl(el){
    ["pointerdown","mousedown","pointerup","mouseup","click"].forEach(function(t){
      el.dispatchEvent(new MouseEvent(t,{bubbles:true,cancelable:true,view:window}));
    });
  }
  // collect options via XPath (synthetic shadow) AND shadow-root walk (native shadow)
  function collectOptions(){
    var out=[];
    try{
      var s=document.evaluate("//*[@role='option'] | //lightning-base-combobox-item",
        document,null,XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,null);
      for(var i=0;i<s.snapshotLength;i++) out.push(s.snapshotItem(i));
    }catch(e){}
    (function walk(root){
      var els=root.querySelectorAll?root.querySelectorAll("*"):[];
      for(var i=0;i<els.length;i++){
        var el=els[i], role=el.getAttribute&&el.getAttribute("role");
        var isOpt = role==="option" || (el.tagName&&el.tagName.toLowerCase()==="lightning-base-combobox-item");
        if(isOpt && out.indexOf(el)<0) out.push(el);
        if(el.shadowRoot) walk(el.shadowRoot);
      }
    })(document);
    return out;
  }

  var dd=xpOne(dropdownXpath);
  if(!dd){console.error("Dropdown NOT found:",dropdownXpath);return;}
  console.log("Opening dropdown...");
  clickEl(dd);

  var waited=0;
  (function poll(){
    var opts=collectOptions().filter(visible);
    if(opts.length){
      console.log("Visible options ("+opts.length+"):", opts.map(function(o){return o.textContent.trim();}));
      var opt=opts[optionNo-1];
      if(!opt){console.error("Only "+opts.length+" options; #"+optionNo+" doesn't exist.");return;}
      console.log("Clicking #"+optionNo+" -> \""+opt.textContent.trim()+"\"");
      clickEl(opt);
      console.log("Done.");
      return;
    }
    waited+=STEP;
    if(waited>=MAX_WAIT_MS){console.error("No options appeared after "+MAX_WAIT_MS+"ms - dropdown likely didn't open.");return;}
    setTimeout(poll,STEP);
  })();
})();
```

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Keyboard lands on wrong option (off by one) | Change the loop to `i <= pos` or `i < pos - 1` (depends on whether the combobox pre‑highlights option 1 on open) |
| Console keyboard preview does nothing | Expected — synthetic key events are often ignored. The **Selenium** step (real keys) still works. |
| Method B shows **0 options** | Options are in shadow DOM. Prefer **Method A (keyboard)**. The Method B console script already walks shadow roots + uses XPath. |
| Two dropdowns → wrong one | Make sure `dropdownXpath` is **unique** (verify with the XPath Finder — it should say `unique`). Keyboard method only acts on the dropdown you opened/focused. |
| Dropdown doesn't open | Confirm `dropdownXpath` is the **clickable trigger** (XPath Finder shows `[clickable]`) |
| `optionNo` indexing | It's **1‑based** — first option is `1`, not `0` |
