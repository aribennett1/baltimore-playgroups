const SPREADSHEET_ID = "1RRsvxa-ZRaJl5qBzeBgtCrh3HEvGUZ0BqYjkDwgkB9A";
const WORKBOOK_URL = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=xlsx`;
const COUNTER_URL = "https://script.google.com/macros/s/AKfycbyP6m2qtTv24mPj9g74pR9Ur0E8SluHeynF134J3_ZYSmnfRXgkmQcMA2m1auTZZtt2/exec";

const FALLBACK_SHEETS = [
  "Drop off babysitters",
  "Newborn 0-3 months",
  "Infants 3-16 months",
  "Toddlers 18-24 months",
  "2 Years",
  "3 Years",
  "4 Years",
];

const FIELD_ALIASES = {
  name: ["playgroup", "provider"],
  phone: ["number", "phone"],
  hours: ["hours"],
  location: ["location"],
  rate: ["rate/hr", "rate"],
  notes: ["notes", "note"],
};

const loadingEl = document.getElementById("loading");
const errorEl = document.getElementById("error");
const listEl = document.getElementById("daycare-list");

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        field += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && char === ",") {
      row.push(field);
      field = "";
      continue;
    }

    if (!inQuotes && (char === "\n" || char === "\r")) {
      if (char === "\r" && next === "\n") {
        i += 1;
      }
      row.push(field);
      if (row.some((value) => value.trim() !== "")) {
        rows.push(row);
      }
      row = [];
      field = "";
      continue;
    }

    field += char;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (row.some((value) => value.trim() !== "")) {
      rows.push(row);
    }
  }

  return rows;
}

function normalizeHeader(value) {
  return String(value || "")
    .replace(/<br\s*\/?>/gi, "")
    .trim()
    .toLowerCase();
}

function findColumn(headers, aliases) {
  return headers.findIndex((header) => aliases.includes(normalizeHeader(header)));
}

function cell(row, index) {
  if (index < 0) {
    return "";
  }
  return String(row[index] || "").trim();
}

function stripFieldLabel(value, label) {
  return value.replace(new RegExp(`^${label}\\s*`, "i"), "").trim();
}

function cleanItem(item) {
  return {
    name: stripFieldLabel(item.name, "Playgroup"),
    phone: stripFieldLabel(stripFieldLabel(item.phone, "Number"), "Phone"),
    hours: stripFieldLabel(item.hours, "Hours"),
    location: stripFieldLabel(item.location, "Location"),
    rate: stripFieldLabel(item.rate, "Rate/hr"),
    notes: stripFieldLabel(stripFieldLabel(item.notes, "Notes"), "Note"),
  };
}

async function fetchWithTimeout(url, timeout = 4500) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeout);

  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function rowsToSheet(sheetName, rows) {
  const headers = rows[0] || [];
  const columns = {
    name: findColumn(headers, FIELD_ALIASES.name),
    phone: findColumn(headers, FIELD_ALIASES.phone),
    hours: findColumn(headers, FIELD_ALIASES.hours),
    location: findColumn(headers, FIELD_ALIASES.location),
    rate: findColumn(headers, FIELD_ALIASES.rate),
    notes: findColumn(headers, FIELD_ALIASES.notes),
  };
  const hasHeaderRow = columns.name >= 0 || columns.phone >= 0;
  const dataRows = hasHeaderRow ? rows.slice(1) : rows;
  const resolvedColumns = hasHeaderRow
    ? columns
    : { name: 0, phone: 1, hours: 2, location: 3, rate: 4, notes: 5 };

  return {
    name: sheetName,
    rows: dataRows.map((row) => cleanItem({
      name: cell(row, resolvedColumns.name),
      phone: cell(row, resolvedColumns.phone),
      hours: cell(row, resolvedColumns.hours),
      location: cell(row, resolvedColumns.location),
      rate: cell(row, resolvedColumns.rate),
      notes: cell(row, resolvedColumns.notes),
    })).filter((item) => item.name || item.phone || item.hours || item.location || item.rate || item.notes),
  };
}

async function loadWorkbookSheets() {
  if (!window.XLSX) {
    throw new Error("The workbook parser did not load.");
  }

  const response = await fetchWithTimeout(WORKBOOK_URL, 10000);
  if (!response.ok) {
    throw new Error("Could not load the Google Sheet workbook.");
  }

  const workbook = window.XLSX.read(await response.arrayBuffer(), { type: "array" });
  return workbook.SheetNames.map((sheetName) => {
    const worksheet = workbook.Sheets[sheetName];
    const rows = window.XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      defval: "",
      raw: false,
    });

    return rowsToSheet(sheetName, rows);
  });
}

async function loadCsvSheet(sheetName) {
  const params = new URLSearchParams({
    tqx: "out:csv",
    sheet: sheetName,
  });
  const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?${params}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Could not load ${sheetName}`);
  }

  return rowsToSheet(sheetName, parseCsv(await response.text()));
}

