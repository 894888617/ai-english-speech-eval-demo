import crypto from "node:crypto";

export function createXfyunAuthUrl(endpoint: string, apiKey: string, apiSecret: string, date = new Date()) {
  if (!apiKey || !apiSecret) throw new Error("XFYUN API key or secret is empty");
  const url = new URL(endpoint);
  const requestLine = `GET ${url.pathname}${url.search || ""} HTTP/1.1`;
  const rfc1123Date = date.toUTCString();
  const signatureOrigin = `host: ${url.host}\ndate: ${rfc1123Date}\n${requestLine}`;
  const signature = crypto.createHmac("sha256", apiSecret).update(signatureOrigin, "utf8").digest("base64");
  const authorizationOrigin = `api_key="${apiKey}", algorithm="hmac-sha256", headers="host date request-line", signature="${signature}"`;
  url.searchParams.set("authorization", Buffer.from(authorizationOrigin, "utf8").toString("base64"));
  url.searchParams.set("date", rfc1123Date);
  url.searchParams.set("host", url.host);
  return url.toString();
}
