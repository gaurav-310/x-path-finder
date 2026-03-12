# Salesforce XPath Recorder & Finder

Browser bookmarklet tools that speed up Salesforce Lightning UI automation. Click elements to get stable XPaths, or record entire flows to generate XML page objects, Gherkin steps, and Java step definitions — all in one click.

**No extensions. No npm. No installation.** Just a local Python server and two bookmarks.

---

## What's inside

| Tool | What it does |
|------|-------------|
| **XPath Finder** | Click any element → get 5 ranked XPath suggestions with uniqueness validation |
| **XPath Recorder** | Record a full flow → get XML (BBCRM.xml), Gherkin (.feature), @Then step definitions, and helper methods |

---

## Quick start

### 1. Clone and serve

```bash
git clone https://github.com/YOUR_USERNAME/salesforce-xpath-recorder.git
cd salesforce-xpath-recorder
python3 -m http.server 8765
```

### 2. Create two bookmarks

**XPath Finder** — set bookmark URL to:

```
javascript:(function(){if(window.__xf)return;var s=document.createElement('script');s.src='http://localhost:8765/xpath-finder.js';document.body.appendChild(s);})()
```

**XPath Recorder** — set bookmark URL to:

```
javascript:(function(){if(window.__xpathRecorderActive)return;var s=document.createElement('script');s.src='http://localhost:8765/xpath-recorder.js';document.body.appendChild(s);})();
```

### 3. Use

Open any Salesforce Lightning page and click either bookmark.

---

## XPath Finder

Click any element → see up to 5 XPaths ranked by stability.