async function loadFallbackSheets() {
  return Promise.all(FALLBACK_SHEETS.map(loadCsvSheet));
}

function createChevron() {
  const chevron = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  chevron.setAttribute("class", "chevron");
  chevron.setAttribute("viewBox", "0 0 24 24");
  chevron.setAttribute("aria-hidden", "true");
  chevron.innerHTML = '<path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>';
  return chevron;
}

function createDetail(label, value, type) {
  const wrapper = document.createElement("div");
  wrapper.className = "detail";

  const labelEl = document.createElement("span");
  labelEl.className = "label";
  labelEl.textContent = label;

  const valueEl = document.createElement("span");
  valueEl.className = "value";

  if (!value) {
    valueEl.classList.add("empty");
    valueEl.textContent = "Not listed";
  } else if (type === "phone") {
    const link = document.createElement("a");
    link.href = `tel:${value.replace(/[^\d+]/g, "")}`;
    link.textContent = value;
    valueEl.appendChild(link);
  } else {
    valueEl.textContent = value;
  }

  wrapper.append(labelEl, valueEl);
  return wrapper;
}

function createCard(item) {
  const card = document.createElement("article");
  card.className = "daycare-card";

  const header = document.createElement("div");
  header.className = "card-header";

  const provider = document.createElement("h3");
  provider.className = "provider";
  provider.textContent = item.name || "Unnamed playgroup";
  header.appendChild(provider);

  if (item.rate) {
    const rate = document.createElement("span");
    rate.className = "rate";
    rate.textContent = item.rate;
    header.appendChild(rate);
  }

  const details = document.createElement("div");
  details.className = "details";
  details.append(
    createDetail("Phone", item.phone, "phone"),
    createDetail("Hours", item.hours),
    createDetail("Location", item.location)
  );

  if (item.notes) {
    const notes = createDetail("Notes", item.notes);
    notes.classList.add("notes-detail");
    details.appendChild(notes);
  }

  card.append(header, details);
  return card;
}

function createSection(sheet, index) {
  const section = document.createElement("details");
  section.className = "age-section";
  section.open = index === 0;

  const summary = document.createElement("summary");
  summary.className = "age-summary";
  summary.appendChild(createChevron());

  const title = document.createElement("h2");
  title.className = "age-title";
  title.textContent = sheet.name;

  const count = document.createElement("span");
  count.className = "count";
  count.textContent = `${sheet.rows.length} ${sheet.rows.length === 1 ? "option" : "options"}`;

  summary.append(title, count);

  const cards = document.createElement("div");
  cards.className = "cards";
  sheet.rows.forEach((item) => cards.appendChild(createCard(item)));

  section.append(summary, cards);
  return section;
}

async function init() {
  try {
    let sheets;

    try {
      sheets = await loadWorkbookSheets();
    } catch (error) {
      console.warn("Using fallback sheet names.", error);
      sheets = await loadFallbackSheets();
    }

    sheets.forEach((sheet, index) => listEl.appendChild(createSection(sheet, index)));
    loadingEl.classList.add("hidden");
    listEl.classList.remove("hidden");
  } catch (error) {
    loadingEl.classList.add("hidden");
    errorEl.textContent = "Could not load the Google Sheet. Make sure the sheet is shared publicly or published to the web.";
    errorEl.classList.remove("hidden");
    console.error(error);
  }
}

function trackPageOpen() {
  fetch(COUNTER_URL, {
    method: "GET",
    mode: "no-cors",
    cache: "no-store",
  }).catch((error) => {
    console.warn("Could not track page open.", error);
  });
}

trackPageOpen();
init();
