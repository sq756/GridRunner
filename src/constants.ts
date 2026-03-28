export const AGENT_SCRIPT = `
(function() {
  window.TerAgent = {
    extractDOM: function() {
      const selectors = "a, button, input, textarea, [role='button'], [onclick]";
      const elements = document.querySelectorAll(selectors);
      let idCounter = 1;
      let markdown = "### CYBER_DOM_SNAPSHOT\\n\\n";
      elements.forEach(el => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        if (rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0") {
          const id = idCounter++;
          el.setAttribute("data-ter-id", id);
          const tag = el.tagName.toLowerCase();
          const text = (el.innerText || el.value || el.placeholder || el.ariaLabel || "").trim().substring(0, 40);
          markdown += "- [" + tag.toUpperCase() + " #" + id + ": " + (text || "NODE") + "]\\n";
        }
      });
      return markdown;
    },
    scrapeData: function(selector = "h3") {
      const elements = document.querySelectorAll(selector);
      let results = [];
      elements.forEach(el => {
        const text = el.innerText.trim();
        if (text) results.push(text);
      });
      return "### SCRAPED_DATA (" + selector + ")\\n\\n" + results.join("\\n");
    },
    click: function(id) {
      const el = document.querySelector("[data-ter-id='" + id + "']");
      if (el) { el.click(); return "OK"; }
      return "FAIL";
    },
    type: function(id, text) {
      const el = document.querySelector("[data-ter-id='" + id + "']");
      if (el) {
        el.focus();
        el.value = text;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return "OK";
      }
      return "FAIL";
    }
  };
})();
`;
