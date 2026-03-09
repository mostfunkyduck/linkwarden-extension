browser.runtime.onMessage.addListener(async (message) => {
  const { type, apiBase, apiKey } = message;

  const headers = {
    "Content-Type": "application/json",
    "Accept": "application/json",
    "Authorization": `Bearer ${apiKey}`
  };

  try {
    if (type === "FETCH") {
      const res = await fetch(`${apiBase}${message.path}`, { headers });
      const json = await res.json();
      return { ok: res.ok, status: res.status, response: json.response };
    }

    if (type === "SEND_URL") {
      const res = await fetch(`${apiBase}/api/v1/links`, {
        method: "POST",
        headers,
        body: JSON.stringify(message.payload),
        redirect: "follow"
      });
      const text = await res.text();
      return { ok: res.ok, status: res.status, body: text };
    }

    if (type === "CREATE_COLLECTION") {
      const res = await fetch(`${apiBase}/api/v1/collections`, {
        method: "POST",
        headers,
        body: JSON.stringify({ name: message.name })
      });
      const json = await res.json();
      return { ok: res.ok, status: res.status, response: json.response };
    }
  } catch (err) {
    return { ok: false, error: err.message };
  }
});
