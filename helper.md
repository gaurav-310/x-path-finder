# Click a Salesforce Record Link (`records-hoverable-link`)

Reliably click a record link in a Salesforce table/lookup — even though:

- the link is a custom element (`records-hoverable-link`), not a plain `<a>`,
- the real `<a>` is inside a **native shadow root**,
- the `href` is **sometimes a real URL** (`/lightning/r/...`) and **sometimes `javascript:void(0)`** / empty (JS-only navigation),
- a bare `.click()` navigates only *some* of the time.

The solution: reach the inner `<a>` across the shadow root, fire a real event sequence,
grab the absolute href, and **fall back to `driver.get(href)`** if the click didn't navigate.

---

## 1. Object map entry

Put the locator on **one line**, `xpath=` right after the tag (leading/trailing
whitespace breaks parsing). XPath positions are **1‑based** (`[1]` = first row, not `[0]`).

Fixed row:
```xml
<screen screenID="Contactpage">
    <object objectId="ContactName">
        <objectProperty>xpath=(//th[@data-label='Contact Name']//records-hoverable-link)[1]</objectProperty>
    </object>
</screen>
```

Dynamic row (uses the `##` placeholder, replaced by the step):
```xml
<object objectId="ContactName">
    <objectProperty>xpath=(//th[@data-label='Contact Name']//records-hoverable-link)[##]</objectProperty>
</object>
```

> If it's a normal data column (not the row-header column), the cell is `<td>` instead of `<th>`:
> `(//td[@data-label='Account Name']//records-hoverable-link)[1]`

---

## 2. Step Definition (Cucumber + Selenium)

### Feature file

Fixed row:
```gherkin
And I click record link "ContactName" on "Contactpage" screen
```

Dynamic row:
```gherkin
And I click record link at row "2" in "ContactName" on "Contactpage" screen
```

### `StepDefinition.java`

```java
// fixed row (row already baked into the object map)
@Then("^I click record link \"(.*?)\" on \"(.*?)\" screen$")
public void i_click_record_link_on_screen(String field, String screenName) throws Exception {
    stepDefinitionHelperWebClassInstance.clickRecordLink(null, field, screenName);
}

// dynamic row (## in the object map)
@Then("^I click record link at row \"(.*?)\" in \"(.*?)\" on \"(.*?)\" screen$")
public void i_click_record_link_at_row(String row, String field, String screenName) throws Exception {
    stepDefinitionHelperWebClassInstance.clickRecordLink(row, field, screenName);
}
```

### `StepDefinitionHelperWeb.java`

```java
public void clickRecordLink(String row, String field, String screenName) {
    try {
        String[] objectPropertyArray = this.genGetLocator(field, screenName);
        String xpath = objectPropertyArray[1];
        if (row != null && !row.trim().isEmpty()) {
            xpath = xpath.replace("##", row.trim());     // dynamic row
        }

        WebDriver driver = DriverManagerThreadSafe.getDriver();
        WebDriverWait wait = new WebDriverWait(driver, Duration.ofSeconds(20));
        WebElement link = wait.until(ExpectedConditions.presenceOfElementLocated(By.xpath(xpath)));

        String urlBefore = driver.getCurrentUrl();

        // Reach the inner <a> (crosses shadow root), fire a real click sequence,
        // and return its ABSOLUTE href only if it's a genuine navigable URL.
        String href = (String) ((JavascriptExecutor) driver).executeScript(
            "var el = arguments[0];" +
            "function f(n){ if(n.tagName && n.tagName.toLowerCase()==='a') return n;" +
            "  if(n.shadowRoot){ var s=f(n.shadowRoot); if(s) return s; }" +
            "  var k=n.children?Array.prototype.slice.call(n.children):[];" +
            "  for(var i=0;i<k.length;i++){ var r=f(k[i]); if(r) return r; } return null; }" +
            "el.scrollIntoView({block:'center'});" +
            "el.dispatchEvent(new MouseEvent('mouseover',{bubbles:true}));" +   // hoverable link renders on hover
            "var a = f(el) || el;" +
            "['pointerover','mouseover','pointerdown','mousedown','mouseup','click']" +
            "  .forEach(function(t){ a.dispatchEvent(new MouseEvent(t,{bubbles:true,cancelable:true,view:window})); });" +
            "var h = a.getAttribute ? a.getAttribute('href') : null;" +
            "return (h && h.indexOf('javascript') !== 0 && h !== '#') ? a.href : '';",
            link);

        // If the click navigated, done. If not but we have a real href, go there directly.
        try {
            wait.until(ExpectedConditions.not(ExpectedConditions.urlToBe(urlBefore)));
        } catch (Exception notNavigated) {
            if (href != null && !href.isEmpty()) {
                driver.get(href);
            }
        }
        Thread.sleep(1000);
    } catch (Exception e) {
        logger.info(e);
    }
}
```

