import { sendJson, type ApiRequest, type ApiResponse } from "./_utils";

export default function handler(request: ApiRequest, response: ApiResponse) {
  sendJson(response, 404, { error: `API route not found: ${request.method ?? "GET"} ${request.url ?? "/"}` });
}
