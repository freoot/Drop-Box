import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export function pythonFetch(url, init = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('python3', [fileURLToPath(new URL('./python-fetch.py', import.meta.url))], { stdio: ['pipe', 'pipe', 'pipe'] });
    const chunks = [];
    let size = 0;
    const abort = () => { child.kill(); reject(new DOMException('Request timed out', 'TimeoutError')); };
    if (init.signal?.aborted) { abort(); return; }
    init.signal?.addEventListener('abort', abort, { once: true });
    child.stdout.on('data', chunk => {
      size += chunk.length;
      if (size > 151 * 1024 * 1024) { child.kill(); reject(new Error('response_too_large')); }
      else chunks.push(chunk);
    });
    child.stderr.resume();
    child.on('error', () => reject(new Error('system_network_unavailable')));
    child.stdin.on('error', () => reject(new Error('system_network_unavailable')));
    child.on('close', code => {
      init.signal?.removeEventListener('abort', abort);
      if (code !== 0) { reject(new Error('upstream_transport_failed')); return; }
      try {
        const bytes = Buffer.concat(chunks);
        const split = bytes.indexOf(10);
        const meta = JSON.parse(bytes.subarray(0, split).toString());
        resolve(new Response([204, 205, 304].includes(meta.status) ? null : bytes.subarray(split + 1), meta));
      } catch { reject(new Error('invalid_transport_response')); }
    });
    child.stdin.end(JSON.stringify({ url, method: init.method || 'GET', headers: Object.fromEntries(new Headers(init.headers)), body: init.body }));
  });
}

export function networkFetch(env) {
  return env.AI_HTTP_TRANSPORT === 'python' ? pythonFetch : fetch;
}
