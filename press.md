# Press a Key (Enter / Tab / Escape / Arrows / …)

A reusable step to press a keyboard key — either on the **currently focused**
element or on a **specific field** first. Supports Enter, Tab, Escape, Space,
Backspace, Delete, all Arrow keys, Home/End, Page Up/Down (and is easy to extend).

| Input | Meaning | Example |
|-------|---------|---------|
| `keyName` | The key to press | `ENTER`, `TAB`, `ESCAPE`, `ARROW_DOWN` |
| `field` *(optional)* | Field key in the object map to focus first | `searchBox` |
| `screenName` | Screen name in the object map | `OpportunityPage` |

---

## Gherkin

```gherkin
# press the key on whatever is currently focused (e.g. right after typing)
And I press "ENTER" key on "OpportunityPage" screen

# focus a specific field first, then press the key on it
And I press "ENTER" key in "searchBox" on "OpportunityPage" screen
```

---

## StepDefinition.java

```java
// press a key on the currently focused element
@Then("^I press \"(.*?)\" key on \"(.*?)\" screen$")
public void i_press_key_on_screen(String keyName, String screenName) throws Exception {
    stepDefinitionHelperWebClassInstance.pressKey(keyName, null, screenName);
}

// focus a specific field, then press the key on it
@Then("^I press \"(.*?)\" key in \"(.*?)\" on \"(.*?)\" screen$")
public void i_press_key_in_field_on_screen(String keyName, String field, String screenName) throws Exception {
    stepDefinitionHelperWebClassInstance.pressKey(keyName, field, screenName);
}
```

---

## StepDefinitionHelperWeb.java

```java
public void pressKey(String keyName, String field, String screenName) {
    try {
        WebDriver driver = DriverManagerThreadSafe.getDriver();

        // pick the target: a specific field, else the currently focused element
        WebElement target;
        if (field != null && !field.trim().isEmpty()) {
            String[] objectPropertyArray = this.genGetLocator(field, screenName);
            target = driver.findElement(By.xpath(objectPropertyArray[1]));
            target.click();                 // ensure it has focus
        } else {
            target = driver.switchTo().activeElement();
        }

        Keys key = resolveKey(keyName);
        if (key != null) {
            target.sendKeys(key);
        } else {
            target.sendKeys(keyName);       // fall back: send literal text
        }
        Thread.sleep(500);

        htmlReporterWebClassInstance.reportStep(
            "<b>" + screenName + "</b> Press key",
            "Pressed <b>" + keyName + "</b>" + (field != null ? " in <b>" + field + "</b>" : " on focused element"),
            true, true);

    } catch (Exception e) {
        Logger.info("Exception in pressKey: " + e);
        htmlReporterWebClassInstance.reportStep(
            "<b>" + screenName + "</b> Press key",
            "<p style='color:red;'>Unable to press " + keyName + " :: " + e + "</p>",
            false, true);
    }
}

/** Map a friendly key name to a Selenium Keys value (null = not a special key). */
private Keys resolveKey(String name) {
    if (name == null) return null;
    switch (name.trim().toUpperCase()) {
        case "ENTER":
        case "RETURN":      return Keys.ENTER;
        case "TAB":         return Keys.TAB;
        case "ESCAPE":
        case "ESC":         return Keys.ESCAPE;
        case "SPACE":       return Keys.SPACE;
        case "BACKSPACE":   return Keys.BACK_SPACE;
        case "DELETE":
        case "DEL":         return Keys.DELETE;
        case "ARROW_DOWN":
        case "DOWN":        return Keys.ARROW_DOWN;
        case "ARROW_UP":
        case "UP":          return Keys.ARROW_UP;
        case "ARROW_LEFT":
        case "LEFT":        return Keys.ARROW_LEFT;
        case "ARROW_RIGHT":
        case "RIGHT":       return Keys.ARROW_RIGHT;
        case "HOME":        return Keys.HOME;
        case "END":         return Keys.END;
        case "PAGE_UP":     return Keys.PAGE_UP;
        case "PAGE_DOWN":   return Keys.PAGE_DOWN;
        default:            return null;
    }
}
```

---

## Imports

```java
import org.openqa.selenium.By;
import org.openqa.selenium.Keys;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
```

---

## Notes

- **`I press "ENTER" key on "Screen" screen`** → sends the key to whatever is
  currently focused (e.g. right after typing in a search box).
- **`I press "ENTER" key in "field" on "Screen" screen`** → clicks/focuses that
  field first, then presses the key on it.
- Supported keys: `ENTER`/`RETURN`, `TAB`, `ESCAPE`/`ESC`, `SPACE`, `BACKSPACE`,
  `DELETE`/`DEL`, `ARROW_UP/DOWN/LEFT/RIGHT` (or `UP/DOWN/LEFT/RIGHT`),
  `HOME`, `END`, `PAGE_UP`, `PAGE_DOWN`.
- Add more by extending the `resolveKey` switch.
- Any name not in the map is sent as **literal text**, so the same step can also
  type a string if needed.

---

## Console quick-test

```javascript
// focus an element, then dispatch Enter (use real keys in Selenium; this is just a preview)
var el = document.activeElement;
["keydown","keyup"].forEach(function(t){
  el.dispatchEvent(new KeyboardEvent(t,{key:"Enter",code:"Enter",keyCode:13,which:13,bubbles:true}));
});
console.log("dispatched Enter on", el.tagName);
```
> Note: console key events are synthetic; the **Selenium** `sendKeys` version
> sends real (trusted) keys and is what runs in your test.
