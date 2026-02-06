// Template management system for meeting agendas
// Handles storage, retrieval, and preset configurations

const STORAGE_KEY = "mtg_agenda_templates_v1";

// Predefined starter templates
const PRESET_TEMPLATES = {
  league_annual: {
    name: "Annual League Meeting",
    items: [
      { title: "Opening Remarks & Roll Call", durationSec: 300, notes: "Welcome members, verify attendance" },
      { title: "Review Previous Season", durationSec: 600, notes: "Highlights, statistics, champion recognition" },
      { title: "Rule Changes Discussion", durationSec: 900, notes: "Proposed modifications to league rules" },
      { title: "Budget & Fees Review", durationSec: 600, notes: "Financial overview and upcoming expenses" },
      { title: "Schedule Announcement", durationSec: 300, notes: "Key dates for next season" },
      { title: "Open Forum", durationSec: 600, notes: "Questions and general discussion" },
      { title: "Closing & Next Steps", durationSec: 180, notes: "Summary of decisions and action items" }
    ]
  },
  draft_lottery: {
    name: "Draft Lottery",
    items: [
      { title: "Welcome & Lottery Rules", durationSec: 240, notes: "Explain lottery mechanics and order" },
      { title: "Verify Standings", durationSec: 180, notes: "Confirm final season standings" },
      { title: "Lottery Draw", durationSec: 600, notes: "Conduct randomized draft order selection" },
      { title: "Announce Draft Order", durationSec: 300, notes: "Official draft pick announcement" },
      { title: "Draft Date Scheduling", durationSec: 240, notes: "Set date/time for actual draft" },
      { title: "Q&A", durationSec: 300, notes: "Answer questions about draft process" }
    ]
  },
  trade_summit: {
    name: "Trade Summit",
    items: [
      { title: "Trade Window Overview", durationSec: 180, notes: "Review trade deadline and restrictions" },
      { title: "Active Trade Proposals", durationSec: 900, notes: "Discuss pending trade offers" },
      { title: "Voting on Contested Trades", durationSec: 600, notes: "League vote on disputed transactions" },
      { title: "Waiver Wire Discussion", durationSec: 300, notes: "Process and priority order" },
      { title: "Future Considerations", durationSec: 300, notes: "Multi-year deals and future picks" },
      { title: "Trade Deadline Reminder", durationSec: 120, notes: "Final deadline announcement" }
    ]
  }
};

export function fetchStoredTemplates() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    return JSON.parse(stored);
  } catch (err) {
    console.error("Failed to load templates:", err);
    return [];
  }
}

export function persistTemplate(templateName, agendaItems) {
  try {
    const existing = fetchStoredTemplates();
    const newTemplate = {
      id: `tpl_${Date.now()}`,
      name: templateName,
      items: agendaItems.map(item => ({
        title: item.title,
        durationSec: item.durationSec || 0,
        notes: item.notes || ""
      })),
      createdAt: new Date().toISOString()
    };
    
    const updated = [...existing, newTemplate];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    return newTemplate;
  } catch (err) {
    console.error("Failed to save template:", err);
    return null;
  }
}

export function removeTemplate(templateId) {
  try {
    const existing = fetchStoredTemplates();
    const filtered = existing.filter(t => t.id !== templateId);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    return true;
  } catch (err) {
    console.error("Failed to delete template:", err);
    return false;
  }
}

export function getPresetTemplate(presetKey) {
  return PRESET_TEMPLATES[presetKey] || null;
}

export function getAllPresets() {
  return Object.keys(PRESET_TEMPLATES).map(key => ({
    key,
    ...PRESET_TEMPLATES[key]
  }));
}

export function exportTemplateAsJSON(template) {
  return JSON.stringify(template, null, 2);
}

export function importTemplateFromJSON(jsonString) {
  try {
    const parsed = JSON.parse(jsonString);
    if (!parsed.name || !Array.isArray(parsed.items)) {
      throw new Error("Invalid template format");
    }
    return {
      id: `tpl_${Date.now()}`,
      name: parsed.name,
      items: parsed.items,
      createdAt: new Date().toISOString()
    };
  } catch (err) {
    console.error("Failed to import template:", err);
    return null;
  }
}
