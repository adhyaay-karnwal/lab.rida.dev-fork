export const notFoundResponse = (message = "Not found") =>
  Response.json({ error: message }, { status: 404 });

export const badRequestResponse = (message: string) =>
  Response.json({ error: message }, { status: 400 });

export const serviceUnavailableResponse = (message: string) =>
  Response.json({ error: message }, { status: 503 });
