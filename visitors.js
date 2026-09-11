const COUNTER_URL = "https://script.google.com/macros/s/AKfycbyP6m2qtTv24mPj9g74pR9Ur0E8SluHeynF134J3_ZYSmnfRXgkmQcMA2m1auTZZtt2/exec";

async function loadVisitorCount() {
  const countEl = document.getElementById("visitor-count");

  try {
    const data = await (window.visitorCountPromise || fetchVisitorCount());
    countEl.textContent = Number(data.count || 0).toLocaleString();
  } catch (error) {
    countEl.textContent = "Unavailable";
    console.error(error);
  }
}

async function fetchVisitorCount() {
  const url = new URL(COUNTER_URL);
  url.searchParams.set("readOnly", "true");
  const response = await fetch(url, { cache: "no-store" });
  return response.json();
}

loadVisitorCount();
