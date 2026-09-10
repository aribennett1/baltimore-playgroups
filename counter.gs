const WEBSITE_VISITOR_COUNT_KEY = "website_visitor_count";

function doGet(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(5000);

  try {
    const props = PropertiesService.getScriptProperties();
    const currentCount = Number(props.getProperty(WEBSITE_VISITOR_COUNT_KEY) || 0);
    const nextCount = currentCount + 1;

    props.setProperty(WEBSITE_VISITOR_COUNT_KEY, String(nextCount));

    return ContentService
      .createTextOutput(JSON.stringify({ count: nextCount }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}