![XPath Finder popup showing ranked suggestions with unique/hits badges](https://via.placeholder.com/600x200?text=XPath+Finder+Popup)

**How to use:**

1. Click the bookmark → red `XPath: OFF` button appears at bottom-right
2. Click it to toggle **ON** (turns green)
3. Click any element on the page → popup appears near the cursor
4. Each XPath shows a badge:
   - 🟢 **unique** — matches exactly 1 element (use this one)
   - 🔴 **N hits** — matches multiple elements (too broad)
5. Click any XPath or the Copy button to copy to clipboard
6. Click the toggle button again to turn **OFF**

**XPath strategies (Salesforce-optimized):**

| Element | XPath pattern |
|---------|--------------|
| Button with span | `//span[text()='Save']/parent::button` |
| Link with data-label | `//a[text()='People'][@data-label='People']` |
| Link with text | `//a[text()='Company']` |
| Input via data-label wrapper | `//*[@data-label='Account Name']//input` |
| Input via aria-label wrapper | `//*[@aria-label='Search']//input` |
| Radio button | `//span[text()='Personal']/ancestor::label//input[@type='radio']` |
| Checkbox | `//span[text()='Active']/ancestor::label//input[@type='checkbox']` |
| By data-id | `//*[@data-id='someField']` |
| By title | `//a[@title='Accounts']` |
| Via parent with id | `//*[@id='navBar']//a` |

**Shadow DOM:** Automatically detected with a warning and Selenium instructions.

---

## XPath Recorder

Record your entire test flow and get ready-to-paste code for 4 layers of the framework.

**How to use:**

1. Click the bookmark → floating panel appears (top-right) with Start / Stop / Undo
2. Type the **Screen ID** (e.g. `Homepage`, `CalendarPage`)
3. Click **Start** → interact with the page:
   - Click buttons, links, tabs
   - Type into text fields, date fields
   - Select from dropdowns
   - Check/uncheck checkboxes
   - Press Enter, Tab, Escape
4. Click **Stop** → popup shows 4 sections of generated code

**What it captures:**

| You do this | Gherkin output |
|-------------|---------------|
| Click a button | `And I click "btn_Save" on "Homepage" screen` |
| Click Save/OK in a modal | `And I submit "btn_OK" on "Homepage" screen` |
| Hover + click (menus) | `Then I mouse hover and click on "btn_Edit" on "Homepage" screen` |
| Type into a field | `And I enter "Acme Corp" details in "input_AccountName" on "Homepage" screen` |
| Select from dropdown | `And I select "Active" from "dd_Status" dropdown using "visibleText" selection type on "Homepage" screen` |
| Check a checkbox | `And I click "chk_SendEmail" on "Homepage" screen` |
| Press Enter | `And I hit "ENTER" key on "Homepage" screen` |

**4 outputs generated:**

### 1. XML (paste into BBCRM.xml)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<class>
    <screen screenID="Homepage">
        <object objectId="btn_New">
            <objectProperty>xpath=//span[text()='New']/parent::button</objectProperty>
        </object>

        <object objectId="input_AccountName">
            <objectProperty>xpath=//*[@data-label='Account Name']//input</objectProperty>
        </object>

        <object objectId="btn_Save">
            <objectProperty>xpath=//span[text()='Save']/parent::button</objectProperty>
        </object>
    </screen>
</class>
```

### 2. Gherkin (paste into .feature file)

```gherkin
Feature: Recorded Salesforce flow

  @Recorded_Flow
  Scenario: Recorded steps on Homepage

    Given I have launched App
    And I click "btn_New" on "Homepage" screen
    And I wait for ".1" mins
    And I enter "Acme Corp" details in "input_AccountName" on "Homepage" screen
    And I wait for ".1" mins
    And I click "btn_Save" on "Homepage" screen
    And I wait for ".1" mins
```

### 3. @Then Step Definitions (StepDefinition.java)

```java
@Then("^I click \"(.*?)\" on \"(.*?)\" screen$")
public void i_click_on_screen(String field, String screenName) {
    stepDefinitionHelperWebClassInstance.clickOnElementOnScreen(field, screenName);
}

@Then("^I enter \"(.*?)\" details in \"(.*?)\" on \"(.*?)\" screen$")
public void i_enter_details_in_on_screen(String value, String field, String screenName) {
    stepDefinitionHelperWebClassInstance.enterDetailsOnScreen(value, field, screenName);
}
```

### 4. Helper Methods (StepDefinitionHelperWeb.java)

```java
public void clickOnElementOnScreen(String field, String screenName) {
    String[] objectPropertyArray = this.genGetLocator(field, screenName);
    String locatorValue = objectPropertyArray[1];
    WebElement element = DriverManagerThreadSafe.getDriver().findElement(By.xpath(locatorValue));
    element.click();
    Thread.sleep(1000);
}
```

---

## Features

- **Salesforce-optimized XPaths** — uses `data-label`, `aria-label`, `span[text()]/parent::button` patterns instead of fragile positional paths
- **objectId prefixes** — auto-generated: `btn_`, `lnk_`, `input_`, `dd_`, `chk_`, `rdo_`, `txt_`
- **XPath validation** — each suggestion is tested on the page with match count
- **Deduplication** — each unique XPath appears once in XML even if used multiple times
- **Visual feedback** — recorded elements flash red, finder highlights in blue
- **Undo button** — remove the last recorded step
- **Page navigation** — recording survives page changes (saved to sessionStorage)
- **New tab handling** — `target="_blank"` links forced to same tab during recording
- **Shadow DOM** — detected with warning and Selenium piercing instructions
- **Dynamic ID filtering** — IDs with 4+ consecutive digits are skipped as unstable

---

## Verify XPaths in Chrome Console

```javascript
// Find elements matching an XPath
$x("//span[text()='Save']/parent::button")

// Count matches
$x("//span[text()='Save']/parent::button").length

// Highlight the element
$x("//span[text()='Save']/parent::button")[0].style.border = "3px solid red"

// Click it
$x("//span[text()='Save']/parent::button")[0].click()
```

---

## Files

| File | Purpose |
|------|---------|
| `xpath-finder.js` | XPath Finder — click element, get 5 suggestions |
| `xpath-recorder.js` | XPath Recorder — record flow, get XML + Gherkin + Java |
| `BOOKMARK-URL.txt` | Recorder bookmark URL (copy into bookmark) |
| `XPATH-FINDER-BOOKMARK.txt` | Finder bookmark URL (copy into bookmark) |
| `SETUP.txt` | Detailed step-by-step setup instructions |
| `STACKOVERFLOW-POST.md` | Full writeup with code for sharing |
| `bookmarklet.html` | Helper page to build bookmarks visually |
| `recorder-loader.html` | Helper page to view and copy the recorder script |

---

## Requirements

- Python 3 (for `python3 -m http.server`)
- Any modern browser (Chrome, Edge, Firefox)
- No npm, no extensions, no installation

---

## Problem this solves

Writing Salesforce Lightning UI automation is slow. For every test step, engineers manually inspect elements in DevTools, figure out stable XPaths, write XML page objects, Gherkin steps, and Java step definitions. A single 15-step scenario takes 15-30 minutes.

**With these tools: 30 seconds.** Record the flow once, copy the generated code.

---

## License

MIT