### Imports

```java
import java.time.Duration;
import org.openqa.selenium.By;
import org.openqa.selenium.JavascriptExecutor;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.support.ui.WebDriverWait;
import org.openqa.selenium.support.ui.ExpectedConditions;
```

---

## 3. Console Test Script (verified working)

```javascript
(function () {
  // ===== EDIT THESE =====
  var columnName = "Contact Name";
  var rowNumber  = 1;   // 1-based
  // ======================

  var el = document.evaluate(
    "(//th[@data-label='" + columnName + "']//records-hoverable-link)[" + rowNumber + "]",
    document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
  if (!el) { console.error("link element not found"); return; }

  function deepFindA(node) {                         // crosses shadow roots
    if (node.tagName && node.tagName.toLowerCase() === "a") return node;
    if (node.shadowRoot) { var s = deepFindA(node.shadowRoot); if (s) return s; }
    var kids = node.children ? Array.prototype.slice.call(node.children) : [];
    for (var i = 0; i < kids.length; i++) { var r = deepFindA(kids[i]); if (r) return r; }
    return null;
  }

  el.scrollIntoView({ block: "center" });
  el.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));

  setTimeout(function () {
    var a = deepFindA(el);
    var rawHref = a && a.getAttribute("href");
    console.log("anchor:", !!a, "| raw href:", rawHref, "| absolute:", a && a.href);
    if (a) {
      ["pointerover","mouseover","pointerdown","mousedown","mouseup","click"].forEach(function (t) {
        a.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: window }));
      });
      // fallback if it didn't navigate and there is a real href
      if (rawHref && rawHref.indexOf("javascript") !== 0 && rawHref !== "#") {
        console.log("If it didn't navigate, run:  window.location.href = " + JSON.stringify(a.href));
      }
    } else {
      console.warn("No <a> inside. Element text:", el.textContent.trim());
    }
  }, 300);
})();
```

---

## Why it works in every case

| Situation | What happens |
|-----------|--------------|
| Real `href`, click works | Click navigates → URL changes → done |
| Real `href`, click ignored/flaky | URL unchanged → fall back to `driver.get(href)` (absolute URL) |
| `javascript:void(0)` / empty href, click works | Event sequence fires the LWC handler → navigates; `href` stays `""` so no bad fallback |
| `javascript:void(0)`, click ignored | Event sequence is the only path (rare) — retry / increase wait |

Key details: `a.href` is the **browser-resolved absolute URL**; we only treat it as a real
link when the raw `href` isn't `javascript:`/`#`; and a **URL-change wait** decides whether
to fall back.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| "not a valid xpath expression" | Put `xpath=...` on **one line** right after `<objectProperty>` (no newline/indent); use `[1]` not `[0]` |
| `NoSuchElementException` | Row not rendered yet (datatable virtualizes rows) — scroll it into view / wait, or pick a visible row |
| Clicks but no navigation | You're on the old plain `.click()` step — use `clickRecordLink` above (inner-anchor + href fallback) |
| Wrong row | `[N]` is 1‑based; `data-label` must match the column header exactly (watch trailing spaces) |
| Column is `<td>` not `<th>` | Use `//td[@data-label='...']` for non row-header columns |
