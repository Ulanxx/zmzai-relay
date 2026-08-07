import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { request } from "node:https";
import { Readable } from "node:stream";

function isPublicIpv4(address: string): boolean {
  const parts = address.split(".").map(Number);
  const [a, b] = parts;
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && (b === 0 || b === 168)) return false;
  if (a === 198 && (b === 18 || b === 19 || b === 51)) return false;
  if (a === 203 && b === 0) return false;
  return true;
}

function isPublicIpv6(address: string): boolean {
  const value = address.toLowerCase();
  if (value === "::" || value === "::1" || value.startsWith("fe8") || value.startsWith("fe9") || value.startsWith("fea") || value.startsWith("feb")) return false;
  if (value.startsWith("fc") || value.startsWith("fd") || value.startsWith("ff") || value.startsWith("2001:db8")) return false;
  const mapped = value.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  return mapped ? isPublicIpv4(mapped[1]) : true;
}

function isPublicAddress(address: string, family: number): boolean {
  return family === 4 ? isPublicIpv4(address) : family === 6 && isPublicIpv6(address);
}

export class UnsafeUpstreamUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeUpstreamUrlError";
  }
}

async function resolvePublicUrl(input: string | URL) {
  const url = new URL(input);
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new UnsafeUpstreamUrlError("渠道地址必须是无认证信息的 HTTPS 公网地址");
  }

  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((entry) => !isPublicAddress(entry.address, entry.family))) {
    throw new UnsafeUpstreamUrlError("渠道地址不能解析到内网或保留地址");
  }

  return { url, address: addresses[0] };
}

/** Validate an address before it is stored, then pin outbound connections to the validated IP. */
export async function validateUpstreamUrl(input: string): Promise<void> {
  await resolvePublicUrl(input);
}

export async function safeUpstreamFetch(input: string | URL, init: RequestInit = {}): Promise<Response> {
  const { url, address } = await resolvePublicUrl(input);
  const body = typeof init.body === "string" || init.body instanceof Uint8Array ? init.body : undefined;
  if (init.body && body === undefined) throw new UnsafeUpstreamUrlError("渠道请求体格式不受支持");

  return new Promise<Response>((resolve, reject) => {
    const req = request(url, {
      method: init.method ?? "GET",
      headers: Object.fromEntries(new Headers(init.headers).entries()),
      lookup: (_host, options, callback) => {
        // Node 20 may request all addresses for connection racing. The callback
        // shape must match that mode or net.connect rejects the pinned address.
        if (options && typeof options === "object" && "all" in options && options.all) callback(null, [address]);
        else callback(null, address.address, address.family);
      },
      signal: init.signal ?? undefined,
    }, (res) => {
      const headers = new Headers();
      for (const [name, value] of Object.entries(res.headers)) {
        if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(", ") : value);
      }
      resolve(new Response(Readable.toWeb(res) as ReadableStream<Uint8Array>, { status: res.statusCode ?? 502, headers }));
    });
    req.once("error", reject);
    if (body) req.write(body);
    req.end();
  });
}
